// Type definitions for the application

export interface Document {
  id: string;
  user_id: string;
  original_name: string;
  file_type: string;
  file_size: number;
  s3_path: string;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  upload_timestamp: Date;
  processed_timestamp?: Date;
  metadata?: any;
}

export interface KnowledgeElement {
  _id?: string;
  document_id: string;
  agent_type: 'analysis' | 'extraction' | 'pedagogy';
  element_type: 'summary' | 'definition' | 'formula' | 'question' | 'topic' | 'entity' | 'theme' | 'structure' | 'argument' | 'mindmap' | 'concept' | 'theorem' | 'relationship';
  content: {
    title: string;
    body: string;
    metadata?: any;
  };
  source_location: {
    section: string;
    page?: number;
    position?: any;
  };
  created_at: Date;
  tags: string[];
}

export interface StructuredText {
  title: string;
  sections: Array<{
    heading: string;
    content: string;
    subsections?: Array<{
      heading: string;
      content: string;
    }>;
  }>;
  metadata: {
    wordCount: number;
    pageCount?: number;
    language?: string;
    [key: string]: any;
  };
}

export interface SummaryRequest {
  documentId: string;
  structuredText: StructuredText;
  options: {
    length: 'short' | 'medium' | 'long';
    style: 'extractive' | 'abstractive' | 'bullet-points' | 'academic';
    focus?: string;
  };
}

export interface Annotation {
  id: string;
  user_id: string;
  document_id: string;
  annotation_type: 'highlight' | 'note' | 'bookmark';
  content: string;
  position_data: any;
  created_at: Date;
  updated_at: Date;
}

export interface ReviewNotebook {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  created_at: Date;
  updated_at: Date;
}

export interface NotebookComposition {
  id: string;
  notebook_id: string;
  element_type: 'knowledge_element' | 'annotation';
  element_id: string;
  order_index: number;
}

export interface AgentTask {
  id: string;
  agent_type: string;
  task_type: string;
  payload: any;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: Date;
  completed_at?: Date;
  error_message?: string;
}

export interface FileUploadRequest {
  userId: string;
  file: Express.Multer.File;
}

export interface FileUploadResponse {
  documentId: string;
  originalName: string;
  fileType: string;
  s3Path: string;
  uploadTimestamp: Date;
  processingStatus: string;
}

export interface S3UploadResult {
  key: string;
  location: string;
  bucket: string;
  etag: string;
}

// Pedagogy Agent Types
export interface QuestionGenerationOptions {
  questionTypes: ('multiple_choice' | 'fill_in_blank' | 'short_answer' | 'essay')[];
  difficulty: 'easy' | 'medium' | 'hard';
  numQuestions: number;
  focusAreas?: string[];
}

export interface MultipleChoiceQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number; // Index of correct option
  explanation: string;
  difficulty: 'easy' | 'medium' | 'hard';
  sourceLocation: {
    section: string;
    page?: number;
  };
  tags: string[];
}

export interface FillInBlankQuestion {
  id: string;
  question: string; // Text with blanks marked as ___
  answers: string[]; // Correct answers for each blank
  explanation: string;
  difficulty: 'easy' | 'medium' | 'hard';
  sourceLocation: {
    section: string;
    page?: number;
  };
  tags: string[];
}

export interface ShortAnswerQuestion {
  id: string;
  question: string;
  sampleAnswer: string;
  keyPoints: string[]; // Key points that should be in the answer
  difficulty: 'easy' | 'medium' | 'hard';
  sourceLocation: {
    section: string;
    page?: number;
  };
  tags: string[];
}

export interface EssayQuestion {
  id: string;
  question: string;
  guidelines: string; // Guidelines for answering
  keyThemes: string[]; // Themes that should be addressed
  suggestedLength: string; // e.g., "300-500 words"
  difficulty: 'easy' | 'medium' | 'hard';
  sourceLocation: {
    section: string;
    page?: number;
  };
  tags: string[];
}

export interface QuestionGenerationResult {
  multipleChoice: MultipleChoiceQuestion[];
  fillInBlank: FillInBlankQuestion[];
  shortAnswer: ShortAnswerQuestion[];
  essay: EssayQuestion[];
  totalGenerated: number;
  confidence: number;
}

export interface FlashcardOptions {
  includeDefinitions: boolean;
  includeFormulas: boolean;
  includeConcepts: boolean;
  difficulty: 'easy' | 'medium' | 'hard';
  spacedRepetition: boolean;
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  cardType: 'definition' | 'formula' | 'concept' | 'fact';
  difficulty: 'easy' | 'medium' | 'hard';
  sourceLocation: {
    section: string;
    page?: number;
  };
  tags: string[];
  spacedRepetitionData?: {
    easeFactor: number;
    interval: number;
    repetitions: number;
    nextReviewDate: Date;
  };
}

export interface FlashcardGenerationResult {
  flashcards: Flashcard[];
  totalGenerated: number;
  confidence: number;
}

export interface OpenEndedQuestionOptions {
  questionTypes: ('discussion' | 'critical_thinking' | 'socratic' | 'analysis')[];
  complexity: 'basic' | 'intermediate' | 'advanced';
  numQuestions: number;
  focusThemes?: string[];
}

export interface OpenEndedQuestion {
  id: string;
  question: string;
  questionType: 'discussion' | 'critical_thinking' | 'socratic' | 'analysis';
  complexity: 'basic' | 'intermediate' | 'advanced';
  guidingPoints: string[]; // Points to help guide the answer
  relatedConcepts: string[];
  sourceLocation: {
    section: string;
    page?: number;
  };
  tags: string[];
}

export interface OpenEndedQuestionResult {
  questions: OpenEndedQuestion[];
  totalGenerated: number;
  confidence: number;
}