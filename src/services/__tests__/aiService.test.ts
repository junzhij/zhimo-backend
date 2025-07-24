import { AIService, SummaryOptions, createAIService } from '../aiService';
import OpenAI from 'openai';

// Mock OpenAI
jest.mock('openai');
const MockedOpenAI = OpenAI as jest.MockedClass<typeof OpenAI>;

describe('AIService', () => {
  let aiService: AIService;
  let mockCreate: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockCreate = jest.fn();
    const mockOpenAIInstance = {
      chat: {
        completions: {
          create: mockCreate
        }
      }
    } as any;

    MockedOpenAI.mockImplementation(() => mockOpenAIInstance);

    aiService = new AIService({
      apiKey: 'test-api-key',
      baseURL: 'https://api.test.com',
      model: 'gpt-3.5-turbo'
    });
  });

  describe('generateSummary', () => {
    const mockText = 'This is a test document with multiple sentences. It contains important information about various topics. The content is structured and well-organized.';
    
    it('should generate a summary successfully', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: `SUMMARY:
This is a concise summary of the test document covering the main topics and key information.

KEY POINTS:
• Important information about various topics
• Well-structured and organized content
• Multiple sentences with clear meaning

WORD COUNT: 15`
          }
        }]
      };

      mockCreate.mockResolvedValue(mockResponse as any);

      const options: SummaryOptions = {
        length: 'medium',
        style: 'abstractive'
      };

      const result = await aiService.generateSummary(mockText, options);

      expect(result.summary).toContain('concise summary');
      expect(result.keyPoints).toHaveLength(3);
      expect(result.keyPoints[0]).toBe('Important information about various topics');
      expect(result.wordCount).toBe(15);
      expect(result.confidence).toBe(0.85);
    });

    it('should handle different summary lengths', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'SUMMARY:\nShort summary.\n\nKEY POINTS:\n• Point 1\n\nWORD COUNT: 2'
          }
        }]
      };

      mockCreate.mockResolvedValue(mockResponse as any);

      const options: SummaryOptions = {
        length: 'short',
        style: 'extractive'
      };

      await aiService.generateSummary(mockText, options);

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'gpt-3.5-turbo',
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('Create a concise summary in 2-3 sentences (50-100 words)')
          })
        ]),
        max_tokens: 200, // Short summary token limit
        temperature: 0.3
      });
    });

    it('should include focus area in prompt when provided', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'SUMMARY:\nFocused summary.\n\nKEY POINTS:\n• Focused point\n\nWORD COUNT: 2'
          }
        }]
      };

      mockCreate.mockResolvedValue(mockResponse as any);

      const options: SummaryOptions = {
        length: 'medium',
        style: 'academic',
        focus: 'machine learning algorithms'
      };

      await aiService.generateSummary(mockText, options);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining('Focus particularly on: machine learning algorithms')
            })
          ])
        })
      );
    });

    it('should handle different summary styles', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'SUMMARY:\n• Bullet point 1\n• Bullet point 2\n\nKEY POINTS:\n• Point 1\n\nWORD COUNT: 6'
          }
        }]
      };

      mockCreate.mockResolvedValue(mockResponse as any);

      const options: SummaryOptions = {
        length: 'medium',
        style: 'bullet-points'
      };

      await aiService.generateSummary(mockText, options);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining('Present the summary as clear, organized bullet points')
            })
          ])
        })
      );
    });

    it('should handle malformed AI responses gracefully', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'Just a plain summary without proper formatting'
          }
        }]
      };

      mockCreate.mockResolvedValue(mockResponse as any);

      const options: SummaryOptions = {
        length: 'short',
        style: 'extractive'
      };

      const result = await aiService.generateSummary(mockText, options);

      expect(result.summary).toBe('Just a plain summary without proper formatting');
      expect(result.keyPoints).toEqual([]);
      expect(result.wordCount).toBeGreaterThan(0); // Should calculate from summary
    });

    it('should throw error when no content is received', async () => {
      const mockResponse = {
        choices: [{}] // No message content
      };

      mockCreate.mockResolvedValue(mockResponse as any);

      const options: SummaryOptions = {
        length: 'short',
        style: 'extractive'
      };

      await expect(aiService.generateSummary(mockText, options))
        .rejects.toThrow('Failed to generate summary: No content received from AI service');
    });

    it('should handle OpenAI API errors', async () => {
      mockCreate.mockRejectedValue(new Error('API rate limit exceeded'));

      const options: SummaryOptions = {
        length: 'short',
        style: 'extractive'
      };

      await expect(aiService.generateSummary(mockText, options))
        .rejects.toThrow('Failed to generate summary: API rate limit exceeded');
    });
  });

  describe('testConnection', () => {
    it('should return true when connection is successful', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'Hello!'
          }
        }]
      };

      mockCreate.mockResolvedValue(mockResponse as any);

      const result = await aiService.testConnection();

      expect(result).toBe(true);
      expect(mockCreate).toHaveBeenCalledWith({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 10
      });
    });

    it('should return false when connection fails', async () => {
      mockCreate.mockRejectedValue(new Error('Connection failed'));

      const result = await aiService.testConnection();

      expect(result).toBe(false);
    });
  });
});

describe('createAIService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should create AI service with environment variables', () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_BASE_URL = 'https://custom.api.com';
    process.env.OPENAI_MODEL = 'gpt-4';
    process.env.OPENAI_MAX_TOKENS = '1000';
    process.env.OPENAI_TEMPERATURE = '0.5';

    const service = createAIService();

    expect(MockedOpenAI).toHaveBeenCalledWith({
      apiKey: 'test-key',
      baseURL: 'https://custom.api.com'
    });
  });

  it('should use default values when environment variables are not set', () => {
    process.env.OPENAI_API_KEY = 'test-key';
    // Other env vars not set

    const service = createAIService();

    expect(MockedOpenAI).toHaveBeenCalledWith({
      apiKey: 'test-key',
      baseURL: undefined
    });
  });

  it('should throw error when API key is not provided', () => {
    delete process.env.OPENAI_API_KEY;

    expect(() => createAIService()).toThrow('OPENAI_API_KEY environment variable is required');
  });
});