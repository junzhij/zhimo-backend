import { AnalysisAgent } from '../index';
import { StructuredText } from '../../../types';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';

// This test requires a real AI service connection
// Skip by default and run manually when needed
describe.skip('AnalysisAgent Integration Tests', () => {
  let mongoServer: MongoMemoryServer;
  let mongoClient: MongoClient;
  let analysisAgent: AnalysisAgent;

  beforeAll(async () => {
    // Start in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    
    mongoClient = new MongoClient(mongoUri);
    await mongoClient.connect();

    // Initialize Analysis Agent with real MongoDB
    analysisAgent = new AnalysisAgent({
      mongoUrl: mongoUri,
      dbName: 'test-zhimo'
    });
  });

  afterAll(async () => {
    if (mongoClient) {
      await mongoClient.close();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  const sampleStructuredText: StructuredText = {
    title: 'Introduction to Machine Learning',
    sections: [
      {
        heading: 'What is Machine Learning?',
        content: `Machine learning is a subset of artificial intelligence (AI) that provides systems the ability to automatically learn and improve from experience without being explicitly programmed. Machine learning focuses on the development of computer programs that can access data and use it to learn for themselves. The process of learning begins with observations or data, such as examples, direct experience, or instruction, in order to look for patterns in data and make better decisions in the future based on the examples that we provide.`
      },
      {
        heading: 'Types of Machine Learning',
        content: `There are several types of machine learning algorithms, each with its own strengths and applications. Supervised learning uses labeled training data to learn a mapping function from input variables to output variables. Unsupervised learning finds hidden patterns or intrinsic structures in input data without labeled examples. Reinforcement learning is about taking suitable action to maximize reward in a particular situation.`,
        subsections: [
          {
            heading: 'Supervised Learning',
            content: 'Supervised learning algorithms build a mathematical model of training data that contains both inputs and desired outputs. Common supervised learning algorithms include linear regression, logistic regression, decision trees, and neural networks.'
          },
          {
            heading: 'Unsupervised Learning',
            content: 'Unsupervised learning algorithms find patterns in data without reference to known or labeled outcomes. Clustering and dimensionality reduction are common unsupervised learning tasks.'
          }
        ]
      },
      {
        heading: 'Applications',
        content: 'Machine learning has numerous applications across various industries including healthcare, finance, transportation, and technology. Examples include medical diagnosis, fraud detection, autonomous vehicles, and recommendation systems.'
      }
    ],
    metadata: {
      wordCount: 250,
      pageCount: 3,
      language: 'en'
    }
  };

  it('should generate different types of summaries', async () => {
    const documentId = 'test-doc-ml-intro';

    // Test different summary configurations
    const summaryConfigs = [
      { length: 'short' as const, style: 'extractive' as const },
      { length: 'medium' as const, style: 'abstractive' as const },
      { length: 'long' as const, style: 'academic' as const },
      { length: 'medium' as const, style: 'bullet-points' as const }
    ];

    const summaries = await analysisAgent.generateMultipleSummaries(
      documentId,
      sampleStructuredText,
      summaryConfigs
    );

    expect(summaries).toHaveLength(4);

    // Verify each summary has expected properties
    summaries.forEach((summary, index) => {
      expect(summary.document_id).toBe(documentId);
      expect(summary.agent_type).toBe('analysis');
      expect(summary.element_type).toBe('summary');
      expect(summary.content.body).toBeTruthy();
      expect(summary.content.metadata.summaryLength).toBe(summaryConfigs[index].length);
      expect(summary.content.metadata.summaryType).toBe(summaryConfigs[index].style);
      expect(summary.tags).toContain('summary');
    });

    // Verify summaries are different lengths
    const shortSummary = summaries.find(s => s.content.metadata.summaryLength === 'short');
    const longSummary = summaries.find(s => s.content.metadata.summaryLength === 'long');
    
    expect(shortSummary!.content.metadata.wordCount).toBeLessThan(
      longSummary!.content.metadata.wordCount
    );
  }, 30000); // 30 second timeout for AI calls

  it('should generate section summaries', async () => {
    const documentId = 'test-doc-sections';

    const sectionSummaries = await analysisAgent.generateSectionSummaries(
      documentId,
      sampleStructuredText,
      { length: 'medium', style: 'abstractive' }
    );

    expect(sectionSummaries).toHaveLength(3); // Three main sections

    // Verify section-specific properties
    expect(sectionSummaries[0].content.title).toContain('What is Machine Learning?');
    expect(sectionSummaries[1].content.title).toContain('Types of Machine Learning');
    expect(sectionSummaries[2].content.title).toContain('Applications');

    sectionSummaries.forEach(summary => {
      expect(summary.tags).toContain('section-summary');
      expect(summary.content.metadata.sectionIndex).toBeDefined();
    });
  }, 30000);

  it('should store and retrieve summaries from database', async () => {
    const documentId = 'test-doc-storage';

    // Generate a summary
    await analysisAgent.generateSummary(
      documentId,
      sampleStructuredText,
      { length: 'medium', style: 'abstractive' }
    );

    // Retrieve summaries for the document
    const storedSummaries = await analysisAgent.getSummariesByDocument(documentId);

    expect(storedSummaries).toHaveLength(1);
    expect(storedSummaries[0].document_id).toBe(documentId);
    expect(storedSummaries[0]._id).toBeTruthy();
  }, 30000);

  it('should handle focused summaries', async () => {
    const documentId = 'test-doc-focused';

    const focusedSummary = await analysisAgent.generateSummary(
      documentId,
      sampleStructuredText,
      { 
        length: 'medium', 
        style: 'academic',
        focus: 'supervised learning algorithms'
      }
    );

    expect(focusedSummary.content.metadata.focus).toBe('supervised learning algorithms');
    expect(focusedSummary.tags).toContain('focus-supervised-learning-algorithms');
    
    // The summary should mention supervised learning more prominently
    expect(focusedSummary.content.body.toLowerCase()).toContain('supervised');
  }, 30000);

  it('should test AI connection', async () => {
    const connectionStatus = await analysisAgent.testAIConnection();
    expect(typeof connectionStatus).toBe('boolean');
    
    // If we have proper API key, connection should succeed
    if (process.env.OPENAI_API_KEY) {
      expect(connectionStatus).toBe(true);
    }
  });
});