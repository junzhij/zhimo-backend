# Analysis Agent - Summary Generation

The Analysis Agent is responsible for generating various types of summaries from structured text content. It supports multiple summary styles, lengths, and can focus on specific topics.

## Features

### Summary Types
- **Extractive**: Uses key sentences directly from the original text
- **Abstractive**: Rephrases and synthesizes content in new words
- **Bullet Points**: Presents summary as organized bullet points
- **Academic**: Uses formal academic language and scholarly tone

### Summary Lengths
- **Short**: 2-3 sentences (50-100 words)
- **Medium**: 1-2 paragraphs (150-300 words)
- **Long**: 3-4 paragraphs (400-600 words)

### Advanced Features
- **Focused Summaries**: Generate summaries focused on specific topics
- **Section Summaries**: Create individual summaries for document sections
- **Batch Processing**: Generate multiple summary types simultaneously
- **Confidence Scoring**: AI-generated confidence levels for summary quality
- **Metadata Tracking**: Comprehensive metadata including word counts, key points, and tags

## Configuration

### Environment Variables

```bash
# Required
OPENAI_API_KEY=your_openai_api_key

# Optional - Customize AI provider
OPENAI_BASE_URL=https://api.openai.com/v1  # Default OpenAI
OPENAI_MODEL=gpt-3.5-turbo                 # Default model
OPENAI_MAX_TOKENS=2000                     # Default max tokens
OPENAI_TEMPERATURE=0.3                     # Default temperature

# Alternative providers (examples)
# Azure OpenAI
OPENAI_BASE_URL=https://your-resource.openai.azure.com/
OPENAI_API_KEY=your_azure_api_key

# Other OpenAI-compatible providers
OPENAI_BASE_URL=https://api.anthropic.com/v1
OPENAI_API_KEY=your_anthropic_api_key
```

### Database Configuration (Optional)

```bash
MONGODB_URL=mongodb://localhost:27017
MONGODB_DATABASE=zhimo_knowledge
```

## Usage

### Basic Usage

```typescript
import { AnalysisAgent } from './agents/analysis';
import { StructuredText } from './types';

// Initialize the agent
const analysisAgent = new AnalysisAgent();

// Your structured text (from Ingestion Agent)
const structuredText: StructuredText = {
  title: 'Document Title',
  sections: [
    {
      heading: 'Section 1',
      content: 'Section content...'
    }
  ],
  metadata: {
    wordCount: 100,
    pageCount: 1
  }
};

// Generate a summary
const summary = await analysisAgent.generateSummary(
  'document-id',
  structuredText,
  {
    length: 'medium',
    style: 'abstractive'
  }
);

console.log(summary.content.body);
```

### Advanced Usage

```typescript
// Generate multiple summary types
const summaryConfigs = [
  { length: 'short', style: 'extractive' },
  { length: 'medium', style: 'abstractive' },
  { length: 'long', style: 'academic' }
];

const summaries = await analysisAgent.generateMultipleSummaries(
  'document-id',
  structuredText,
  summaryConfigs
);

// Generate focused summary
const focusedSummary = await analysisAgent.generateSummary(
  'document-id',
  structuredText,
  {
    length: 'medium',
    style: 'academic',
    focus: 'machine learning algorithms'
  }
);

// Generate section summaries
const sectionSummaries = await analysisAgent.generateSectionSummaries(
  'document-id',
  structuredText,
  { length: 'short', style: 'abstractive' }
);
```

### With Database Storage

```typescript
// Initialize with MongoDB connection
const analysisAgent = new AnalysisAgent({
  mongoUrl: 'mongodb://localhost:27017',
  dbName: 'zhimo_knowledge'
});

// Summaries are automatically stored in the database
const summary = await analysisAgent.generateSummary(
  'document-id',
  structuredText,
  { length: 'medium', style: 'abstractive' }
);

// Retrieve stored summaries
const storedSummaries = await analysisAgent.getSummariesByDocument('document-id');
```

## API Reference

### AnalysisAgent Class

#### Constructor
```typescript
constructor(config?: AnalysisAgentConfig)
```

#### Methods

##### generateSummary
```typescript
async generateSummary(
  documentId: string,
  structuredText: StructuredText,
  options: SummaryOptions
): Promise<KnowledgeElement>
```

##### generateMultipleSummaries
```typescript
async generateMultipleSummaries(
  documentId: string,
  structuredText: StructuredText,
  summaryConfigs: SummaryOptions[]
): Promise<KnowledgeElement[]>
```

##### generateSectionSummaries
```typescript
async generateSectionSummaries(
  documentId: string,
  structuredText: StructuredText,
  options: SummaryOptions
): Promise<KnowledgeElement[]>
```

##### getSummariesByDocument
```typescript
async getSummariesByDocument(documentId: string): Promise<KnowledgeElement[]>
```

##### testAIConnection
```typescript
async testAIConnection(): Promise<boolean>
```

### Types

#### SummaryOptions
```typescript
interface SummaryOptions {
  length: 'short' | 'medium' | 'long';
  style: 'extractive' | 'abstractive' | 'bullet-points' | 'academic';
  focus?: string; // Optional focus area
}
```

#### KnowledgeElement
```typescript
interface KnowledgeElement {
  _id?: string;
  document_id: string;
  agent_type: 'analysis';
  element_type: 'summary';
  content: {
    title: string;
    body: string;
    metadata: {
      summaryType: string;
      summaryLength: string;
      keyPoints: string[];
      wordCount: number;
      confidence: number;
      focus?: string;
      originalWordCount: number;
    };
  };
  source_location: {
    section: string;
    page?: number;
    position?: any;
  };
  created_at: Date;
  tags: string[];
}
```

## Testing

### Unit Tests
```bash
npm test -- --testPathPattern="analysisAgent.test.ts"
```

### AI Service Tests
```bash
npm test -- --testPathPattern="aiService.test.ts"
```

### Integration Tests (requires API key)
```bash
# Set OPENAI_API_KEY environment variable first
npm test -- --testPathPattern="analysisAgent.integration.test.ts"
```

### Run Example Demo
```bash
# Set OPENAI_API_KEY environment variable first
npx ts-node src/agents/analysis/example.ts
```

## Error Handling

The Analysis Agent includes comprehensive error handling:

- **AI Service Errors**: Graceful handling of API failures with detailed error messages
- **Network Issues**: Automatic retry logic and timeout handling
- **Invalid Input**: Validation of structured text and options
- **Database Errors**: Optional database operations with fallback behavior

## Performance Considerations

- **Token Limits**: Automatic token management based on summary length
- **Batch Processing**: Efficient handling of multiple summary requests
- **Caching**: Optional Redis caching for frequently requested summaries
- **Rate Limiting**: Built-in respect for AI provider rate limits

## Integration with Other Agents

The Analysis Agent is designed to work seamlessly with other agents in the ZhiMo system:

1. **Ingestion Agent** → Provides structured text input
2. **Analysis Agent** → Generates summaries and analysis
3. **Knowledge Extraction Agent** → Uses summaries for entity extraction
4. **Pedagogy Agent** → Creates study materials from summaries
5. **Synthesis Agent** → Compiles summaries into notebooks

## Troubleshooting

### Common Issues

1. **API Key Not Set**
   ```
   Error: OPENAI_API_KEY environment variable is required
   ```
   Solution: Set the `OPENAI_API_KEY` environment variable

2. **Connection Timeout**
   ```
   Error: Failed to generate summary: Request timeout
   ```
   Solution: Check network connection and API provider status

3. **Invalid Model**
   ```
   Error: Model not found
   ```
   Solution: Verify the `OPENAI_MODEL` environment variable is set to a valid model

4. **Rate Limit Exceeded**
   ```
   Error: API rate limit exceeded
   ```
   Solution: Implement exponential backoff or upgrade API plan

### Debug Mode

Enable debug logging by setting:
```bash
LOG_LEVEL=debug
```

This will provide detailed information about API calls, response parsing, and error conditions.