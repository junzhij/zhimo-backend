import { notebookModel, NotebookWithComposition } from '../../models/notebookModel';
import { annotationModel } from '../../models/annotationModel';
import { mongoConnection } from '../../database/mongodb';
import { KnowledgeElement, Annotation } from '../../types';
import { Logger } from '../../utils/logger';
import puppeteer from 'puppeteer';

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

export interface PDFExportOptions {
  template: 'academic' | 'modern' | 'minimal' | 'report';
  pageSize: 'A4' | 'Letter' | 'Legal';
  orientation: 'portrait' | 'landscape';
  includeTableOfContents: boolean;
  includePageNumbers: boolean;
  headerText?: string;
  footerText?: string;
  fontSize: 'small' | 'medium' | 'large';
  margins: {
    top: string;
    right: string;
    bottom: string;
    left: string;
  };
}

export interface PDFExportResult {
  buffer: Buffer;
  filename: string;
  metadata: {
    title: string;
    pageCount: number;
    generatedAt: Date;
    template: string;
    fileSize: number;
  };
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

  /**
   * Export notebook to PDF
   */
  async exportToPDF(
    notebookId: string,
    userId: string,
    compilationOptions: Partial<NotebookCompilationOptions> = {},
    pdfOptions: Partial<PDFExportOptions> = {}
  ): Promise<PDFExportResult | null> {
    try {
      // Compile notebook content first
      const compiledContent = await this.compileNotebook(notebookId, userId, compilationOptions);
      if (!compiledContent) {
        Logger.warn(`Failed to compile notebook ${notebookId} for PDF export`);
        return null;
      }

      // Set default PDF options
      const defaultPDFOptions: PDFExportOptions = {
        template: 'academic',
        pageSize: 'A4',
        orientation: 'portrait',
        includeTableOfContents: true,
        includePageNumbers: true,
        fontSize: 'medium',
        margins: {
          top: '1in',
          right: '1in',
          bottom: '1in',
          left: '1in'
        }
      };

      const finalPDFOptions = { ...defaultPDFOptions, ...pdfOptions };

      // Generate HTML content
      const htmlContent = this.generateHTMLForPDF(compiledContent, finalPDFOptions);

      // Generate PDF using Puppeteer
      const pdfBuffer = await this.generatePDFFromHTML(htmlContent, finalPDFOptions);

      // Generate filename
      const sanitizedTitle = compiledContent.title.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '_');
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `${sanitizedTitle}_${timestamp}.pdf`;

      const result: PDFExportResult = {
        buffer: pdfBuffer,
        filename,
        metadata: {
          title: compiledContent.title,
          pageCount: 0, // Will be updated after PDF generation
          generatedAt: new Date(),
          template: finalPDFOptions.template,
          fileSize: pdfBuffer.length
        }
      };

      Logger.info(`Successfully exported notebook ${notebookId} to PDF (${pdfBuffer.length} bytes)`);
      return result;

    } catch (error) {
      Logger.error('Error exporting notebook to PDF:', error);
      throw new Error(`Failed to export notebook to PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate HTML content for PDF export
   */
  private generateHTMLForPDF(
    compiledContent: CompiledNotebookContent,
    options: PDFExportOptions
  ): string {
    const css = this.generateCSSForTemplate(options);
    const tableOfContents = options.includeTableOfContents ? this.generateTableOfContents(compiledContent) : '';
    const sectionsHTML = this.generateSectionsHTML(compiledContent, options);

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${compiledContent.title}</title>
    <style>${css}</style>
</head>
<body>
    ${options.headerText ? `<div class="header">${options.headerText}</div>` : ''}
    
    <div class="title-page">
        <h1 class="main-title">${compiledContent.title}</h1>
        ${compiledContent.description ? `<p class="description">${compiledContent.description}</p>` : ''}
        <div class="metadata">
            <p>Generated on: ${compiledContent.metadata.compiledAt.toLocaleDateString()}</p>
            <p>Total Elements: ${compiledContent.metadata.totalElements}</p>
        </div>
    </div>

    ${tableOfContents}

    <div class="content">
        ${sectionsHTML}
    </div>

    ${options.footerText ? `<div class="footer">${options.footerText}</div>` : ''}
</body>
</html>`;
  }

  /**
   * Generate CSS for different templates
   */
  private generateCSSForTemplate(options: PDFExportOptions): string {
    const fontSizes = {
      small: { base: '12px', h1: '20px', h2: '16px', h3: '14px' },
      medium: { base: '14px', h1: '24px', h2: '18px', h3: '16px' },
      large: { base: '16px', h1: '28px', h2: '20px', h3: '18px' }
    };

    const fonts = fontSizes[options.fontSize];

    const baseCSS = `
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: 'Times New Roman', serif;
        font-size: ${fonts.base};
        line-height: 1.6;
        color: #333;
        margin: ${options.margins.top} ${options.margins.right} ${options.margins.bottom} ${options.margins.left};
      }

      .title-page {
        text-align: center;
        margin-bottom: 2em;
        page-break-after: always;
      }

      .main-title {
        font-size: ${fonts.h1};
        font-weight: bold;
        margin-bottom: 1em;
        color: #2c3e50;
      }

      .description {
        font-size: ${fonts.base};
        font-style: italic;
        margin-bottom: 2em;
        color: #666;
      }

      .metadata {
        font-size: calc(${fonts.base} - 2px);
        color: #888;
      }

      .table-of-contents {
        margin-bottom: 2em;
        page-break-after: always;
      }

      .toc-title {
        font-size: ${fonts.h2};
        font-weight: bold;
        margin-bottom: 1em;
        border-bottom: 2px solid #2c3e50;
        padding-bottom: 0.5em;
      }

      .toc-item {
        margin: 0.5em 0;
        padding-left: 1em;
      }

      .content {
        margin-top: 2em;
      }

      .section {
        margin-bottom: 2em;
        page-break-inside: avoid;
      }

      .section-title {
        font-size: ${fonts.h2};
        font-weight: bold;
        margin-bottom: 1em;
        color: #2c3e50;
        border-bottom: 1px solid #ddd;
        padding-bottom: 0.5em;
      }

      .section-content {
        margin-bottom: 1em;
        text-align: justify;
      }

      .source-reference {
        font-size: calc(${fonts.base} - 2px);
        font-style: italic;
        color: #666;
        margin-top: 0.5em;
      }

      .header, .footer {
        position: fixed;
        left: 0;
        right: 0;
        font-size: calc(${fonts.base} - 2px);
        color: #666;
        text-align: center;
      }

      .header {
        top: 0;
        border-bottom: 1px solid #ddd;
        padding-bottom: 0.5em;
      }

      .footer {
        bottom: 0;
        border-top: 1px solid #ddd;
        padding-top: 0.5em;
      }

      ${options.includePageNumbers ? `
        @page {
          @bottom-right {
            content: counter(page);
          }
        }
      ` : ''}
    `;

    // Template-specific styles
    switch (options.template) {
      case 'modern':
        return baseCSS + `
          body { font-family: 'Arial', sans-serif; }
          .main-title { color: #3498db; }
          .section-title { color: #3498db; border-bottom-color: #3498db; }
        `;
      case 'minimal':
        return baseCSS + `
          .title-page { text-align: left; }
          .section-title { border-bottom: none; font-weight: normal; }
          .toc-title { border-bottom: none; }
        `;
      case 'report':
        return baseCSS + `
          body { font-family: 'Arial', sans-serif; }
          .section { border-left: 3px solid #2c3e50; padding-left: 1em; }
        `;
      default: // academic
        return baseCSS;
    }
  }

  /**
   * Generate table of contents
   */
  private generateTableOfContents(compiledContent: CompiledNotebookContent): string {
    if (compiledContent.sections.length === 0) {
      return '';
    }

    const tocItems = compiledContent.sections
      .map((section, index) => `
        <div class="toc-item">
          ${index + 1}. ${section.title}
        </div>
      `)
      .join('');

    return `
      <div class="table-of-contents">
        <h2 class="toc-title">Table of Contents</h2>
        ${tocItems}
      </div>
    `;
  }

  /**
   * Generate sections HTML
   */
  private generateSectionsHTML(
    compiledContent: CompiledNotebookContent,
    options: PDFExportOptions
  ): string {
    return compiledContent.sections
      .map((section, index) => `
        <div class="section">
          <h2 class="section-title">${index + 1}. ${section.title}</h2>
          <div class="section-content">
            ${this.formatContentForHTML(section.content)}
          </div>
          ${section.metadata && options.template === 'academic' ? `
            <div class="source-reference">
              Source: ${section.elementType} - ${section.sourceId}
            </div>
          ` : ''}
        </div>
      `)
      .join('');
  }

  /**
   * Format content for HTML display
   */
  private formatContentForHTML(content: string): string {
    // Convert markdown-like formatting to HTML
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
      .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italic
      .replace(/`(.*?)`/g, '<code>$1</code>') // Code
      .replace(/\n\n/g, '</p><p>') // Paragraphs
      .replace(/\n/g, '<br>') // Line breaks
      .replace(/^/, '<p>') // Start paragraph
      .replace(/$/, '</p>'); // End paragraph
  }

  /**
   * Generate PDF from HTML using Puppeteer
   */
  private async generatePDFFromHTML(
    htmlContent: string,
    options: PDFExportOptions
  ): Promise<Buffer> {
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

      const pdfBuffer = await page.pdf({
        format: options.pageSize.toLowerCase() as any,
        landscape: options.orientation === 'landscape',
        margin: {
          top: options.margins.top,
          right: options.margins.right,
          bottom: options.margins.bottom,
          left: options.margins.left
        },
        printBackground: true,
        displayHeaderFooter: options.includePageNumbers,
        headerTemplate: options.headerText ? `<div style="font-size: 10px; text-align: center; width: 100%;">${options.headerText}</div>` : '',
        footerTemplate: options.includePageNumbers ? '<div style="font-size: 10px; text-align: center; width: 100%;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>' : ''
      });

      return Buffer.from(pdfBuffer);

    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
}

export const synthesisAgent = new SynthesisAgent();