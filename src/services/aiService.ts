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

export interface TopicModelingOptions {
  numTopics?: number; // Number of topics to extract (default: 5)
  includeKeywords?: boolean; // Include keywords for each topic
  includeThemes?: boolean; // Include broader themes
  minTopicRelevance?: number; // Minimum relevance score (0-1)
}

export interface Topic {
  id: string;
  title: string;
  description: string;
  keywords: string[];
  relevanceScore: number;
  documentCoverage: number; // Percentage of document this topic covers
}

export interface TopicModelingResult {
  topics: Topic[];
  mainThemes: string[];
  topicDistribution: { [topicId: string]: number };
  confidence: number;
}

export interface StructureAnalysisOptions {
  includeArgumentFlow?: boolean; // Analyze argument structure
  includeMindMap?: boolean; // Generate mind map data
  includeConclusions?: boolean; // Identify conclusions
  analyzeLogicalFlow?: boolean; // Analyze logical progression
}

export interface ArgumentNode {
  id: string;
  type: 'premise' | 'conclusion' | 'evidence' | 'counterargument' | 'rebuttal';
  content: string;
  position: {
    section: string;
    paragraph: number;
  };
  connections: string[]; // IDs of connected nodes
  strength: number; // 0-1 strength of the argument
}

export interface MindMapNode {
  id: string;
  title: string;
  content: string;
  level: number; // 0 = root, 1 = main branch, 2+ = sub-branches
  parentId?: string;
  children: string[]; // IDs of child nodes
  position: {
    section: string;
    order: number;
  };
  nodeType: 'concept' | 'detail' | 'example' | 'definition' | 'conclusion';
}

export interface DocumentStructureResult {
  logicalStructure: {
    introduction: string[];
    mainPoints: string[];
    conclusions: string[];
    transitions: string[];
  };
  argumentFlow: ArgumentNode[];
  mindMapData: MindMapNode[];
  structuralInsights: {
    documentType: string; // 'academic', 'report', 'essay', 'research'
    organizationPattern: string; // 'chronological', 'problem-solution', 'compare-contrast', etc.
    coherenceScore: number; // 0-1 how well structured the document is
    complexityLevel: 'basic' | 'intermediate' | 'advanced';
  };
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

  async extractTopics(text: string, options: TopicModelingOptions = {}): Promise<TopicModelingResult> {
    const prompt = this.buildTopicModelingPrompt(text, options);
    
    try {
      const response = await this.client.chat.completions.create({
        model: this.config.model!,
        messages: [
          {
            role: 'system',
            content: 'You are an expert in topic modeling and thematic analysis. Extract meaningful topics and themes from academic content with high accuracy and relevance.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1500,
        temperature: 0.2, // Lower temperature for more consistent topic extraction
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content received from AI service');
      }

      return this.parseTopicModelingResponse(content);
    } catch (error) {
      console.error('Error extracting topics:', error);
      throw new Error(`Failed to extract topics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private buildTopicModelingPrompt(text: string, options: TopicModelingOptions): string {
    const numTopics = options.numTopics || 5;
    const minRelevance = options.minTopicRelevance || 0.3;

    let prompt = `Analyze the following text and extract ${numTopics} main topics. For each topic, provide:

1. A unique ID (topic_1, topic_2, etc.)
2. A concise title (2-4 words)
3. A brief description (1-2 sentences)
4. 3-5 relevant keywords
5. A relevance score (0.0-1.0) indicating how important this topic is to the overall document
6. Document coverage percentage (estimate what % of the document relates to this topic)

Additionally, identify 3-5 broader themes that encompass multiple topics.

Format your response exactly as follows:

TOPICS:
ID: topic_1
Title: [Topic Title]
Description: [Brief description]
Keywords: keyword1, keyword2, keyword3, keyword4
Relevance: 0.XX
Coverage: XX%

ID: topic_2
Title: [Topic Title]
Description: [Brief description]
Keywords: keyword1, keyword2, keyword3, keyword4
Relevance: 0.XX
Coverage: XX%

[Continue for all topics...]

THEMES:
• [Theme 1]
• [Theme 2]
• [Theme 3]

TOPIC_DISTRIBUTION:
topic_1: XX%
topic_2: XX%
[Continue for all topics...]

Only include topics with relevance scores above ${minRelevance}.

Text to analyze:
${text}`;

    return prompt;
  }

  private parseTopicModelingResponse(content: string): TopicModelingResult {
    const topics: Topic[] = [];
    const mainThemes: string[] = [];
    const topicDistribution: { [topicId: string]: number } = {};

    try {
      // Extract topics section
      const topicsMatch = content.match(/TOPICS:(.*?)(?=THEMES:|$)/s);
      if (topicsMatch) {
        const topicsText = topicsMatch[1];
        const topicBlocks = topicsText.split(/ID:\s*/).filter(block => block.trim());

        for (const block of topicBlocks) {
          const lines = block.trim().split('\n');
          const topicId = lines[0]?.trim();
          
          if (!topicId) continue;

          const titleMatch = block.match(/Title:\s*(.+)/);
          const descMatch = block.match(/Description:\s*(.+)/);
          const keywordsMatch = block.match(/Keywords:\s*(.+)/);
          const relevanceMatch = block.match(/Relevance:\s*([\d.]+)/);
          const coverageMatch = block.match(/Coverage:\s*([\d.]+)%/);

          if (titleMatch && descMatch && keywordsMatch && relevanceMatch && coverageMatch) {
            topics.push({
              id: topicId,
              title: titleMatch[1].trim(),
              description: descMatch[1].trim(),
              keywords: keywordsMatch[1].split(',').map(k => k.trim()),
              relevanceScore: parseFloat(relevanceMatch[1]),
              documentCoverage: parseFloat(coverageMatch[1])
            });
          }
        }
      }

      // Extract themes section
      const themesMatch = content.match(/THEMES:(.*?)(?=TOPIC_DISTRIBUTION:|$)/s);
      if (themesMatch) {
        const themesText = themesMatch[1];
        const themeLines = themesText.split('\n').filter(line => line.trim().startsWith('•'));
        for (const line of themeLines) {
          const theme = line.replace(/^[•\-\*]\s*/, '').trim();
          if (theme) {
            mainThemes.push(theme);
          }
        }
      }

      // Extract topic distribution
      const distributionMatch = content.match(/TOPIC_DISTRIBUTION:(.*?)$/s);
      if (distributionMatch) {
        const distributionText = distributionMatch[1];
        const distributionLines = distributionText.split('\n').filter(line => line.includes(':'));
        for (const line of distributionLines) {
          const [topicId, percentage] = line.split(':').map(s => s.trim());
          const percentValue = parseFloat(percentage.replace('%', ''));
          if (topicId && !isNaN(percentValue)) {
            topicDistribution[topicId] = percentValue;
          }
        }
      }

    } catch (error) {
      console.error('Error parsing topic modeling response:', error);
    }

    return {
      topics,
      mainThemes,
      topicDistribution,
      confidence: topics.length > 0 ? 0.8 : 0.3
    };
  }

  async analyzeDocumentStructure(text: string, options: StructureAnalysisOptions = {}): Promise<DocumentStructureResult> {
    const prompt = this.buildStructureAnalysisPrompt(text, options);
    
    try {
      const response = await this.client.chat.completions.create({
        model: this.config.model!,
        messages: [
          {
            role: 'system',
            content: 'You are an expert in document analysis and logical structure. Analyze academic and professional documents to identify their organizational patterns, argument flows, and structural elements with high precision.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 2000,
        temperature: 0.1, // Very low temperature for consistent structural analysis
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content received from AI service');
      }

      return this.parseStructureAnalysisResponse(content);
    } catch (error) {
      console.error('Error analyzing document structure:', error);
      throw new Error(`Failed to analyze document structure: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private buildStructureAnalysisPrompt(text: string, options: StructureAnalysisOptions): string {
    let prompt = `Analyze the logical structure and organization of the following document. Provide:

1. LOGICAL STRUCTURE:
   - Introduction elements (thesis, overview, objectives)
   - Main points (key arguments, topics, sections)
   - Conclusions (findings, recommendations, final thoughts)
   - Transitions (connecting phrases, logical bridges)

2. DOCUMENT INSIGHTS:
   - Document type (academic, report, essay, research, etc.)
   - Organization pattern (chronological, problem-solution, compare-contrast, cause-effect, etc.)
   - Coherence score (0.0-1.0) - how well structured and logical the document is
   - Complexity level (basic, intermediate, advanced)`;

    if (options.includeArgumentFlow) {
      prompt += `

3. ARGUMENT FLOW:
   For each argument element, provide:
   - Unique ID (arg_1, arg_2, etc.)
   - Type (premise, conclusion, evidence, counterargument, rebuttal)
   - Content (brief description)
   - Section location
   - Connected argument IDs
   - Strength score (0.0-1.0)`;
    }

    if (options.includeMindMap) {
      prompt += `

4. MIND MAP STRUCTURE:
   Create a hierarchical mind map with:
   - Node ID (node_1, node_2, etc.)
   - Title (concise label)
   - Content (brief description)
   - Level (0=root, 1=main branch, 2+=sub-branch)
   - Parent ID (if applicable)
   - Node type (concept, detail, example, definition, conclusion)`;
    }

    prompt += `

Format your response exactly as follows:

LOGICAL_STRUCTURE:
Introduction:
• [Introduction element 1]
• [Introduction element 2]

Main Points:
• [Main point 1]
• [Main point 2]
• [Main point 3]

Conclusions:
• [Conclusion 1]
• [Conclusion 2]

Transitions:
• [Transition 1]
• [Transition 2]

DOCUMENT_INSIGHTS:
Type: [document type]
Pattern: [organization pattern]
Coherence: 0.XX
Complexity: [complexity level]`;

    if (options.includeArgumentFlow) {
      prompt += `

ARGUMENT_FLOW:
ID: arg_1
Type: [type]
Content: [brief description]
Section: [section name]
Connections: arg_2, arg_3
Strength: 0.XX

[Continue for all arguments...]`;
    }

    if (options.includeMindMap) {
      prompt += `

MIND_MAP:
ID: node_1
Title: [title]
Content: [description]
Level: 0
Parent: none
Type: concept

ID: node_2
Title: [title]
Content: [description]
Level: 1
Parent: node_1
Type: detail

[Continue for all nodes...]`;
    }

    prompt += `

Text to analyze:
${text}`;

    return prompt;
  }

  private parseStructureAnalysisResponse(content: string): DocumentStructureResult {
    const result: DocumentStructureResult = {
      logicalStructure: {
        introduction: [],
        mainPoints: [],
        conclusions: [],
        transitions: []
      },
      argumentFlow: [],
      mindMapData: [],
      structuralInsights: {
        documentType: 'unknown',
        organizationPattern: 'unknown',
        coherenceScore: 0.5,
        complexityLevel: 'intermediate'
      },
      confidence: 0.7
    };

    try {
      // Parse logical structure
      const logicalMatch = content.match(/LOGICAL_STRUCTURE:(.*?)(?=DOCUMENT_INSIGHTS:|ARGUMENT_FLOW:|MIND_MAP:|$)/s);
      if (logicalMatch) {
        const logicalText = logicalMatch[1];
        
        const introMatch = logicalText.match(/Introduction:(.*?)(?=Main Points:|$)/s);
        if (introMatch) {
          result.logicalStructure.introduction = this.extractBulletPoints(introMatch[1]);
        }

        const mainPointsMatch = logicalText.match(/Main Points:(.*?)(?=Conclusions:|$)/s);
        if (mainPointsMatch) {
          result.logicalStructure.mainPoints = this.extractBulletPoints(mainPointsMatch[1]);
        }

        const conclusionsMatch = logicalText.match(/Conclusions:(.*?)(?=Transitions:|$)/s);
        if (conclusionsMatch) {
          result.logicalStructure.conclusions = this.extractBulletPoints(conclusionsMatch[1]);
        }

        const transitionsMatch = logicalText.match(/Transitions:(.*?)$/s);
        if (transitionsMatch) {
          result.logicalStructure.transitions = this.extractBulletPoints(transitionsMatch[1]);
        }
      }

      // Parse document insights
      const insightsMatch = content.match(/DOCUMENT_INSIGHTS:(.*?)(?=ARGUMENT_FLOW:|MIND_MAP:|$)/s);
      if (insightsMatch) {
        const insightsText = insightsMatch[1];
        
        const typeMatch = insightsText.match(/Type:\s*(.+)/);
        if (typeMatch) result.structuralInsights.documentType = typeMatch[1].trim();

        const patternMatch = insightsText.match(/Pattern:\s*(.+)/);
        if (patternMatch) result.structuralInsights.organizationPattern = patternMatch[1].trim();

        const coherenceMatch = insightsText.match(/Coherence:\s*([\d.]+)/);
        if (coherenceMatch) result.structuralInsights.coherenceScore = parseFloat(coherenceMatch[1]);

        const complexityMatch = insightsText.match(/Complexity:\s*(.+)/);
        if (complexityMatch) {
          const complexity = complexityMatch[1].trim().toLowerCase();
          if (['basic', 'intermediate', 'advanced'].includes(complexity)) {
            result.structuralInsights.complexityLevel = complexity as 'basic' | 'intermediate' | 'advanced';
          }
        }
      }

      // Parse argument flow
      const argumentMatch = content.match(/ARGUMENT_FLOW:(.*?)(?=MIND_MAP:|$)/s);
      if (argumentMatch) {
        const argumentText = argumentMatch[1];
        const argumentBlocks = argumentText.split(/ID:\s*/).filter(block => block.trim());

        for (const block of argumentBlocks) {
          const lines = block.trim().split('\n');
          const argId = lines[0]?.trim();
          
          if (!argId) continue;

          const typeMatch = block.match(/Type:\s*(.+)/);
          const contentMatch = block.match(/Content:\s*(.+)/);
          const sectionMatch = block.match(/Section:\s*(.+)/);
          const connectionsMatch = block.match(/Connections:\s*(.+)/);
          const strengthMatch = block.match(/Strength:\s*([\d.]+)/);

          if (typeMatch && contentMatch && sectionMatch) {
            const connections = connectionsMatch ? 
              connectionsMatch[1].split(',').map(c => c.trim()).filter(c => c) : [];

            result.argumentFlow.push({
              id: argId,
              type: typeMatch[1].trim() as ArgumentNode['type'],
              content: contentMatch[1].trim(),
              position: {
                section: sectionMatch[1].trim(),
                paragraph: 1 // Default, could be enhanced
              },
              connections,
              strength: strengthMatch ? parseFloat(strengthMatch[1]) : 0.5
            });
          }
        }
      }

      // Parse mind map
      const mindMapMatch = content.match(/MIND_MAP:(.*?)$/s);
      if (mindMapMatch) {
        const mindMapText = mindMapMatch[1];
        const nodeBlocks = mindMapText.split(/ID:\s*/).filter(block => block.trim());

        for (const block of nodeBlocks) {
          const lines = block.trim().split('\n');
          const nodeId = lines[0]?.trim();
          
          if (!nodeId) continue;

          const titleMatch = block.match(/Title:\s*(.+)/);
          const contentMatch = block.match(/Content:\s*(.+)/);
          const levelMatch = block.match(/Level:\s*(\d+)/);
          const parentMatch = block.match(/Parent:\s*(.+)/);
          const typeMatch = block.match(/Type:\s*(.+)/);

          if (titleMatch && contentMatch && levelMatch && typeMatch) {
            const parentId = parentMatch && parentMatch[1].trim() !== 'none' ? 
              parentMatch[1].trim() : undefined;

            result.mindMapData.push({
              id: nodeId,
              title: titleMatch[1].trim(),
              content: contentMatch[1].trim(),
              level: parseInt(levelMatch[1]),
              parentId,
              children: [], // Will be populated after all nodes are parsed
              position: {
                section: 'document',
                order: result.mindMapData.length
              },
              nodeType: typeMatch[1].trim() as MindMapNode['nodeType']
            });
          }
        }

        // Populate children arrays
        for (const node of result.mindMapData) {
          if (node.parentId) {
            const parent = result.mindMapData.find(n => n.id === node.parentId);
            if (parent) {
              parent.children.push(node.id);
            }
          }
        }
      }

    } catch (error) {
      console.error('Error parsing structure analysis response:', error);
    }

    return result;
  }

  private extractBulletPoints(text: string): string[] {
    return text
      .split('\n')
      .map(line => line.replace(/^[•\-\*]\s*/, '').trim())
      .filter(point => point.length > 0);
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