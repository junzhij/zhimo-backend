import OpenAI from 'openai';

export interface AIServiceConfig {
  apiKey: string;
  baseURL?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface SummaryOptions {
  length: 'short' | 'medium' | 'long';
  style: 'extractive' | 'abstractive' | 'bullet-points' | 'academic';
  focus?: string; // Optional focus area for the summary
}

export interface SummaryResult {
  summary: string;
  keyPoints: string[];
  wordCount: number;
  confidence: number;
}

export class AIService {
  private client: OpenAI;
  private config: AIServiceConfig;

  constructor(config: AIServiceConfig) {
    this.config = {
      model: 'gpt-3.5-turbo',
      maxTokens: 2000,
      temperature: 0.3,
      ...config
    };

    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL,
    });
  }

  async generateSummary(text: string, options: SummaryOptions): Promise<SummaryResult> {
    const prompt = this.buildSummaryPrompt(text, options);
    
    try {
      const response = await this.client.chat.completions.create({
        model: this.config.model!,
        messages: [
          {
            role: 'system',
            content: 'You are an expert academic content summarizer. Generate accurate, well-structured summaries that preserve key information and maintain academic rigor.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: this.getMaxTokensForLength(options.length),
        temperature: this.config.temperature,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content received from AI service');
      }

      return this.parseSummaryResponse(content);
    } catch (error) {
      console.error('Error generating summary:', error);
      throw new Error(`Failed to generate summary: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private buildSummaryPrompt(text: string, options: SummaryOptions): string {
    const lengthInstructions = {
      short: 'Create a concise summary in 2-3 sentences (50-100 words)',
      medium: 'Create a comprehensive summary in 1-2 paragraphs (150-300 words)',
      long: 'Create a detailed summary in 3-4 paragraphs (400-600 words)'
    };

    const styleInstructions = {
      extractive: 'Use key sentences and phrases directly from the original text',
      abstractive: 'Rephrase and synthesize the content in your own words',
      'bullet-points': 'Present the summary as clear, organized bullet points',
      academic: 'Use formal academic language and maintain scholarly tone'
    };

    let prompt = `Please summarize the following text with these requirements:
- Length: ${lengthInstructions[options.length]}
- Style: ${styleInstructions[options.style]}`;

    if (options.focus) {
      prompt += `\n- Focus particularly on: ${options.focus}`;
    }

    prompt += `\n\nAfter the summary, provide:
1. Key Points: List 3-5 main points as bullet points
2. Word Count: Approximate word count of your summary

Format your response as:
SUMMARY:
[Your summary here]

KEY POINTS:
• [Point 1]
• [Point 2]
• [Point 3]

WORD COUNT: [number]

Text to summarize:
${text}`;

    return prompt;
  }

  private getMaxTokensForLength(length: SummaryOptions['length']): number {
    const tokenLimits = {
      short: 200,
      medium: 500,
      long: 800
    };
    return tokenLimits[length];
  }

  private parseSummaryResponse(content: string): SummaryResult {
    const sections = content.split(/(?:SUMMARY:|KEY POINTS:|WORD COUNT:)/i);
    
    let summary = '';
    let keyPoints: string[] = [];
    let wordCount = 0;

    // Extract summary
    if (sections[1]) {
      summary = sections[1].trim().split('KEY POINTS:')[0].trim();
    }

    // Extract key points
    if (sections[2]) {
      const keyPointsText = sections[2].split('WORD COUNT:')[0].trim();
      keyPoints = keyPointsText
        .split('\n')
        .map(line => line.replace(/^[•\-\*]\s*/, '').trim())
        .filter(point => point.length > 0);
    }

    // Extract word count
    if (sections[3]) {
      const wordCountMatch = sections[3].match(/(\d+)/);
      if (wordCountMatch) {
        wordCount = parseInt(wordCountMatch[1]);
      }
    }

    // Fallback: count words if not provided
    if (wordCount === 0) {
      wordCount = summary.split(/\s+/).length;
    }

    return {
      summary: summary || content.trim(),
      keyPoints,
      wordCount,
      confidence: 0.85 // Default confidence score
    };
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.config.model!,
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 10,
      });
      return !!response.choices[0]?.message?.content;
    } catch (error) {
      console.error('AI service connection test failed:', error);
      return false;
    }
  }
}

// Factory function to create AI service from environment variables
export function createAIService(): AIService {
  const config: AIServiceConfig = {
    apiKey: process.env.OPENAI_API_KEY || '',
    baseURL: process.env.OPENAI_BASE_URL,
    model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
    maxTokens: process.env.OPENAI_MAX_TOKENS ? parseInt(process.env.OPENAI_MAX_TOKENS) : 2000,
    temperature: process.env.OPENAI_TEMPERATURE ? parseFloat(process.env.OPENAI_TEMPERATURE) : 0.3,
  };

  if (!config.apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }

  return new AIService(config);
}