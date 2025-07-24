import { Request, Response } from 'express';
import { s3Service } from '../services/s3Service';
import { FileUploadResponse } from '../types';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

// Extend Request interface to include user property
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
  };
}

export class DocumentController {
  /**
   * Handles file upload to S3
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
      const userId = req.user?.id || req.body.userId;
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
        userId,
        originalName: file.originalname,
        fileBuffer: file.buffer,
        mimeType: file.mimetype,
      });

      // Generate document ID
      const documentId = uuidv4();
      
      // Determine file type from extension
      const fileExtension = path.extname(file.originalname).toLowerCase();
      const fileType = this.getFileTypeFromExtension(fileExtension);

      // Prepare response
      const response: FileUploadResponse = {
        documentId,
        originalName: file.originalname,
        fileType,
        s3Path: uploadResult.key,
        uploadTimestamp: new Date(),
        processingStatus: 'pending',
      };

      // TODO: Save document metadata to database (will be implemented in later tasks)
      // For now, just return the upload result

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
   * Gets a signed URL for downloading a document
   */
  async getDocumentUrl(req: Request, res: Response): Promise<void> {
    try {
      const { documentId } = req.params;
      const { s3Key } = req.query;

      if (!s3Key || typeof s3Key !== 'string') {
        res.status(400).json({
          error: 'Bad request',
          message: 'S3 key is required',
        });
        return;
      }

      // Check if file exists
      const exists = await s3Service.fileExists(s3Key);
      if (!exists) {
        res.status(404).json({
          error: 'File not found',
          message: 'The requested document does not exist',
        });
        return;
      }

      // Generate signed URL (valid for 1 hour)
      const signedUrl = await s3Service.getSignedUrl(s3Key, 3600);

      res.json({
        success: true,
        data: {
          downloadUrl: signedUrl,
          expiresIn: 3600,
        },
      });

    } catch (error) {
      console.error('Get document URL error:', error);
      
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to generate download URL',
      });
    }
  }

  /**
   * Deletes a document from S3
   */
  async deleteDocument(req: Request, res: Response): Promise<void> {
    try {
      const { documentId } = req.params;
      const { s3Key } = req.body;

      if (!s3Key) {
        res.status(400).json({
          error: 'Bad request',
          message: 'S3 key is required',
        });
        return;
      }

      // Check if file exists
      const exists = await s3Service.fileExists(s3Key);
      if (!exists) {
        res.status(404).json({
          error: 'File not found',
          message: 'The requested document does not exist',
        });
        return;
      }

      // Delete from S3
      await s3Service.deleteFile(s3Key);

      // TODO: Update database to mark document as deleted (will be implemented in later tasks)

      res.json({
        success: true,
        message: 'Document deleted successfully',
      });

    } catch (error) {
      console.error('Delete document error:', error);
      
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to delete document',
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