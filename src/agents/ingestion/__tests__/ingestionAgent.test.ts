import { IngestionAgent } from '../index';
import * as fs from 'fs';
import pdfParse from 'pdf-parse';

// Mock dependencies
jest.mock('fs');
jest.mock('pdf-parse');
jest.mock('@aws-sdk/client-textract', () => ({
  TextractClient: jest.fn().mockImplementation(() => ({
    send: jest.fn()
  })),
  DetectDocumentTextCommand: jest.fn()
}));
jest.mock('mammoth');
jest.mock('pptx2json');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockPdfParse = pdfParse as jest.MockedFunction<typeof pdfParse>;

describe('IngestionAgent', () => {
  let agent: IngestionAgent;
  let mockTextractSend: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock environment variables
    process.env.AWS_REGION = 'us-east-1';
    process.env.AWS_ACCESS_KEY_ID = 'test-key';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
    
    mockTextractSend = jest.fn();
    
    agent = new IngestionAgent();
    // Mock the textract client send method
    (agent as any).textractClient = { send: mockTextractSend };
  });

  describe('PDF Processing', () => {
    it('should successfully extract text from a text-based PDF', async () => {
      const mockPdfData = {
        text: 'This is a sample PDF content with multiple paragraphs.\n\nThis is the second paragraph.',
        numpages: 1,
        numrender: 1,
        info: {},
        metadata: {},
        version: { major: 1, minor: 0, patch: 0 }
      } as any;

      mockFs.readFileSync.mockReturnValue(Buffer.from('mock pdf data'));
      mockPdfParse.mockResolvedValue(mockPdfData);

      const result = await agent.processPDF('/path/to/test.pdf');

      expect(result.success).toBe(true);
      expect(result.structuredText).toBeDefined();
      expect(result.structuredText!.title).toBe('This is a sample PDF content with multiple paragraphs.');
      expect(result.structuredText!.sections).toHaveLength(1);
      expect(result.structuredText!.metadata.wordCount).toBeGreaterThan(0);
      expect(result.structuredText!.metadata.pageCount).toBe(1);
    });

    it('should use OCR for image-based PDFs when no text is found', async () => {
      const mockPdfData = {
        text: '', // No extractable text
        numpages: 1,
        numrender: 1,
        info: {},
        metadata: {},
        version: { major: 1, minor: 0, patch: 0 }
      } as any;

      const mockTextractResponse = {
        Blocks: [
          {
            BlockType: 'LINE',
            Text: 'This text was extracted via OCR'
          },
          {
            BlockType: 'LINE',
            Text: 'Second line from OCR'
          }
        ]
      };

      mockFs.readFileSync.mockReturnValue(Buffer.from('mock pdf data'));
      mockPdfParse.mockResolvedValue(mockPdfData);
      mockTextractSend.mockResolvedValue(mockTextractResponse);

      const result = await agent.processPDF('/path/to/image-based.pdf');

      expect(result.success).toBe(true);
      expect(result.structuredText).toBeDefined();
      expect(result.structuredText!.title).toBe('This text was extracted via OCR');
      expect(result.structuredText!.metadata.source).toBe('ocr-textract');
      expect(mockTextractSend).toHaveBeenCalled();
    });

    it('should force OCR when useOCR option is true', async () => {
      const mockPdfData = {
        text: 'This PDF has text but we want to use OCR',
        numpages: 1,
        numrender: 1,
        info: {},
        metadata: {},
        version: { major: 1, minor: 0, patch: 0 }
      } as any;

      const mockTextractResponse = {
        Blocks: [
          {
            BlockType: 'LINE',
            Text: 'OCR extracted text'
          }
        ]
      };

      mockFs.readFileSync.mockReturnValue(Buffer.from('mock pdf data'));
      mockPdfParse.mockResolvedValue(mockPdfData);
      mockTextractSend.mockResolvedValue(mockTextractResponse);

      const result = await agent.processPDF('/path/to/test.pdf', { useOCR: true });

      expect(result.success).toBe(true);
      expect(result.structuredText!.metadata.source).toBe('ocr-textract');
      expect(mockTextractSend).toHaveBeenCalled();
    });

    it('should handle PDF processing errors gracefully', async () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      const result = await agent.processPDF('/path/to/nonexistent.pdf');

      expect(result.success).toBe(false);
      expect(result.error).toBe('File not found');
    });

    it('should handle OCR errors gracefully', async () => {
      const mockPdfData = {
        text: '', // No extractable text, will trigger OCR
        numpages: 1,
        numrender: 1,
        info: {},
        metadata: {},
        version: { major: 1, minor: 0, patch: 0 }
      } as any;

      mockFs.readFileSync.mockReturnValue(Buffer.from('mock pdf data'));
      mockPdfParse.mockResolvedValue(mockPdfData);
      mockTextractSend.mockRejectedValue(new Error('Textract service error'));

      const result = await agent.processPDF('/path/to/image-based.pdf');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Textract service error');
    });
  });

  describe('Text Standardization and Structure Extraction', () => {
    it('should properly structure text with headings', async () => {
      const mockPdfData = {
        text: 'INTRODUCTION\n\nThis is the introduction paragraph.\n\nMETHODOLOGY\n\nThis describes the methodology.',
        numpages: 1,
        numrender: 1,
        info: {},
        metadata: {},
        version: { major: 1, minor: 0, patch: 0 }
      } as any;

      mockFs.readFileSync.mockReturnValue(Buffer.from('mock pdf data'));
      mockPdfParse.mockResolvedValue(mockPdfData);

      const result = await agent.processPDF('/path/to/structured.pdf');

      expect(result.success).toBe(true);
      expect(result.structuredText!.sections).toHaveLength(2);
      expect(result.structuredText!.sections[0].heading).toBe('INTRODUCTION');
      expect(result.structuredText!.sections[0].content).toBe('This is the introduction paragraph.');
      expect(result.structuredText!.sections[1].heading).toBe('METHODOLOGY');
      expect(result.structuredText!.sections[1].content).toBe('This describes the methodology.');
    });

    it('should create default section when no structure is detected', async () => {
      const mockPdfData = {
        text: 'This is just plain text without any structure or headings.',
        numpages: 1,
        numrender: 1,
        info: {},
        metadata: {},
        version: { major: 1, minor: 0, patch: 0 }
      } as any;

      mockFs.readFileSync.mockReturnValue(Buffer.from('mock pdf data'));
      mockPdfParse.mockResolvedValue(mockPdfData);

      const result = await agent.processPDF('/path/to/plain.pdf');

      expect(result.success).toBe(true);
      expect(result.structuredText!.sections).toHaveLength(1);
      expect(result.structuredText!.sections[0].heading).toBe('Content');
      expect(result.structuredText!.sections[0].content).toBe('This is just plain text without any structure or headings.');
    });

    it('should clean and normalize text properly', async () => {
      const mockPdfData = {
        text: 'Title   with   extra   spaces\r\n\r\n\r\nParagraph\twith\ttabs\n\n\n\nAnother paragraph',
        numpages: 1,
        numrender: 1,
        info: {},
        metadata: {},
        version: { major: 1, minor: 0, patch: 0 }
      } as any;

      mockFs.readFileSync.mockReturnValue(Buffer.from('mock pdf data'));
      mockPdfParse.mockResolvedValue(mockPdfData);

      const result = await agent.processPDF('/path/to/messy.pdf');

      expect(result.success).toBe(true);
      expect(result.structuredText!.title).toBe('Title with extra spaces');
      // Check that excessive whitespace is normalized
      expect(result.structuredText!.sections[0].content).not.toContain('\r');
      expect(result.structuredText!.sections[0].content).not.toContain('\t');
    });

    it('should detect various heading patterns', async () => {
      const mockPdfData = {
        text: '1. First Section\n\nContent for first section.\n\nII. Second Section\n\nContent for second section.\n\nChapter 3: Third Section\n\nContent for third section.',
        numpages: 1,
        numrender: 1,
        info: {},
        metadata: {},
        version: { major: 1, minor: 0, patch: 0 }
      } as any;

      mockFs.readFileSync.mockReturnValue(Buffer.from('mock pdf data'));
      mockPdfParse.mockResolvedValue(mockPdfData);

      const result = await agent.processPDF('/path/to/numbered.pdf');

      expect(result.success).toBe(true);
      expect(result.structuredText!.sections).toHaveLength(3);
      expect(result.structuredText!.sections[0].heading).toBe('1. First Section');
      expect(result.structuredText!.sections[1].heading).toBe('II. Second Section');
      expect(result.structuredText!.sections[2].heading).toBe('Chapter 3: Third Section');
    });

    it('should generate appropriate titles from content', async () => {
      const mockPdfData = {
        text: 'Machine Learning in Healthcare: A Comprehensive Review\n\nThis document provides an overview of machine learning applications in healthcare.',
        numpages: 1,
        numrender: 1,
        info: {},
        metadata: {},
        version: { major: 1, minor: 0, patch: 0 }
      } as any;

      mockFs.readFileSync.mockReturnValue(Buffer.from('mock pdf data'));
      mockPdfParse.mockResolvedValue(mockPdfData);

      const result = await agent.processPDF('/path/to/titled.pdf');

      expect(result.success).toBe(true);
      expect(result.structuredText!.title).toBe('Machine Learning in Healthcare: A Comprehensive Review');
    });

    it('should truncate very long titles', async () => {
      const longTitle = 'This is an extremely long title that goes on and on and should be truncated because it exceeds the maximum length limit that we have set for document titles in our system';
      const mockPdfData = {
        text: `${longTitle}\n\nContent follows here.`,
        numpages: 1,
        numrender: 1,
        info: {},
        metadata: {},
        version: { major: 1, minor: 0, patch: 0 }
      } as any;

      mockFs.readFileSync.mockReturnValue(Buffer.from('mock pdf data'));
      mockPdfParse.mockResolvedValue(mockPdfData);

      const result = await agent.processPDF('/path/to/longtitle.pdf');

      expect(result.success).toBe(true);
      expect(result.structuredText!.title.length).toBeLessThanOrEqual(100);
      expect(result.structuredText!.title).toContain('...');
    });

    it('should calculate word count correctly', async () => {
      const mockPdfData = {
        text: 'This is a test document with exactly ten words in it.',
        numpages: 1,
        numrender: 1,
        info: {},
        metadata: {},
        version: { major: 1, minor: 0, patch: 0 }
      } as any;

      mockFs.readFileSync.mockReturnValue(Buffer.from('mock pdf data'));
      mockPdfParse.mockResolvedValue(mockPdfData);

      const result = await agent.processPDF('/path/to/wordcount.pdf');

      expect(result.success).toBe(true);
      expect(result.structuredText!.metadata.wordCount).toBe(11); // "This is a test document with exactly ten words in it" = 11 words
    });

    it('should handle simple content without headings', async () => {
      const mockPdfData = {
        text: 'Some actual text content',  // Use actual text to avoid OCR path
        numpages: 1,
        numrender: 1,
        info: {},
        metadata: {},
        version: { major: 1, minor: 0, patch: 0 }
      } as any;

      mockFs.readFileSync.mockReturnValue(Buffer.from('mock pdf data'));
      mockPdfParse.mockResolvedValue(mockPdfData);

      const result = await agent.processPDF('/path/to/content.pdf');

      expect(result.success).toBe(true);
      expect(result.structuredText!.title).toBe('Some actual text content');
      expect(result.structuredText!.sections).toHaveLength(1);
      expect(result.structuredText!.sections[0].heading).toBe('Some actual text content');
      expect(result.structuredText!.metadata.wordCount).toBe(4);
    });

    it('should preserve section hierarchy with subsections', async () => {
      const mockPdfData = {
        text: 'MAIN SECTION\n\nThis is the main section content.\n\nSubsection A\n\nContent for subsection A.\n\nSubsection B\n\nContent for subsection B.',
        numpages: 1,
        numrender: 1,
        info: {},
        metadata: {},
        version: { major: 1, minor: 0, patch: 0 }
      } as any;

      mockFs.readFileSync.mockReturnValue(Buffer.from('mock pdf data'));
      mockPdfParse.mockResolvedValue(mockPdfData);

      const result = await agent.processPDF('/path/to/hierarchy.pdf');

      expect(result.success).toBe(true);
      expect(result.structuredText!.sections).toHaveLength(3);
      expect(result.structuredText!.sections[0].heading).toBe('MAIN SECTION');
      expect(result.structuredText!.sections[1].heading).toBe('Subsection A');
      expect(result.structuredText!.sections[2].heading).toBe('Subsection B');
    });
  });

  describe('Word Document Processing', () => {
    it('should successfully extract text from Word documents', async () => {
      const mammoth = require('mammoth');
      mammoth.extractRawText = jest.fn().mockResolvedValue({
        value: 'This is content from a Word document.\n\nSecond paragraph.',
        messages: []
      });

      const result = await agent.processWordDocument('/path/to/test.docx');

      expect(result.success).toBe(true);
      expect(result.structuredText).toBeDefined();
      expect(result.structuredText!.title).toBe('This is content from a Word document.');
      expect(result.structuredText!.metadata.source).toBe('word-extraction');
      expect(mammoth.extractRawText).toHaveBeenCalledWith({ path: '/path/to/test.docx' });
    });

    it('should handle Word document processing warnings', async () => {
      const mammoth = require('mammoth');
      mammoth.extractRawText = jest.fn().mockResolvedValue({
        value: 'Word content with warnings',
        messages: ['Warning: Some formatting was lost']
      });

      const result = await agent.processWordDocument('/path/to/test.docx');

      expect(result.success).toBe(true);
      expect(result.structuredText!.title).toBe('Word content with warnings');
    });

    it('should handle Word document processing errors', async () => {
      const mammoth = require('mammoth');
      mammoth.extractRawText = jest.fn().mockRejectedValue(new Error('Failed to read Word document'));

      const result = await agent.processWordDocument('/path/to/invalid.docx');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to read Word document');
    });
  });

  describe('PowerPoint Processing', () => {
    it('should successfully extract text from PowerPoint presentations', async () => {
      const pptx2json = require('pptx2json');
      const mockSlides = [
        { title: 'Introduction', content: 'Welcome to the presentation' },
        { title: 'Main Topic', content: 'This is the main content' },
        { content: 'Slide without title' }
      ];
      
      pptx2json.mockResolvedValue(mockSlides);

      const result = await agent.processPowerPoint('/path/to/test.pptx');

      expect(result.success).toBe(true);
      expect(result.structuredText).toBeDefined();
      expect(result.structuredText!.metadata.slideCount).toBe(3);
      expect(result.structuredText!.metadata.source).toBe('powerpoint-extraction');
      expect(result.structuredText!.metadata.wordCount).toBeGreaterThan(0);
      
      // Verify that pptx2json was called with the correct path
      expect(pptx2json).toHaveBeenCalledWith('/path/to/test.pptx');
    });

    it('should handle PowerPoint processing errors', async () => {
      const pptx2json = require('pptx2json');
      pptx2json.mockRejectedValue(new Error('Failed to parse PowerPoint'));

      const result = await agent.processPowerPoint('/path/to/invalid.pptx');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to parse PowerPoint');
    });
  });

  describe('Image Processing with OCR', () => {
    it('should successfully extract text from image files using OCR', async () => {
      const mockTextractResponse = {
        Blocks: [
          {
            BlockType: 'LINE',
            Text: 'This is text extracted from an image'
          },
          {
            BlockType: 'LINE',
            Text: 'Second line of text from image'
          }
        ]
      };

      mockFs.readFileSync.mockReturnValue(Buffer.from('mock image data'));
      mockTextractSend.mockResolvedValue(mockTextractResponse);

      const result = await agent.processImage('/path/to/test.jpg');

      expect(result.success).toBe(true);
      expect(result.structuredText).toBeDefined();
      expect(result.structuredText!.title).toBe('This is text extracted from an image');
      expect(result.structuredText!.metadata.source).toBe('image-ocr');
      expect(mockTextractSend).toHaveBeenCalled();
    });

    it('should handle images with no text found', async () => {
      const mockTextractResponse = {
        Blocks: []
      };

      mockFs.readFileSync.mockReturnValue(Buffer.from('mock image data'));
      mockTextractSend.mockResolvedValue(mockTextractResponse);

      const result = await agent.processImage('/path/to/empty.jpg');

      expect(result.success).toBe(false);
      expect(result.error).toBe('No text found in image');
    });

    it('should handle OCR service errors for images', async () => {
      mockFs.readFileSync.mockReturnValue(Buffer.from('mock image data'));
      mockTextractSend.mockRejectedValue(new Error('OCR service unavailable'));

      const result = await agent.processImage('/path/to/test.jpg');

      expect(result.success).toBe(false);
      expect(result.error).toBe('OCR service unavailable');
    });

    it('should handle image file reading errors', async () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('Image file not found');
      });

      const result = await agent.processImage('/path/to/nonexistent.jpg');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Image file not found');
    });
  });

  describe('File Type Support', () => {
    it('should handle unsupported file types', async () => {
      const result = await agent.processFile('/path/to/file.xyz', 'xyz');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unsupported file type: xyz');
    });

    it('should route PDF files to PDF processor', async () => {
      const mockPdfData = {
        text: 'PDF content',
        numpages: 1,
        numrender: 1,
        info: {},
        metadata: {},
        version: { major: 1, minor: 0, patch: 0 }
      } as any;

      mockFs.readFileSync.mockReturnValue(Buffer.from('mock pdf data'));
      mockPdfParse.mockResolvedValue(mockPdfData);

      const result = await agent.processFile('/path/to/test.pdf', 'pdf');

      expect(result.success).toBe(true);
      expect(mockPdfParse).toHaveBeenCalled();
    });

    it('should route Word files to Word processor', async () => {
      const mammoth = require('mammoth');
      mammoth.extractRawText = jest.fn().mockResolvedValue({
        value: 'Word content',
        messages: []
      });

      const result = await agent.processFile('/path/to/test.docx', 'docx');

      expect(result.success).toBe(true);
      expect(mammoth.extractRawText).toHaveBeenCalled();
    });

    it('should route PowerPoint files to PowerPoint processor', async () => {
      const pptx2json = require('pptx2json');
      pptx2json.mockResolvedValue([{ content: 'PPT content' }]);

      const result = await agent.processFile('/path/to/test.pptx', 'pptx');

      expect(result.success).toBe(true);
      expect(pptx2json).toHaveBeenCalled();
    });

    it('should route image files to image processor', async () => {
      const mockTextractResponse = {
        Blocks: [
          {
            BlockType: 'LINE',
            Text: 'Image text content'
          }
        ]
      };

      mockFs.readFileSync.mockReturnValue(Buffer.from('mock image data'));
      mockTextractSend.mockResolvedValue(mockTextractResponse);

      const result = await agent.processFile('/path/to/test.jpg', 'jpg');

      expect(result.success).toBe(true);
      expect(mockTextractSend).toHaveBeenCalled();
    });

    it('should support various image formats', async () => {
      const mockTextractResponse = {
        Blocks: [
          {
            BlockType: 'LINE',
            Text: 'Image text content'
          }
        ]
      };

      mockFs.readFileSync.mockReturnValue(Buffer.from('mock image data'));
      mockTextractSend.mockResolvedValue(mockTextractResponse);

      const imageFormats = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff'];
      
      for (const format of imageFormats) {
        const result = await agent.processFile(`/path/to/test.${format}`, format);
        expect(result.success).toBe(true);
      }
    });
  });
});