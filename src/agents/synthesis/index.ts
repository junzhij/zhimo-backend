import { notebookModel, NotebookWithComposition } from '../../models/notebookModel';
import { annotationModel } from '../../models/annotationModel';
import { mongoConnection } from '../../database/mongodb';
import { KnowledgeElement, Annotation } from '../../types';
import { Logger } from '../../utils/logger';

export interface CompiledNotebookContent {
  title: string;
  description?: string;
  sections: CompiledSection[];
  metadata: {
    totalElements: number;
    compiledAt: Date;
    userId: string;
    notebookId: string;
  };
}

export interface CompiledSection {
  title: string;
  content: string;
  elementType: 'knowledge_element' | 'annotation' | 'custom';
  sourceId: string;
  orderIndex: number;
  metadata?: any;
}

export interface NotebookCompilationOptions {
  includeSourceReferences: boolean;
  formatStyle: 'academic' | 'casual' | 'structured' | 'minimal';
  sectionSeparator: string;
  includeMetadata: boolean;
}

// Synthesis Agent - Compiles knowledge elements into notebooks
export class SynthesisAgent {
  private defaultOptions: NotebookCompilationOptions = {
    includeSourceReferences: true,
    formatStyle: 'structured',
    sectionSeparator: '\n\n---\n\n',
    includeMetadata: true
  };

  constructor() {
    Logger.info('SynthesisAgent initialized');
  }

  /**
   * Compile notebook content from composition
   */
  async compileNotebook(
    notebookId: string, 
    userId: string, 
    options: Partial<NotebookCompilationOptions> = {}
  ): Promise<CompiledNotebookContent | null> {
    try {
      const compilationOptions = { ...this.defaultOptions, ...options };
      
      // Get notebook with composition
      const notebookWithComposition = await notebookModel.getNotebookWithComposition(notebookId, userId);
      if (!notebookWithComposition) {
        Logger.warn(`Notebook not found: ${notebookId} for user: ${userId}`);
        return null;
      }

      // Compile sections from composition
      const sections = await this.compileSections(
        notebookWithComposition.composition, 
        userId, 
        compilationOptions
      );

      const compiledContent: CompiledNotebookContent = {
        title: notebookWithComposition.title,
        description: notebookWithComposition.description,
        sections,
        metadata: {
          totalElements: sections.length,
          compiledAt: new Date(),
          userId,
          notebookId
        }
      };

      Logger.info(`Successfully compiled notebook ${notebookId} with ${sections.length} sections`);
      return compiledContent;

    } catch (error) {
      Logger.error('Error compiling notebook:', error);
      throw new Error(`Failed to compile notebook: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Compile sections from notebook composition
   */
  private async compileSections(
    composition: any[], 
    userId: string, 
    options: NotebookCompilationOptions
  ): Promise<CompiledSection[]> {
    const sections: CompiledSection[] = [];

    for (const item of composition) {
      try {
        let section: CompiledSection | null = null;

        if (item.element_type === 'knowledge_element') {
          section = await this.compileKnowledgeElementSection(item, options);
        } else if (item.element_type === 'annotation') {
          section = await this.compileAnnotationSection(item, userId, options);
        }

        if (section) {
          sections.push(section);
        }
      } catch (error) {
        Logger.warn(`Failed to compile section for item ${item.id}:`, error);
        // Continue with other sections even if one fails
      }
    }

    return sections.sort((a, b) => a.orderIndex - b.orderIndex);
  }

  /**
   * Compile knowledge element into section
   */
  private async compileKnowledgeElementSection(
    compositionItem: any, 
    options: NotebookCompilationOptions
  ): Promise<CompiledSection | null> {
    try {
      const db = mongoConnection.getDb();
      const knowledgeElement = await db.collection('knowledge_elements').findOne({ 
        _id: compositionItem.element_id 
      }) as KnowledgeElement | null;

      if (!knowledgeElement) {
        Logger.warn(`Knowledge element not found: ${compositionItem.element_id}`);
        return null;
      }

      const title = compositionItem.section_title || knowledgeElement.content.title || 
                   this.generateTitleFromElementType(knowledgeElement.element_type);

      let content = knowledgeElement.content.body || '';

      // Add custom content if provided
      if (compositionItem.custom_content) {
        content = `${compositionItem.custom_content}\n\n${content}`;
      }

      // Format content based on style
      content = this.formatContent(content, knowledgeElement.element_type, options);

      // Add source reference if enabled
      if (options.includeSourceReferences) {
        const sourceRef = this.generateSourceReference(knowledgeElement);
        content += `\n\n*Source: ${sourceRef}*`;
      }

      return {
        title,
        content,
        elementType: 'knowledge_element',
        sourceId: compositionItem.element_id,
        orderIndex: compositionItem.order_index,
        metadata: options.includeMetadata ? {
          agentType: knowledgeElement.agent_type,
          elementType: knowledgeElement.element_type,
          tags: knowledgeElement.tags,
          sourceLocation: knowledgeElement.source_location
        } : undefined
      };

    } catch (error) {
      Logger.error('Error compiling knowledge element section:', error);
      return null;
    }
  }

  /**
   * Compile annotation into section
   */
  private async compileAnnotationSection(
    compositionItem: any, 
    userId: string, 
    options: NotebookCompilationOptions
  ): Promise<CompiledSection | null> {
    try {
      const annotation = await annotationModel.findByIdAndUser(compositionItem.element_id, userId);

      if (!annotation) {
        Logger.warn(`Annotation not found: ${compositionItem.element_id}`);
        return null;
      }

      const title = compositionItem.section_title || 
                   this.generateTitleFromAnnotationType(annotation.annotation_type);

      let content = annotation.content || '';

      // Add custom content if provided
      if (compositionItem.custom_content) {
        content = `${compositionItem.custom_content}\n\n${content}`;
      }

      // Format content based on annotation type
      content = this.formatAnnotationContent(content, annotation.annotation_type, options);

      // Add source reference if enabled
      if (options.includeSourceReferences) {
        const sourceRef = `Document annotation (${annotation.annotation_type})`;
        content += `\n\n*Source: ${sourceRef}*`;
      }

      return {
        title,
        content,
        elementType: 'annotation',
        sourceId: compositionItem.element_id,
        orderIndex: compositionItem.order_index,
        metadata: options.includeMetadata ? {
          annotationType: annotation.annotation_type,
          documentId: annotation.document_id,
          positionData: annotation.position_data,
          createdAt: annotation.created_at
        } : undefined
      };

    } catch (error) {
      Logger.error('Error compiling annotation section:', error);
      return null;
    }
  }

  /**
   * Generate title from knowledge element type
   */
  private generateTitleFromElementType(elementType: string): string {
    const titleMap: Record<string, string> = {
      summary: 'Summary',
      definition: 'Definition',
      formula: 'Formula',
      question: 'Question',
      topic: 'Topic',
      entity: 'Entity',
      theme: 'Theme',
      structure: 'Structure',
      argument: 'Argument',
      mindmap: 'Mind Map',
      concept: 'Concept',
      theorem: 'Theorem',
      relationship: 'Relationship'
    };

    return titleMap[elementType] || 'Knowledge Element';
  }

  /**
   * Generate title from annotation type
   */
  private generateTitleFromAnnotationType(annotationType: string): string {
    const titleMap: Record<string, string> = {
      highlight: 'Highlighted Text',
      note: 'Personal Note',
      bookmark: 'Bookmark'
    };

    return titleMap[annotationType] || 'Annotation';
  }

  /**
   * Format content based on element type and style
   */
  private formatContent(
    content: string, 
    elementType: string, 
    options: NotebookCompilationOptions
  ): string {
    switch (options.formatStyle) {
      case 'academic':
        return this.formatAcademicStyle(content, elementType);
      case 'casual':
        return this.formatCasualStyle(content, elementType);
      case 'structured':
        return this.formatStructuredStyle(content, elementType);
      case 'minimal':
        return content.trim();
      default:
        return content;
    }
  }

  /**
   * Format annotation content
   */
  private formatAnnotationContent(
    content: string, 
    annotationType: string, 
    options: NotebookCompilationOptions
  ): string {
    switch (annotationType) {
      case 'highlight':
        return options.formatStyle === 'academic' ? 
          `> ${content}` : 
          `**Highlighted:** ${content}`;
      case 'note':
        return options.formatStyle === 'academic' ? 
          content : 
          `📝 ${content}`;
      case 'bookmark':
        return options.formatStyle === 'academic' ? 
          `*Bookmarked section:* ${content}` : 
          `🔖 ${content}`;
      default:
        return content;
    }
  }

  /**
   * Format content in academic style
   */
  private formatAcademicStyle(content: string, elementType: string): string {
    switch (elementType) {
      case 'definition':
        return `**Definition:** ${content}`;
      case 'formula':
        return `$$${content}$$`;
      case 'theorem':
        return `**Theorem:** ${content}`;
      case 'summary':
        return `**Abstract:** ${content}`;
      default:
        return content;
    }
  }

  /**
   * Format content in casual style
   */
  private formatCasualStyle(content: string, elementType: string): string {
    const emojis: Record<string, string> = {
      definition: '📖',
      formula: '🧮',
      theorem: '🎓',
      summary: '📝',
      concept: '💡',
      question: '❓'
    };

    const emoji = emojis[elementType] || '📄';
    return `${emoji} ${content}`;
  }

  /**
   * Format content in structured style
   */
  private formatStructuredStyle(content: string, elementType: string): string {
    const prefix = elementType.charAt(0).toUpperCase() + elementType.slice(1);
    return `### ${prefix}\n\n${content}`;
  }

  /**
   * Generate source reference for knowledge element
   */
  private generateSourceReference(knowledgeElement: KnowledgeElement): string {
    const location = knowledgeElement.source_location;
    let reference = `${knowledgeElement.agent_type} agent`;

    if (location.section) {
      reference += ` - ${location.section}`;
    }

    if (location.page) {
      reference += ` (page ${location.page})`;
    }

    return reference;
  }

  /**
   * Generate formatted text output from compiled content
   */
  generateFormattedText(
    compiledContent: CompiledNotebookContent, 
    options: Partial<NotebookCompilationOptions> = {}
  ): string {
    const compilationOptions = { ...this.defaultOptions, ...options };
    let output = '';

    // Add title
    output += `# ${compiledContent.title}\n\n`;

    // Add description if present
    if (compiledContent.description) {
      output += `${compiledContent.description}\n\n`;
    }

    // Add metadata if enabled
    if (compilationOptions.includeMetadata) {
      output += `*Compiled on ${compiledContent.metadata.compiledAt.toLocaleDateString()} with ${compiledContent.metadata.totalElements} elements*\n\n`;
    }

    // Add sections
    compiledContent.sections.forEach((section, index) => {
      output += `## ${section.title}\n\n`;
      output += `${section.content}\n`;
      
      if (index < compiledContent.sections.length - 1) {
        output += compilationOptions.sectionSeparator;
      }
    });

    return output;
  }

  /**
   * Get compilation statistics
   */
  async getCompilationStats(notebookId: string, userId: string): Promise<{
    totalElements: number;
    elementTypes: Record<string, number>;
    lastCompiled?: Date;
  } | null> {
    try {
      const notebookWithComposition = await notebookModel.getNotebookWithComposition(notebookId, userId);
      if (!notebookWithComposition) {
        return null;
      }

      const elementTypes: Record<string, number> = {};
      let totalElements = 0;

      for (const item of notebookWithComposition.composition) {
        elementTypes[item.element_type] = (elementTypes[item.element_type] || 0) + 1;
        totalElements++;
      }

      return {
        totalElements,
        elementTypes,
        lastCompiled: notebookWithComposition.updated_at
      };

    } catch (error) {
      Logger.error('Error getting compilation stats:', error);
      return null;
    }
  }
}

export const synthesisAgent = new SynthesisAgent();