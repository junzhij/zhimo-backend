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
  element_type: 'summary' | 'definition' | 'formula' | 'question' | 'topic' | 'entity';
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