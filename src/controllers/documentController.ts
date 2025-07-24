import { Request, Response } from 'express';
import { s3Service } from '../services/s3Service';
import { FileUploadResponse, Document } from '../types';
import { documentModel, ProcessingStatus } from '../models/documentModel';
import { User } from '../models/userModel';
import path from 'path';

// Use the global Request interface extension that includes User
interface AuthenticatedRequest extends Request {
  user?: User;
}

export class DocumentController {
  /**
   * Handles file upload to S3 and saves document metadata to database
   */
  async uploadDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // Check if file was uploaded
      if (!req.file) {
        res.status(400).json({
          error: 'No file uploaded',
          message: 'Please select a file to upload'
        });
        return;
      }

      // Extract user ID from request (assuming it's set by auth middleware)
      const userId = req.user?.id || req.body.userId || req.headers['user-id'];
      if (!userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User ID is required'
        });
        return;
      }

      const file = req.file;
      
      // Upload file to S3
      const uploadResult = await s3Service.uploadFile({
        userId: userId as string,
        originalName: file.originalname,
        fileBuffer: file.buffer,
        mimeType: file.mimetype,
      });

      // Determine file type from extension
      const fileExtension = path.extname(file.originalname).toLowerCase();
      const fileType = this.getFileTypeFromExtension(fileExtension);

      // Create document metadata
      const metadata = {
        mimeType: file.mimetype,
        s3Bucket: uploadResult.bucket,
        s3ETag: uploadResult.etag,
        uploadLocation: uploadResult.location
      };

      // Create document using model
      const document = await documentModel.create({
        userId: userId as string,
        originalName: file.originalname,
        fileType,
        fileSize: file.size,
        s3Path: uploadResult.key,
        metadata
      });

      // Prepare response
      const response: FileUploadResponse = {
        documentId: document.id,
        originalName: document.original_name,
        fileType: document.file_type,
        s3Path: document.s3_path,
        uploadTimestamp: document.upload_timestamp,
        processingStatus: document.processing_status,
      };

      res.status(201).json({
        success: true,
        message: 'File uploaded successfully',
        data: response,
      });

    } catch (error) {
      console.error('File upload error:', error);
      
      if (error instanceof Error) {
        res.status(400).json({
          error: 'Upload failed',
          message: error.message,
        });
      } else {
        res.status(500).json({
          error: 'Internal server error',
          message: 'An unexpected error occurred during file upload',
        });
      }
    }
  }

  /**
   * Gets document information and download URL
   */
  async getDocument(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User authentication required'
        });
        return;
      }

      // Get document from database using model
      const document = await documentModel.findByIdAndUser(id, userId);

      if (!document) {
        res.status(404).json({
          error: 'Document not found',
          message: 'The requested document does not exist or you do not have access to it'
        });
        return;
      }

      // Check if file exists in S3
      const exists = await s3Service.fileExists(document.s3_path);
      if (!exists) {
        res.status(404).json({
          error: 'File not found',
          message: 'The document file is no longer available'
        });
        return;
      }

      // Generate signed URL (valid for 1 hour)
      const signedUrl = await s3Service.getSignedUrl(document.s3_path, 3600);

      res.json({
        success: true,
        data: {
          id: document.id,
          originalName: document.original_name,
          fileType: document.file_type,
          fileSize: document.file_size,
          processingStatus: document.processing_status,
          uploadTimestamp: document.upload_timestamp,
          processedTimestamp: document.processed_timestamp,
          downloadUrl: signedUrl,
          expiresIn: 3600,
          metadata: document.metadata
        }
      });

    } catch (error) {
      console.error('Get document error:', error);
      
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve document'
      });
    }
  }

  /**
   * Deletes a document from both database and S3
   */
  async deleteDocument(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User authentication required'
        });
        return;
      }

      // Get document from database to verify ownership and get S3 path
      const document = await documentModel.findByIdAndUser(id, userId);

      if (!document) {
        res.status(404).json({
          error: 'Document not found',
          message: 'The requested document does not exist or you do not have access to it'
        });
        return;
      }

      // Delete document using model
      const deleted = await documentModel.deleteByIdAndUser(id, userId);
      
      if (!deleted) {
        res.status(500).json({
          error: 'Internal server error',
          message: 'Failed to delete document from database'
        });
        return;
      }

      // Delete from S3
      try {
        await s3Service.deleteFile(document.s3_path);
      } catch (s3Error) {
        // Log S3 error but don't fail the operation
        // The database record is already deleted
        console.error('Failed to delete file from S3:', s3Error);
      }

      res.json({
        success: true,
        message: 'Document deleted successfully'
      });

    } catch (error) {
      console.error('Delete document error:', error);
      
      if (error instanceof Error) {
        res.status(500).json({
          error: 'Internal server error',
          message: error.message
        });
      } else {
        res.status(500).json({
          error: 'Internal server error',
          message: 'Failed to delete document'
        });
      }
    }
  }

  /**
   * Lists documents for a user with pagination
   */
  async listDocuments(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const status = req.query.status as string;

      if (!userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User authentication required'
        });
        return;
      }

      // Validate pagination parameters
      if (page < 1 || limit < 1 || limit > 100) {
        res.status(400).json({
          error: 'Invalid pagination parameters',
          message: 'Page must be >= 1 and limit must be between 1 and 100'
        });
        return;
      }

      const offset = (page - 1) * limit;

      // Validate status filter
      const validStatuses: ProcessingStatus[] = ['pending', 'processing', 'completed', 'failed'];
      const statusFilter = status && validStatuses.includes(status as ProcessingStatus) 
        ? status as ProcessingStatus 
        : undefined;

      // Get documents using model
      const { documents, total } = await documentModel.findByUser(
        userId, 
        statusFilter, 
        limit, 
        offset
      );

      res.json({
        success: true,
        data: {
          documents,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            hasNext: page * limit < total,
            hasPrev: page > 1
          }
        }
      });

    } catch (error) {
      console.error('List documents error:', error);
      
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve documents'
      });
    }
  }

  /**
   * Update document processing status
   */
  async updateProcessingStatus(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { status, processedTimestamp } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User authentication required'
        });
        return;
      }

      // Validate status
      const validStatuses: ProcessingStatus[] = ['pending', 'processing', 'completed', 'failed'];
      if (!status || !validStatuses.includes(status)) {
        res.status(400).json({
          error: 'Invalid status',
          message: 'Status must be one of: pending, processing, completed, failed'
        });
        return;
      }

      // Verify document exists and user has access
      const document = await documentModel.findByIdAndUser(id, userId);
      if (!document) {
        res.status(404).json({
          error: 'Document not found',
          message: 'The requested document does not exist or you do not have access to it'
        });
        return;
      }

      // Update status
      const timestamp = processedTimestamp ? new Date(processedTimestamp) : undefined;
      const updated = await documentModel.updateStatus(id, status, timestamp);

      if (!updated) {
        res.status(500).json({
          error: 'Internal server error',
          message: 'Failed to update document status'
        });
        return;
      }

      res.json({
        success: true,
        message: 'Document status updated successfully',
        data: {
          documentId: id,
          status,
          processedTimestamp: timestamp
        }
      });

    } catch (error) {
      console.error('Update processing status error:', error);
      
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to update document status'
      });
    }
  }

  /**
   * Get document processing status
   */
  async getProcessingStatus(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User authentication required'
        });
        return;
      }

      // Get document
      const document = await documentModel.findByIdAndUser(id, userId);
      if (!document) {
        res.status(404).json({
          error: 'Document not found',
          message: 'The requested document does not exist or you do not have access to it'
        });
        return;
      }

      res.json({
        success: true,
        data: {
          documentId: document.id,
          originalName: document.original_name,
          processingStatus: document.processing_status,
          uploadTimestamp: document.upload_timestamp,
          processedTimestamp: document.processed_timestamp,
          processingSteps: document.metadata?.processingSteps || {},
          processingMetrics: document.metadata?.processingMetrics || {}
        }
      });

    } catch (error) {
      console.error('Get processing status error:', error);
      
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve document status'
      });
    }
  }

  /**
   * Update document metadata
   */
  async updateMetadata(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { metadata } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User authentication required'
        });
        return;
      }

      if (!metadata || typeof metadata !== 'object') {
        res.status(400).json({
          error: 'Invalid metadata',
          message: 'Metadata must be a valid object'
        });
        return;
      }

      // Verify document exists and user has access
      const document = await documentModel.findByIdAndUser(id, userId);
      if (!document) {
        res.status(404).json({
          error: 'Document not found',
          message: 'The requested document does not exist or you do not have access to it'
        });
        return;
      }

      // Update metadata
      const updated = await documentModel.updateMetadata(id, metadata);

      if (!updated) {
        res.status(500).json({
          error: 'Internal server error',
          message: 'Failed to update document metadata'
        });
        return;
      }

      res.json({
        success: true,
        message: 'Document metadata updated successfully',
        data: {
          documentId: id,
          metadata
        }
      });

    } catch (error) {
      console.error('Update metadata error:', error);
      
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to update document metadata'
      });
    }
  }

  /**
   * Add processing step to document metadata
   */
  async addProcessingStep(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { stepName, status, error } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User authentication required'
        });
        return;
      }

      if (!stepName || !status) {
        res.status(400).json({
          error: 'Missing required fields',
          message: 'stepName and status are required'
        });
        return;
      }

      // Validate status
      const validStatuses: ProcessingStatus[] = ['pending', 'processing', 'completed', 'failed'];
      if (!validStatuses.includes(status)) {
        res.status(400).json({
          error: 'Invalid status',
          message: 'Status must be one of: pending, processing, completed, failed'
        });
        return;
      }

      // Verify document exists and user has access
      const document = await documentModel.findByIdAndUser(id, userId);
      if (!document) {
        res.status(404).json({
          error: 'Document not found',
          message: 'The requested document does not exist or you do not have access to it'
        });
        return;
      }

      // Add processing step
      const updated = await documentModel.addProcessingStep(id, stepName, status, error);

      if (!updated) {
        res.status(500).json({
          error: 'Internal server error',
          message: 'Failed to add processing step'
        });
        return;
      }

      res.json({
        success: true,
        message: 'Processing step added successfully',
        data: {
          documentId: id,
          stepName,
          status,
          timestamp: new Date(),
          ...(error && { error })
        }
      });

    } catch (error) {
      console.error('Add processing step error:', error);
      
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to add processing step'
      });
    }
  }

  /**
   * Get processing statistics
   */
  async getProcessingStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = await documentModel.getProcessingStats();

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      console.error('Get processing stats error:', error);
      
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve processing statistics'
      });
    }
  }

  /**
   * Maps file extension to file type
   */
  private getFileTypeFromExtension(extension: string): string {
    const typeMap: Record<string, string> = {
      '.pdf': 'PDF',
      '.doc': 'Word Document',
      '.docx': 'Word Document',
      '.ppt': 'PowerPoint',
      '.pptx': 'PowerPoint',
      '.jpg': 'Image',
      '.jpeg': 'Image',
      '.png': 'Image',
      '.gif': 'Image',
      '.bmp': 'Image',
      '.tiff': 'Image',
      '.tif': 'Image',
      '.webp': 'Image',
      '.txt': 'Text',
      '.rtf': 'Rich Text',
    };

    return typeMap[extension] || 'Unknown';
  }
}

export const documentController = new DocumentController();