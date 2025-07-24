import { AIService, createAIService, SummaryOptions, SummaryResult, TopicModelingOptions, TopicModelingResult, StructureAnalysisOptions, DocumentStructureResult } from '../../services/aiService';
import { KnowledgeElement, StructuredText } from '../../types';
import { MongoClient, Db, Collection } from 'mongodb';

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

  async extractTopics(
    documentId: string,
    structuredText: StructuredText,
    options: TopicModelingOptions = {}
  ): Promise<KnowledgeElement[]> {
    try {
      const fullText = this.extractFullText(structuredText);
      const topicResult = await this.aiService.extractTopics(fullText, options);
      
      const knowledgeElements: KnowledgeElement[] = [];

      // Create knowledge elements for each topic
      for (const topic of topicResult.topics) {
        const topicElement: KnowledgeElement = {
          document_id: documentId,
          agent_type: 'analysis',
          element_type: 'topic',
          content: {
            title: topic.title,
            body: topic.description,
            metadata: {
              topicId: topic.id,
              keywords: topic.keywords,
              relevanceScore: topic.relevanceScore,
              documentCoverage: topic.documentCoverage,
              topicDistribution: topicResult.topicDistribution[topic.id] || 0,
              confidence: topicResult.confidence
            }
          },
          source_location: {
            section: 'document',
            page: 1,
            position: { topicId: topic.id }
          },
          created_at: new Date(),
          tags: [
            'topic',
            'topic-modeling',
            ...topic.keywords.map(k => `keyword-${k.toLowerCase().replace(/\s+/g, '-')}`),
            topic.relevanceScore > 0.7 ? 'high-relevance' : topic.relevanceScore > 0.4 ? 'medium-relevance' : 'low-relevance'
          ]
        };

        if (this.knowledgeCollection) {
          const result = await this.knowledgeCollection.insertOne(topicElement);
          topicElement._id = result.insertedId.toString();
        }

        knowledgeElements.push(topicElement);
      }

      // Create a knowledge element for main themes
      if (topicResult.mainThemes.length > 0) {
        const themesElement: KnowledgeElement = {
          document_id: documentId,
          agent_type: 'analysis',
          element_type: 'theme',
          content: {
            title: 'Main Themes',
            body: topicResult.mainThemes.join('; '),
            metadata: {
              themes: topicResult.mainThemes,
              themeCount: topicResult.mainThemes.length,
              topicCount: topicResult.topics.length,
              confidence: topicResult.confidence
            }
          },
          source_location: {
            section: 'document',
            page: 1,
            position: { type: 'themes' }
          },
          created_at: new Date(),
          tags: [
            'themes',
            'thematic-analysis',
            ...topicResult.mainThemes.map(t => `theme-${t.toLowerCase().replace(/\s+/g, '-')}`)
          ]
        };

        if (this.knowledgeCollection) {
          const result = await this.knowledgeCollection.insertOne(themesElement);
          themesElement._id = result.insertedId.toString();
        }

        knowledgeElements.push(themesElement);
      }

      return knowledgeElements;
    } catch (error) {
      console.error('Error extracting topics:', error);
      throw new Error(`Failed to extract topics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async extractSectionTopics(
    documentId: string,
    structuredText: StructuredText,
    options: TopicModelingOptions = {}
  ): Promise<KnowledgeElement[]> {
    const sectionTopics: KnowledgeElement[] = [];
    
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
        
        // Extract topics for this section with fewer topics
        const sectionOptions: TopicModelingOptions = {
          ...options,
          numTopics: Math.min(options.numTopics || 3, 3) // Max 3 topics per section
        };
        
        const topicResult = await this.aiService.extractTopics(
          this.extractFullText(sectionText),
          sectionOptions
        );
        
        // Create knowledge elements for section topics
        for (const topic of topicResult.topics) {
          const topicElement: KnowledgeElement = {
            document_id: documentId,
            agent_type: 'analysis',
            element_type: 'topic',
            content: {
              title: `${section.heading}: ${topic.title}`,
              body: topic.description,
              metadata: {
                topicId: topic.id,
                sectionIndex: i,
                sectionTitle: section.heading,
                keywords: topic.keywords,
                relevanceScore: topic.relevanceScore,
                documentCoverage: topic.documentCoverage,
                confidence: topicResult.confidence
              }
            },
            source_location: {
              section: section.heading,
              page: 1,
              position: { sectionIndex: i, topicId: topic.id }
            },
            created_at: new Date(),
            tags: [
              'topic',
              'section-topic',
              `section-${i}`,
              ...topic.keywords.map(k => `keyword-${k.toLowerCase().replace(/\s+/g, '-')}`)
            ]
          };

          if (this.knowledgeCollection) {
            const result = await this.knowledgeCollection.insertOne(topicElement);
            topicElement._id = result.insertedId.toString();
          }

          sectionTopics.push(topicElement);
        }
      } catch (error) {
        console.error(`Failed to extract topics for section "${section.heading}":`, error);
        // Continue with other sections
      }
    }
    
    return sectionTopics;
  }

  async getTopicsByDocument(documentId: string): Promise<KnowledgeElement[]> {
    if (!this.knowledgeCollection) {
      throw new Error('Database not initialized');
    }
    
    return await this.knowledgeCollection.find({
      document_id: documentId,
      agent_type: 'analysis',
      element_type: { $in: ['topic', 'theme'] }
    }).toArray();
  }

  async analyzeDocumentStructure(
    documentId: string,
    structuredText: StructuredText,
    options: StructureAnalysisOptions = {}
  ): Promise<KnowledgeElement[]> {
    try {
      const fullText = this.extractFullText(structuredText);
      const structureResult = await this.aiService.analyzeDocumentStructure(fullText, options);
      
      const knowledgeElements: KnowledgeElement[] = [];

      // Create knowledge element for logical structure
      const logicalStructureElement: KnowledgeElement = {
        document_id: documentId,
        agent_type: 'analysis',
        element_type: 'structure',
        content: {
          title: 'Document Logical Structure',
          body: this.formatLogicalStructure(structureResult.logicalStructure),
          metadata: {
            documentType: structureResult.structuralInsights.documentType,
            organizationPattern: structureResult.structuralInsights.organizationPattern,
            coherenceScore: structureResult.structuralInsights.coherenceScore,
            complexityLevel: structureResult.structuralInsights.complexityLevel,
            introduction: structureResult.logicalStructure.introduction,
            mainPoints: structureResult.logicalStructure.mainPoints,
            conclusions: structureResult.logicalStructure.conclusions,
            transitions: structureResult.logicalStructure.transitions,
            confidence: structureResult.confidence
          }
        },
        source_location: {
          section: 'document',
          page: 1,
          position: { type: 'logical-structure' }
        },
        created_at: new Date(),
        tags: [
          'structure',
          'logical-structure',
          `type-${structureResult.structuralInsights.documentType.toLowerCase().replace(/\s+/g, '-')}`,
          `pattern-${structureResult.structuralInsights.organizationPattern.toLowerCase().replace(/\s+/g, '-')}`,
          `complexity-${structureResult.structuralInsights.complexityLevel}`,
          structureResult.structuralInsights.coherenceScore > 0.7 ? 'high-coherence' : 
          structureResult.structuralInsights.coherenceScore > 0.4 ? 'medium-coherence' : 'low-coherence'
        ]
      };

      if (this.knowledgeCollection) {
        const result = await this.knowledgeCollection.insertOne(logicalStructureElement);
        logicalStructureElement._id = result.insertedId.toString();
      }

      knowledgeElements.push(logicalStructureElement);

      // Create knowledge elements for argument flow if requested
      if (options.includeArgumentFlow && structureResult.argumentFlow.length > 0) {
        const argumentFlowElement: KnowledgeElement = {
          document_id: documentId,
          agent_type: 'analysis',
          element_type: 'argument',
          content: {
            title: 'Argument Flow Analysis',
            body: this.formatArgumentFlow(structureResult.argumentFlow),
            metadata: {
              arguments: structureResult.argumentFlow,
              argumentCount: structureResult.argumentFlow.length,
              averageStrength: structureResult.argumentFlow.reduce((sum, arg) => sum + arg.strength, 0) / structureResult.argumentFlow.length,
              confidence: structureResult.confidence
            }
          },
          source_location: {
            section: 'document',
            page: 1,
            position: { type: 'argument-flow' }
          },
          created_at: new Date(),
          tags: [
            'argument',
            'argument-flow',
            'logical-analysis',
            ...structureResult.argumentFlow.map(arg => `arg-${arg.type}`)
          ]
        };

        if (this.knowledgeCollection) {
          const result = await this.knowledgeCollection.insertOne(argumentFlowElement);
          argumentFlowElement._id = result.insertedId.toString();
        }

        knowledgeElements.push(argumentFlowElement);
      }

      // Create knowledge element for mind map if requested
      if (options.includeMindMap && structureResult.mindMapData.length > 0) {
        const mindMapElement: KnowledgeElement = {
          document_id: documentId,
          agent_type: 'analysis',
          element_type: 'mindmap',
          content: {
            title: 'Document Mind Map',
            body: this.formatMindMap(structureResult.mindMapData),
            metadata: {
              mindMapNodes: structureResult.mindMapData,
              nodeCount: structureResult.mindMapData.length,
              maxDepth: Math.max(...structureResult.mindMapData.map(node => node.level)),
              rootNodes: structureResult.mindMapData.filter(node => node.level === 0).length,
              confidence: structureResult.confidence
            }
          },
          source_location: {
            section: 'document',
            page: 1,
            position: { type: 'mind-map' }
          },
          created_at: new Date(),
          tags: [
            'mindmap',
            'mind-map',
            'visual-structure',
            ...structureResult.mindMapData.map(node => `node-${node.nodeType}`)
          ]
        };

        if (this.knowledgeCollection) {
          const result = await this.knowledgeCollection.insertOne(mindMapElement);
          mindMapElement._id = result.insertedId.toString();
        }

        knowledgeElements.push(mindMapElement);
      }

      return knowledgeElements;
    } catch (error) {
      console.error('Error analyzing document structure:', error);
      throw new Error(`Failed to analyze document structure: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private formatLogicalStructure(structure: DocumentStructureResult['logicalStructure']): string {
    let formatted = '';
    
    if (structure.introduction.length > 0) {
      formatted += 'Introduction:\n';
      structure.introduction.forEach(item => formatted += `• ${item}\n`);
      formatted += '\n';
    }
    
    if (structure.mainPoints.length > 0) {
      formatted += 'Main Points:\n';
      structure.mainPoints.forEach(item => formatted += `• ${item}\n`);
      formatted += '\n';
    }
    
    if (structure.conclusions.length > 0) {
      formatted += 'Conclusions:\n';
      structure.conclusions.forEach(item => formatted += `• ${item}\n`);
      formatted += '\n';
    }
    
    if (structure.transitions.length > 0) {
      formatted += 'Transitions:\n';
      structure.transitions.forEach(item => formatted += `• ${item}\n`);
    }
    
    return formatted.trim();
  }

  private formatArgumentFlow(argumentFlow: DocumentStructureResult['argumentFlow']): string {
    let formatted = 'Argument Flow Analysis:\n\n';
    
    argumentFlow.forEach(arg => {
      formatted += `${arg.id.toUpperCase()} (${arg.type}): ${arg.content}\n`;
      formatted += `  Section: ${arg.position.section}\n`;
      formatted += `  Strength: ${(arg.strength * 100).toFixed(0)}%\n`;
      if (arg.connections.length > 0) {
        formatted += `  Connected to: ${arg.connections.join(', ')}\n`;
      }
      formatted += '\n';
    });
    
    return formatted.trim();
  }

  private formatMindMap(mindMapData: DocumentStructureResult['mindMapData']): string {
    let formatted = 'Mind Map Structure:\n\n';
    
    // Sort by level and order
    const sortedNodes = mindMapData.sort((a, b) => {
      if (a.level !== b.level) return a.level - b.level;
      return a.position.order - b.position.order;
    });
    
    sortedNodes.forEach(node => {
      const indent = '  '.repeat(node.level);
      formatted += `${indent}${node.title} (${node.nodeType})\n`;
      if (node.content !== node.title) {
        formatted += `${indent}  ${node.content}\n`;
      }
    });
    
    return formatted.trim();
  }

  async getStructureAnalysisByDocument(documentId: string): Promise<KnowledgeElement[]> {
    if (!this.knowledgeCollection) {
      throw new Error('Database not initialized');
    }
    
    return await this.knowledgeCollection.find({
      document_id: documentId,
      agent_type: 'analysis',
      element_type: { $in: ['structure', 'argument', 'mindmap'] }
    }).toArray();
  }

  async testAIConnection(): Promise<boolean> {
    return await this.aiService.testConnection();
  }
}