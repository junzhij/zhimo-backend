/**
 * Example usage of the Analysis Agent for summary generation
 * This file demonstrates how to use the Analysis Agent to generate summaries
 */

import { AnalysisAgent } from './index';
import { StructuredText } from '../../types';

// Example structured text (would normally come from the Ingestion Agent)
const sampleDocument: StructuredText = {
  title: 'Introduction to Artificial Intelligence',
  sections: [
    {
      heading: 'What is AI?',
      content: `Artificial Intelligence (AI) refers to the simulation of human intelligence in machines that are programmed to think and learn like humans. The term may also be applied to any machine that exhibits traits associated with a human mind such as learning and problem-solving. AI systems are designed to perform tasks that typically require human intelligence, including visual perception, speech recognition, decision-making, and language translation.`
    },
    {
      heading: 'Types of AI',
      content: `There are several ways to categorize AI systems. One common approach divides AI into three categories: Narrow AI (or Weak AI), General AI (or Strong AI), and Superintelligence. Narrow AI is designed to perform a narrow task, such as facial recognition or internet searches. General AI would have the ability to understand, learn, and apply knowledge across a wide range of tasks at a level equal to human intelligence. Superintelligence refers to AI that surpasses human intelligence in all aspects.`,
      subsections: [
        {
          heading: 'Machine Learning',
          content: 'Machine Learning is a subset of AI that provides systems the ability to automatically learn and improve from experience without being explicitly programmed. It focuses on the development of computer programs that can access data and use it to learn for themselves.'
        }
      ]
    },
    {
      heading: 'Applications',
      content: 'AI has numerous applications across various industries including healthcare, finance, transportation, entertainment, and education. Examples include medical diagnosis systems, fraud detection algorithms, autonomous vehicles, recommendation systems, and intelligent tutoring systems.'
    }
  ],
  metadata: {
    wordCount: 200,
    pageCount: 2,
    language: 'en'
  }
};

async function demonstrateSummaryGeneration() {
  console.log('🤖 Analysis Agent Summary Generation Demo\n');

  // Initialize the Analysis Agent
  const analysisAgent = new AnalysisAgent();

  const documentId = 'demo-ai-intro-doc';

  try {
    // Test AI connection first
    console.log('Testing AI service connection...');
    const connectionStatus = await analysisAgent.testAIConnection();
    console.log(`Connection status: ${connectionStatus ? '✅ Connected' : '❌ Failed'}\n`);

    if (!connectionStatus) {
      console.log('⚠️  AI service connection failed. Please check your OPENAI_API_KEY environment variable.');
      return;
    }

    // Generate different types of summaries
    console.log('Generating multiple summary types...\n');

    const summaryConfigs = [
      { length: 'short' as const, style: 'extractive' as const },
      { length: 'medium' as const, style: 'abstractive' as const },
      { length: 'long' as const, style: 'academic' as const },
      { length: 'medium' as const, style: 'bullet-points' as const }
    ];

    const summaries = await analysisAgent.generateMultipleSummaries(
      documentId,
      sampleDocument,
      summaryConfigs
    );

    // Display results
    summaries.forEach((summary, index) => {
      const config = summaryConfigs[index];
      console.log(`📝 ${config.style.toUpperCase()} SUMMARY (${config.length.toUpperCase()})`);
      console.log('─'.repeat(50));
      console.log(summary.content.body);
      console.log(`\n📊 Metadata:`);
      console.log(`   • Word Count: ${summary.content.metadata.wordCount}`);
      console.log(`   • Confidence: ${(summary.content.metadata.confidence * 100).toFixed(1)}%`);
      console.log(`   • Key Points: ${summary.content.metadata.keyPoints.length}`);
      console.log(`   • Tags: ${summary.tags.join(', ')}`);
      console.log('\n' + '='.repeat(60) + '\n');
    });

    // Generate section summaries
    console.log('Generating section summaries...\n');
    const sectionSummaries = await analysisAgent.generateSectionSummaries(
      documentId,
      sampleDocument,
      { length: 'medium', style: 'abstractive' }
    );

    sectionSummaries.forEach((summary) => {
      console.log(`📑 ${summary.content.title}`);
      console.log('─'.repeat(30));
      console.log(summary.content.body);
      console.log('');
    });

    // Generate focused summary
    console.log('Generating focused summary on "machine learning"...\n');
    const focusedSummary = await analysisAgent.generateSummary(
      documentId,
      sampleDocument,
      { 
        length: 'medium', 
        style: 'academic',
        focus: 'machine learning and its applications'
      }
    );

    console.log(`🎯 FOCUSED SUMMARY`);
    console.log('─'.repeat(30));
    console.log(focusedSummary.content.body);
    console.log(`\nFocus: ${focusedSummary.content.metadata.focus}`);

  } catch (error) {
    console.error('❌ Error during demonstration:', error);
  }
}

// Export for use in other files
export { demonstrateSummaryGeneration, sampleDocument };

// Run the demo if this file is executed directly
if (require.main === module) {
  demonstrateSummaryGeneration().catch(console.error);
}