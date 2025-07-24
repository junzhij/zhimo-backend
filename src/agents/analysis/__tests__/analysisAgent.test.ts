import { AnalysisAgent } from '../index';
import { AIService, SummaryOptions } from '../../../services/aiService';
import { StructuredText, KnowledgeElement } from '../../../types';

// Mock the AI service
const mockAIService = {
  generateSummary: jest.fn(),
  testConnection: jest.fn()
} as unknown as jest.Mocked<AIService>;

// Mock MongoDB
jest.mock('mongodb', () => ({
  MongoClient: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    db: jest.fn().mockReturnValue({
      collection: jest.fn().mockReturnValue({
        insertOne: jest.fn().mockResolvedValue({ insertedId: 'mock-id' }),
        find: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([])
        })
      })
    })
  }))
}));

describe('AnalysisAgent', () => {
  let analysisAgent: AnalysisAgent;
  const mockDocumentId = 'test-doc-123';
  
  const mockStructuredText: StructuredText = {
    title: 'Test Document',
    sections: [
      {
        heading: 'Introduction',
        content: 'This is the introduction section with important information about the topic.'
      },
      {
        heading: 'Main Content',
        content: 'This section contains the main content of the document with detailed explanations and examples.',
        subsections: [
          {
            heading: 'Subsection 1',
            content: 'This is a subsection with additional details.'
          }
        ]
      }
    ],
    metadata: {
      wordCount: 50,
      pageCount: 2,
      language: 'en'
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    analysisAgent = new AnalysisAgent({ aiService: mockAIService });
  });

  describe('generateSummary', () => {
    it('should generate a summary successfully', async () => {
      const mockSummaryResult = {
        summary: 'This is a test summary of the document.',
        keyPoints: ['Point 1', 'Point 2', 'Point 3'],
        wordCount: 10,
        confidence: 0.85
      };

      mockAIService.generateSummary.mockResolvedValue(mockSummaryResult);

      const options: SummaryOptions = {
        length: 'medium',
        style: 'abstractive'
      };

      const result = await analysisAgent.generateSummary(mockDocumentId, mockStructuredText, options);

      expect(mockAIService.generateSummary).toHaveBeenCalledWith(
        expect.stringContaining('Test Document'),
        options
      );

      expect(result).toMatchObject({
        document_id: mockDocumentId,
        agent_type: 'analysis',
        element_type: 'summary',
        content: {
          title: 'Abstractive Summary (medium)',
          body: mockSummaryResult.summary,
          metadata: {
            summaryType: 'abstractive',
            summaryLength: 'medium',
            keyPoints: mockSummaryResult.keyPoints,
            wordCount: mockSummaryResult.wordCount,
            confidence: mockSummaryResult.confidence,
            originalWordCount: mockStructuredText.metadata.wordCount
          }
        }
      });

      expect(result.tags).toContain('summary');
      expect(result.tags).toContain('abstractive-summary');
      expect(result.tags).toContain('medium-summary');
      expect(result.tags).toContain('high-confidence');
    });

    it('should handle AI service errors gracefully', async () => {
      mockAIService.generateSummary.mockRejectedValue(new Error('AI service error'));

      const options: SummaryOptions = {
        length: 'short',
        style: 'extractive'
      };

      await expect(
        analysisAgent.generateSummary(mockDocumentId, mockStructuredText, options)
      ).rejects.toThrow('Failed to generate summary: AI service error');
    });

    it('should include focus area in metadata when provided', async () => {
      const mockSummaryResult = {
        summary: 'Focused summary',
        keyPoints: ['Focused point'],
        wordCount: 5,
        confidence: 0.9
      };

      mockAIService.generateSummary.mockResolvedValue(mockSummaryResult);

      const options: SummaryOptions = {
        length: 'short',
        style: 'academic',
        focus: 'machine learning'
      };

      const result = await analysisAgent.generateSummary(mockDocumentId, mockStructuredText, options);

      expect(result.content.metadata.focus).toBe('machine learning');
      expect(result.tags).toContain('focus-machine-learning');
    });
  });

  describe('generateMultipleSummaries', () => {
    it('should generate multiple summaries with different configurations', async () => {
      const mockSummaryResult = {
        summary: 'Test summary',
        keyPoints: ['Point 1'],
        wordCount: 5,
        confidence: 0.8
      };

      mockAIService.generateSummary.mockResolvedValue(mockSummaryResult);

      const summaryConfigs: SummaryOptions[] = [
        { length: 'short', style: 'extractive' },
        { length: 'medium', style: 'abstractive' },
        { length: 'long', style: 'academic' }
      ];

      const results = await analysisAgent.generateMultipleSummaries(
        mockDocumentId,
        mockStructuredText,
        summaryConfigs
      );

      expect(results).toHaveLength(3);
      expect(mockAIService.generateSummary).toHaveBeenCalledTimes(3);
      
      expect(results[0].content.metadata.summaryLength).toBe('short');
      expect(results[1].content.metadata.summaryLength).toBe('medium');
      expect(results[2].content.metadata.summaryLength).toBe('long');
    });

    it('should continue processing even if one summary fails', async () => {
      mockAIService.generateSummary
        .mockResolvedValueOnce({
          summary: 'First summary',
          keyPoints: ['Point 1'],
          wordCount: 5,
          confidence: 0.8
        })
        .mockRejectedValueOnce(new Error('Second summary failed'))
        .mockResolvedValueOnce({
          summary: 'Third summary',
          keyPoints: ['Point 3'],
          wordCount: 5,
          confidence: 0.8
        });

      const summaryConfigs: SummaryOptions[] = [
        { length: 'short', style: 'extractive' },
        { length: 'medium', style: 'abstractive' },
        { length: 'long', style: 'academic' }
      ];

      const results = await analysisAgent.generateMultipleSummaries(
        mockDocumentId,
        mockStructuredText,
        summaryConfigs
      );

      expect(results).toHaveLength(2); // Only successful summaries
      expect(results[0].content.body).toBe('First summary');
      expect(results[1].content.body).toBe('Third summary');
    });
  });

  describe('generateSectionSummaries', () => {
    it('should generate summaries for each section', async () => {
      const mockSummaryResult = {
        summary: 'Section summary',
        keyPoints: ['Section point'],
        wordCount: 3,
        confidence: 0.75
      };

      mockAIService.generateSummary.mockResolvedValue(mockSummaryResult);

      const options: SummaryOptions = {
        length: 'medium',
        style: 'abstractive'
      };

      const results = await analysisAgent.generateSectionSummaries(
        mockDocumentId,
        mockStructuredText,
        options
      );

      expect(results).toHaveLength(2); // Two sections in mockStructuredText
      expect(mockAIService.generateSummary).toHaveBeenCalledTimes(2);

      expect(results[0].content.title).toBe('Section Summary: Introduction');
      expect(results[1].content.title).toBe('Section Summary: Main Content');
      
      expect(results[0].tags).toContain('section-summary');
      expect(results[1].tags).toContain('section-summary');
    });
  });

  describe('confidence level tagging', () => {
    it('should tag high confidence summaries correctly', async () => {
      mockAIService.generateSummary.mockResolvedValue({
        summary: 'High confidence summary',
        keyPoints: ['Point'],
        wordCount: 5,
        confidence: 0.9
      });

      const result = await analysisAgent.generateSummary(
        mockDocumentId,
        mockStructuredText,
        { length: 'short', style: 'extractive' }
      );

      expect(result.tags).toContain('high-confidence');
    });

    it('should tag medium confidence summaries correctly', async () => {
      mockAIService.generateSummary.mockResolvedValue({
        summary: 'Medium confidence summary',
        keyPoints: ['Point'],
        wordCount: 5,
        confidence: 0.7
      });

      const result = await analysisAgent.generateSummary(
        mockDocumentId,
        mockStructuredText,
        { length: 'short', style: 'extractive' }
      );

      expect(result.tags).toContain('medium-confidence');
    });

    it('should tag low confidence summaries correctly', async () => {
      mockAIService.generateSummary.mockResolvedValue({
        summary: 'Low confidence summary',
        keyPoints: ['Point'],
        wordCount: 5,
        confidence: 0.5
      });

      const result = await analysisAgent.generateSummary(
        mockDocumentId,
        mockStructuredText,
        { length: 'short', style: 'extractive' }
      );

      expect(result.tags).toContain('low-confidence');
    });
  });

  describe('testAIConnection', () => {
    it('should return true when AI service connection is successful', async () => {
      mockAIService.testConnection.mockResolvedValue(true);

      const result = await analysisAgent.testAIConnection();

      expect(result).toBe(true);
      expect(mockAIService.testConnection).toHaveBeenCalled();
    });

    it('should return false when AI service connection fails', async () => {
      mockAIService.testConnection.mockResolvedValue(false);

      const result = await analysisAgent.testAIConnection();

      expect(result).toBe(false);
    });
  });
});