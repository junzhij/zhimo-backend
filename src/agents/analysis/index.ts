import { AIService, createAIService, SummaryOptions, SummaryResult } from '../../services/aiService';
import { KnowledgeElement, StructuredText } from '../../types';
import { MongoClient, Db, Collection } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';

export interface AnalysisAgentConfig {
  aiService?: AIService;
  mongoUrl?: string;
  dbName?: string;
}

export class AnalysisAgent {
  private aiService: AIService;
  private db: Db | null = null;
  private knowledgeCollection: Collection<KnowledgeElement> | null = null;

  constructor(config: AnalysisAgentConfig = {}) {
    this.aiService = config.aiService || createAIService();
    
    if (config.mongoUrl && config.dbName) {
      this.initializeDatabase(config.mongoUrl, config.dbName);
    }
  }

  private async initializeDatabase(mongoUrl: string, dbName: string): Promise<void> {
    try {
      const client = new MongoClient(mongoUrl);
      await client.connect();
      this.db = client.db(dbName);
      this.knowledgeCollection = this.db.collection<KnowledgeElement>('knowledge_elements');
      console.log('Analysis Agent connected to MongoDB');
    } catch (error) {
      console.error('Failed to connect to MongoDB:', error);
      throw error;
    }
  }

  async generateSummary(
    documentId: string, 
    structuredText: StructuredText, 
    options: SummaryOptions
  ): Promise<KnowledgeElement> {
    try {
      // Combine all text content for summarization
      const fullText = this.extractFullText(structuredText);
      
      // Generate summary using AI service
      const summaryResult = await this.aiService.generateSummary(fullText, options);
      
      // Create knowledge element
      const knowledgeElement: KnowledgeElement = {
        document_id: documentId,
        agent_type: 'analysis',
        element_type: 'summary',
        content: {
          title: `${this.capitalizeFirst(options.style)} Summary (${options.length})`,
          body: summaryResult.summary,
          metadata: {
            summaryType: options.style,
            summaryLength: options.length,
            keyPoints: summaryResult.keyPoints,
            wordCount: summaryResult.wordCount,
            confidence: summaryResult.confidence,
            focus: options.focus,
            originalWordCount: structuredText.metadata.wordCount
          }
        },
        source_location: {
          section: 'document',
          page: 1,
          position: { start: 0, end: fullText.length }
        },
        created_at: new Date(),
        tags: this.generateSummaryTags(options, summaryResult)
      };

      // Store in database if available
      if (this.knowledgeCollection) {
        const result = await this.knowledgeCollection.insertOne(knowledgeElement);
        knowledgeElement._id = result.insertedId.toString();
      }

      return knowledgeElement;
    } catch (error) {
      console.error('Error generating summary:', error);
      throw new Error(`Failed to generate summary: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async generateMultipleSummaries(
    documentId: string,
    structuredText: StructuredText,
    summaryConfigs: SummaryOptions[]
  ): Promise<KnowledgeElement[]> {
    const summaries: KnowledgeElement[] = [];
    
    for (const config of summaryConfigs) {
      try {
        const summary = await this.generateSummary(documentId, structuredText, config);
        summaries.push(summary);
      } catch (error) {
        console.error(`Failed to generate ${config.style} ${config.length} summary:`, error);
        // Continue with other summaries even if one fails
      }
    }
    
    return summaries;
  }

  async generateSectionSummaries(
    documentId: string,
    structuredText: StructuredText,
    options: SummaryOptions
  ): Promise<KnowledgeElement[]> {
    const sectionSummaries: KnowledgeElement[] = [];
    
    for (let i = 0; i < structuredText.sections.length; i++) {
      const section = structuredText.sections[i];
      
      try {
        // Create a mini structured text for this section
        const sectionText: StructuredText = {
          title: section.heading,
          sections: [section],
          metadata: {
            wordCount: section.content.split(/\s+/).length,
            pageCount: 1
          }
        };
        
        const summaryResult = await this.aiService.generateSummary(
          this.extractFullText(sectionText), 
          { ...options, length: 'short' } // Force short summaries for sections
        );
        
        const knowledgeElement: KnowledgeElement = {
          document_id: documentId,
          agent_type: 'analysis',
          element_type: 'summary',
          content: {
            title: `Section Summary: ${section.heading}`,
            body: summaryResult.summary,
            metadata: {
              summaryType: options.style,
              summaryLength: 'short',
              keyPoints: summaryResult.keyPoints,
              wordCount: summaryResult.wordCount,
              confidence: summaryResult.confidence,
              sectionIndex: i,
              originalSectionWordCount: sectionText.metadata.wordCount
            }
          },
          source_location: {
            section: section.heading,
            page: 1,
            position: { sectionIndex: i }
          },
          created_at: new Date(),
          tags: ['section-summary', ...this.generateSummaryTags(options, summaryResult)]
        };

        if (this.knowledgeCollection) {
          const result = await this.knowledgeCollection.insertOne(knowledgeElement);
          knowledgeElement._id = result.insertedId.toString();
        }

        sectionSummaries.push(knowledgeElement);
      } catch (error) {
        console.error(`Failed to generate summary for section "${section.heading}":`, error);
        // Continue with other sections
      }
    }
    
    return sectionSummaries;
  }

  private extractFullText(structuredText: StructuredText): string {
    let fullText = structuredText.title + '\n\n';
    
    for (const section of structuredText.sections) {
      fullText += section.heading + '\n';
      fullText += section.content + '\n\n';
      
      if (section.subsections) {
        for (const subsection of section.subsections) {
          fullText += subsection.heading + '\n';
          fullText += subsection.content + '\n\n';
        }
      }
    }
    
    return fullText.trim();
  }

  private generateSummaryTags(options: SummaryOptions, result: SummaryResult): string[] {
    const tags = [
      'summary',
      `${options.style}-summary`,
      `${options.length}-summary`
    ];
    
    if (options.focus) {
      tags.push(`focus-${options.focus.toLowerCase().replace(/\s+/g, '-')}`);
    }
    
    if (result.confidence > 0.8) {
      tags.push('high-confidence');
    } else if (result.confidence > 0.6) {
      tags.push('medium-confidence');
    } else {
      tags.push('low-confidence');
    }
    
    return tags;
  }

  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  async getSummariesByDocument(documentId: string): Promise<KnowledgeElement[]> {
    if (!this.knowledgeCollection) {
      throw new Error('Database not initialized');
    }
    
    return await this.knowledgeCollection.find({
      document_id: documentId,
      agent_type: 'analysis',
      element_type: 'summary'
    }).toArray();
  }

  async testAIConnection(): Promise<boolean> {
    return await this.aiService.testConnection();
  }
}