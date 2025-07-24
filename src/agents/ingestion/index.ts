import * as fs from 'fs';
import * as path from 'path';
import pdfParse from 'pdf-parse';
import * as mammoth from 'mammoth';
import { TextractClient, DetectDocumentTextCommand } from '@aws-sdk/client-textract';
import { StructuredText } from '../../types';
import { Logger } from '../../utils/logger';

export interface FileProcessingResult {
  success: boolean;
  structuredText?: StructuredText;
  error?: string;
}

export interface ProcessorOptions {
  useOCR?: boolean;
  ocrProvider?: 'aws-textract';
}

// Ingestion Agent - Processes uploaded files and extracts content
export class IngestionAgent {
  private textractClient: TextractClient;

  constructor() {
    this.textractClient = new TextractClient({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
      }
    });
  }

  /**
   * Main entry point for processing files
   */
  async processFile(filePath: string, fileType: string, options: ProcessorOptions = {}): Promise<FileProcessingResult> {
    try {
      Logger.info(`Processing file: ${filePath}, type: ${fileType}`);

      switch (fileType.toLowerCase()) {
        case 'pdf':
          return await this.processPDF(filePath, options);
        case 'docx':
        case 'doc':
          return await this.processWordDocument(filePath);
        case 'pptx':
        case 'ppt':
          return await this.processPowerPoint(filePath);
        case 'jpg':
        case 'jpeg':
        case 'png':
        case 'gif':
        case 'bmp':
        case 'tiff':
          return await this.processImage(filePath);
        default:
          return {
            success: false,
            error: `Unsupported file type: ${fileType}`
          };
      }
    } catch (error) {
      Logger.error('Error processing file:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Process PDF files with text extraction and OCR fallback
   */
  async processPDF(filePath: string, options: ProcessorOptions = {}): Promise<FileProcessingResult> {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(dataBuffer);

      // Check if PDF has extractable text
      const hasText = pdfData.text && pdfData.text.trim().length > 0;
      
      if (!hasText || options.useOCR) {
        Logger.info('PDF appears to be image-based or OCR requested, using OCR service');
        return await this.processImageBasedPDF(filePath);
      }

      // Extract text from PDF
      const structuredText = this.standardizeText(pdfData.text, {
        pageCount: pdfData.numpages,
        wordCount: pdfData.text.split(/\s+/).length,
        source: 'pdf-text-extraction'
      });

      return {
        success: true,
        structuredText
      };
    } catch (error) {
      Logger.error('Error processing PDF:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process PDF'
      };
    }
  }

  /**
   * Process image-based PDFs using OCR
   */
  private async processImageBasedPDF(filePath: string): Promise<FileProcessingResult> {
    try {
      // For image-based PDFs, we'll use AWS Textract
      // First, we need to convert PDF to images or send directly to Textract
      const fileBuffer = fs.readFileSync(filePath);
      
      const command = new DetectDocumentTextCommand({
        Document: {
          Bytes: fileBuffer
        }
      });

      const response = await this.textractClient.send(command);
      
      if (!response.Blocks) {
        return {
          success: false,
          error: 'No text blocks found in document'
        };
      }

      // Extract text from Textract response
      const extractedText = this.extractTextFromTextractBlocks(response.Blocks);
      
      if (!extractedText || extractedText.trim().length === 0) {
        return {
          success: false,
          error: 'No text found in document'
        };
      }
      
      const structuredText = this.standardizeText(extractedText, {
        wordCount: extractedText.split(/\s+/).filter(word => word.length > 0).length,
        source: 'ocr-textract'
      });

      return {
        success: true,
        structuredText
      };
    } catch (error) {
      Logger.error('Error processing image-based PDF with OCR:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'OCR processing failed'
      };
    }
  }

  /**
   * Process Word documents
   */
  async processWordDocument(filePath: string): Promise<FileProcessingResult> {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      
      if (result.messages.length > 0) {
        Logger.warn('Word document processing warnings:', result.messages);
      }

      const structuredText = this.standardizeText(result.value, {
        wordCount: result.value.split(/\s+/).length,
        source: 'word-extraction'
      });

      return {
        success: true,
        structuredText
      };
    } catch (error) {
      Logger.error('Error processing Word document:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process Word document'
      };
    }
  }

  /**
   * Process PowerPoint presentations
   */
  async processPowerPoint(filePath: string): Promise<FileProcessingResult> {
    try {
      // For now, we'll implement a basic PowerPoint processor
      // In a production environment, you might want to use a more robust library
      const pptx2json = require('pptx2json');
      
      const slides = await pptx2json(filePath);
      let extractedText = '';
      
      slides.forEach((slide: any, index: number) => {
        extractedText += `\n\n--- Slide ${index + 1} ---\n`;
        if (slide.title) {
          extractedText += `Title: ${slide.title}\n`;
        }
        if (slide.content) {
          extractedText += `${slide.content}\n`;
        }
      });

      const structuredText = this.standardizeText(extractedText, {
        wordCount: extractedText.split(/\s+/).filter(word => word.length > 0).length,
        slideCount: slides.length,
        source: 'powerpoint-extraction'
      });

      return {
        success: true,
        structuredText
      };
    } catch (error) {
      Logger.error('Error processing PowerPoint:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process PowerPoint'
      };
    }
  }

  /**
   * Process image files using OCR
   */
  async processImage(filePath: string): Promise<FileProcessingResult> {
    try {
      const fileBuffer = fs.readFileSync(filePath);
      
      const command = new DetectDocumentTextCommand({
        Document: {
          Bytes: fileBuffer
        }
      });

      const response = await this.textractClient.send(command);
      
      if (!response.Blocks) {
        return {
          success: false,
          error: 'No text found in image'
        };
      }

      const extractedText = this.extractTextFromTextractBlocks(response.Blocks);
      
      if (!extractedText || extractedText.trim().length === 0) {
        return {
          success: false,
          error: 'No text found in image'
        };
      }
      
      const structuredText = this.standardizeText(extractedText, {
        wordCount: extractedText.split(/\s+/).filter(word => word.length > 0).length,
        source: 'image-ocr'
      });

      return {
        success: true,
        structuredText
      };
    } catch (error) {
      Logger.error('Error processing image with OCR:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Image OCR processing failed'
      };
    }
  }

  /**
   * Extract text from AWS Textract blocks
   */
  private extractTextFromTextractBlocks(blocks: any[]): string {
    const lines: string[] = [];
    
    blocks.forEach(block => {
      if (block.BlockType === 'LINE' && block.Text) {
        lines.push(block.Text);
      }
    });
    
    return lines.join('\n');
  }

  /**
   * Standardize extracted text into structured format
   */
  private standardizeText(rawText: string, metadata: any = {}): StructuredText {
    // Clean and normalize text
    const cleanedText = this.cleanText(rawText);
    
    // Extract structure (headings, paragraphs, sections)
    const sections = this.extractStructure(cleanedText);
    
    // Generate title from first heading or first line
    const title = this.extractTitle(cleanedText);
    
    return {
      title,
      sections,
      metadata: {
        wordCount: cleanedText.split(/\s+/).filter(word => word.length > 0).length,
        language: 'en', // TODO: Implement language detection
        ...metadata
      }
    };
  }

  /**
   * Clean and normalize text
   */
  private cleanText(text: string): string {
    return text
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n') // Reduce multiple newlines
      .replace(/[ \t]+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Extract document structure (headings, sections)
   */
  private extractStructure(text: string): StructuredText['sections'] {
    const lines = text.split('\n');
    const sections: StructuredText['sections'] = [];
    let currentSection: any = null;
    let currentContent: string[] = [];

    for (const line of lines) {
      const trimmedLine = line.trim();
      
      if (!trimmedLine) continue;

      // Simple heuristic for detecting headings
      const isHeading = this.isLikelyHeading(trimmedLine);
      
      if (isHeading) {
        // Save previous section if exists
        if (currentSection) {
          currentSection.content = currentContent.join('\n').trim();
          sections.push(currentSection);
        }
        
        // Start new section
        currentSection = {
          heading: trimmedLine,
          content: '',
          subsections: []
        };
        currentContent = [];
      } else {
        // Add to current content
        currentContent.push(trimmedLine);
      }
    }

    // Add final section
    if (currentSection) {
      currentSection.content = currentContent.join('\n').trim();
      sections.push(currentSection);
    }

    // If no sections were found, create a default section
    if (sections.length === 0) {
      sections.push({
        heading: 'Content',
        content: text,
        subsections: []
      });
    }

    return sections;
  }

  /**
   * Determine if a line is likely a heading
   */
  private isLikelyHeading(line: string): boolean {
    // Simple heuristics for heading detection
    return (
      line.length < 100 && // Headings are usually shorter
      (
        /^[A-Z][^.!?]*$/.test(line) || // All caps or title case without punctuation
        /^\d+\.?\s/.test(line) || // Starts with number
        /^[IVX]+\.?\s/.test(line) || // Roman numerals
        /^[A-Z][a-z]*:/.test(line) || // Ends with colon
        line === line.toUpperCase() // All uppercase
      )
    );
  }

  /**
   * Extract document title
   */
  private extractTitle(text: string): string {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    if (lines.length === 0) return 'Untitled Document';
    
    // Use first non-empty line as title, truncated if too long
    const firstLine = lines[0];
    return firstLine.length > 100 ? firstLine.substring(0, 97) + '...' : firstLine;
  }
}