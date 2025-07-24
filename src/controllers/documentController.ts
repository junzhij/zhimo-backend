import { Request, Response } from 'express';
import { s3Service } from '../services/s3Service';
import { FileUploadResponse, Document } from '../types';
import { mysqlConnection } from '../database/mysql';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

// Extend Request interface to include user property
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
  };
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

      // Generate document ID
      const documentId = uuidv4();
      
      // Determine file type from extension
      const fileExtension = path.extname(file.originalname).toLowerCase();
      const fileType = this.getFileTypeFromExtension(fileExtension);

      // Save document metadata to database
      const insertQuery = `
        INSERT INTO documents (
          id, user_id, original_name, file_type, file_size, s3_path, 
          processing_status, upload_timestamp, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?)
      `;

      const metadata = {
        mimeType: file.mimetype,
        s3Bucket: uploadResult.bucket,
        s3ETag: uploadResult.etag,
        uploadLocation: uploadResult.location
      };

      await mysqlConnection.executeQuery(insertQuery, [
        documentId,
        userId,
        file.originalname,
        fileType,
        file.size,
        uploadResult.key,
        'pending',
        JSON.stringify(metadata)
      ]);

      // Prepare response
      const response: FileUploadResponse = {
        documentId,
        originalName: file.originalname,
        fileType,
        s3Path: uploadResult.key,
        uploadTimestamp: new Date(),
        processingStatus: 'pending',
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
      const userId = req.headers['user-id'] as string;

      if (!userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User ID is required'
        });
        return;
      }

      // Get document from database
      const selectQuery = `
        SELECT id, user_id, original_name, file_type, file_size, s3_path, 
               processing_status, upload_timestamp, processed_timestamp, metadata
        FROM documents 
        WHERE id = ? AND user_id = ?
      `;

      const results = await mysqlConnection.executeQuery<RowDataPacket[]>(selectQuery, [id, userId]);

      if (!results || results.length === 0) {
        res.status(404).json({
          error: 'Document not found',
          message: 'The requested document does not exist or you do not have access to it'
        });
        return;
      }

      const document = results[0] as Document;

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
      const userId = req.headers['user-id'] as string;

      if (!userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User ID is required'
        });
        return;
      }

      // Get document from database to verify ownership and get S3 path
      const selectQuery = `
        SELECT id, user_id, s3_path, original_name
        FROM documents 
        WHERE id = ? AND user_id = ?
      `;

      const results = await mysqlConnection.executeQuery<RowDataPacket[]>(selectQuery, [id, userId]);

      if (!results || results.length === 0) {
        res.status(404).json({
          error: 'Document not found',
          message: 'The requested document does not exist or you do not have access to it'
        });
        return;
      }

      const document = results[0];

      // Use transaction to ensure data consistency
      await mysqlConnection.executeTransaction(async (connection) => {
        // Delete from database first
        const deleteQuery = 'DELETE FROM documents WHERE id = ? AND user_id = ?';
        const deleteResult = await connection.execute(deleteQuery, [id, userId]) as [ResultSetHeader, any];
        
        if (deleteResult[0].affectedRows === 0) {
          throw new Error('Failed to delete document from database');
        }

        // Delete from S3
        try {
          await s3Service.deleteFile(document.s3_path);
        } catch (s3Error) {
          // Log S3 error but don't fail the transaction
          // The database record is already deleted
          console.error('Failed to delete file from S3:', s3Error);
        }
      });

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
      const userId = req.headers['user-id'] as string;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const status = req.query.status as string;

      if (!userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User ID is required'
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

      // Build query with optional status filter
      let whereClause = 'WHERE user_id = ?';
      const queryParams: any[] = [userId];

      if (status && ['pending', 'processing', 'completed', 'failed'].includes(status)) {
        whereClause += ' AND processing_status = ?';
        queryParams.push(status);
      }

      // Get total count
      const countQuery = `SELECT COUNT(*) as total FROM documents ${whereClause}`;
      const countResults = await mysqlConnection.executeQuery<RowDataPacket[]>(countQuery, queryParams);
      const total = countResults[0].total;

      // Get documents with pagination
      const selectQuery = `
        SELECT id, original_name, file_type, file_size, processing_status, 
               upload_timestamp, processed_timestamp
        FROM documents 
        ${whereClause}
        ORDER BY upload_timestamp DESC
        LIMIT ? OFFSET ?
      `;

      queryParams.push(limit, offset);
      const documents = await mysqlConnection.executeQuery<RowDataPacket[]>(selectQuery, queryParams);

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