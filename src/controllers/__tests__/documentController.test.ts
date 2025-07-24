import { Request, Response } from 'express';
import { documentController } from '../documentController';
import { s3Service } from '../../services/s3Service';
import { documentModel } from '../../models/documentModel';

// Mock the S3 service and document model
jest.mock('../../services/s3Service');
jest.mock('../../models/documentModel');

describe('DocumentController', () => {
  let mockRequest: any;
  let mockResponse: Partial<Response>;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;

  beforeEach(() => {
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson });
    
    mockRequest = {};
    mockResponse = {
      status: mockStatus,
      json: mockJson,
    };

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('uploadDocument', () => {
    it('should upload a document successfully', async () => {
      // Mock file upload
      const mockFile = {
        originalname: 'test.pdf',
        buffer: Buffer.from('mock pdf content'),
        mimetype: 'application/pdf',
        size: 1024,
      };

      mockRequest = {
        file: mockFile,
        user: { id: 'test-user-id' },
      };

      // Mock S3 service response
      const mockS3Result = {
        key: 'documents/test-user-id/2024-01-01/uuid_test.pdf',
        location: 'https://test-bucket.s3.amazonaws.com/documents/test-user-id/2024-01-01/uuid_test.pdf',
        bucket: 'test-bucket',
        etag: '"test-etag"',
      };

      const mockDocument = {
        id: 'test-doc-id',
        user_id: 'test-user-id',
        original_name: 'test.pdf',
        file_type: 'PDF',
        file_size: 1024,
        s3_path: mockS3Result.key,
        processing_status: 'pending' as const,
        upload_timestamp: new Date(),
        metadata: {}
      };

      (s3Service.uploadFile as jest.Mock).mockResolvedValue(mockS3Result);
      (documentModel.create as jest.Mock).mockResolvedValue(mockDocument);

      await documentController.uploadDocument(
        mockRequest,
        mockResponse as Response
      );

      expect(s3Service.uploadFile).toHaveBeenCalledWith({
        userId: 'test-user-id',
        originalName: 'test.pdf',
        fileBuffer: mockFile.buffer,
        mimeType: 'application/pdf',
      });

      expect(documentModel.create).toHaveBeenCalledWith({
        userId: 'test-user-id',
        originalName: 'test.pdf',
        fileType: 'PDF',
        fileSize: 1024,
        s3Path: mockS3Result.key,
        metadata: expect.objectContaining({
          mimeType: 'application/pdf'
        })
      });
      expect(mockStatus).toHaveBeenCalledWith(201);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        message: 'File uploaded successfully',
        data: expect.objectContaining({
          documentId: 'test-doc-id',
          originalName: 'test.pdf',
          fileType: 'PDF',
          s3Path: mockS3Result.key,
          processingStatus: 'pending',
        }),
      });
    });

    it('should return error when no file is uploaded', async () => {
      mockRequest = {
        file: undefined,
        user: { id: 'test-user-id' },
      };

      await documentController.uploadDocument(
        mockRequest,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'No file uploaded',
        message: 'Please select a file to upload',
      });
    });

    it('should return error when user ID is missing', async () => {
      const mockFile = {
        originalname: 'test.pdf',
        buffer: Buffer.from('mock pdf content'),
        mimetype: 'application/pdf',
        size: 1024,
      };

      mockRequest = {
        file: mockFile,
        user: undefined,
        body: {},
        headers: {},
      };

      await documentController.uploadDocument(
        mockRequest,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'User ID is required',
      });
    });

    it('should handle S3 upload errors', async () => {
      const mockFile = {
        originalname: 'test.pdf',
        buffer: Buffer.from('mock pdf content'),
        mimetype: 'application/pdf',
        size: 1024,
      };

      mockRequest = {
        file: mockFile,
        user: { id: 'test-user-id' },
      };

      // Mock S3 service to throw an error
      (s3Service.uploadFile as jest.Mock).mockRejectedValue(
        new Error('S3 upload failed: Service unavailable')
      );

      await documentController.uploadDocument(
        mockRequest,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Upload failed',
        message: 'S3 upload failed: Service unavailable',
      });
    });
  });

  describe('getDocument', () => {
    it('should get document successfully', async () => {
      mockRequest = {
        params: { id: 'test-doc-id' },
        user: { id: 'test-user-id' },
      };

      const mockDocument = {
        id: 'test-doc-id',
        user_id: 'test-user-id',
        original_name: 'test.pdf',
        file_type: 'PDF',
        file_size: 1024,
        s3_path: 'documents/user/file.pdf',
        processing_status: 'completed',
        upload_timestamp: new Date(),
        processed_timestamp: new Date(),
        metadata: {}
      };

      (documentModel.findByIdAndUser as jest.Mock).mockResolvedValue(mockDocument);
      (s3Service.fileExists as jest.Mock).mockResolvedValue(true);
      (s3Service.getSignedUrl as jest.Mock).mockResolvedValue('https://signed-url.com');

      await documentController.getDocument(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(documentModel.findByIdAndUser).toHaveBeenCalledWith('test-doc-id', 'test-user-id');
      expect(s3Service.fileExists).toHaveBeenCalledWith('documents/user/file.pdf');
      expect(s3Service.getSignedUrl).toHaveBeenCalledWith('documents/user/file.pdf', 3600);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          id: 'test-doc-id',
          originalName: 'test.pdf',
          downloadUrl: 'https://signed-url.com',
          expiresIn: 3600,
        }),
      });
    });

    it('should return 404 when document does not exist', async () => {
      mockRequest = {
        params: { id: 'nonexistent-doc-id' },
        user: { id: 'test-user-id' },
      };

      (documentModel.findByIdAndUser as jest.Mock).mockResolvedValue(null);

      await documentController.getDocument(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Document not found',
        message: 'The requested document does not exist or you do not have access to it',
      });
    });

    it('should return 401 when user ID is missing', async () => {
      mockRequest = {
        params: { id: 'test-doc-id' },
        user: undefined,
      };

      await documentController.getDocument(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'User authentication required',
      });
    });
  });

  describe('deleteDocument', () => {
    it('should delete document successfully', async () => {
      mockRequest = {
        params: { id: 'test-doc-id' },
        user: { id: 'test-user-id' },
      };

      const mockDocument = {
        id: 'test-doc-id',
        user_id: 'test-user-id',
        s3_path: 'documents/user/file.pdf',
        original_name: 'test.pdf'
      };

      (documentModel.findByIdAndUser as jest.Mock).mockResolvedValue(mockDocument);
      (documentModel.deleteByIdAndUser as jest.Mock).mockResolvedValue(true);
      (s3Service.deleteFile as jest.Mock).mockResolvedValue(undefined);

      await documentController.deleteDocument(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(documentModel.findByIdAndUser).toHaveBeenCalledWith('test-doc-id', 'test-user-id');
      expect(documentModel.deleteByIdAndUser).toHaveBeenCalledWith('test-doc-id', 'test-user-id');
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        message: 'Document deleted successfully',
      });
    });

    it('should return 404 when document does not exist', async () => {
      mockRequest = {
        params: { id: 'nonexistent-doc-id' },
        user: { id: 'test-user-id' },
      };

      (documentModel.findByIdAndUser as jest.Mock).mockResolvedValue(null);

      await documentController.deleteDocument(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Document not found',
        message: 'The requested document does not exist or you do not have access to it',
      });
    });

    it('should return 401 when user ID is missing', async () => {
      mockRequest = {
        params: { id: 'test-doc-id' },
        user: undefined,
      };

      await documentController.deleteDocument(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'User authentication required',
      });
    });
  });

  describe('listDocuments', () => {
    it('should list documents successfully', async () => {
      mockRequest = {
        user: { id: 'test-user-id' },
        query: { page: '1', limit: '10' },
      };

      const mockDocuments = [
        {
          id: 'doc-1',
          original_name: 'test1.pdf',
          file_type: 'PDF',
          file_size: 1024,
          processing_status: 'completed',
          upload_timestamp: new Date(),
          processed_timestamp: new Date()
        }
      ];

      (documentModel.findByUser as jest.Mock).mockResolvedValue({
        documents: mockDocuments,
        total: 1
      });

      await documentController.listDocuments(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(documentModel.findByUser).toHaveBeenCalledWith('test-user-id', undefined, 10, 0);

      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: {
          documents: mockDocuments,
          pagination: {
            page: 1,
            limit: 10,
            total: 1,
            totalPages: 1,
            hasNext: false,
            hasPrev: false
          }
        }
      });
    });

    it('should return 401 when user ID is missing', async () => {
      mockRequest = {
        user: undefined,
        query: {},
      };

      await documentController.listDocuments(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'User authentication required',
      });
    });
  });

  describe('updateProcessingStatus', () => {
    it('should update processing status successfully', async () => {
      mockRequest = {
        params: { id: 'test-doc-id' },
        user: { id: 'test-user-id' },
        body: { status: 'completed', processedTimestamp: '2024-01-01T00:00:00.000Z' },
      };

      const mockDocument = {
        id: 'test-doc-id',
        user_id: 'test-user-id',
        processing_status: 'processing'
      };

      (documentModel.findByIdAndUser as jest.Mock).mockResolvedValue(mockDocument);
      (documentModel.updateStatus as jest.Mock).mockResolvedValue(true);

      await documentController.updateProcessingStatus(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(documentModel.updateStatus).toHaveBeenCalledWith(
        'test-doc-id',
        'completed',
        new Date('2024-01-01T00:00:00.000Z')
      );

      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        message: 'Document status updated successfully',
        data: {
          documentId: 'test-doc-id',
          status: 'completed',
          processedTimestamp: new Date('2024-01-01T00:00:00.000Z')
        }
      });
    });

    it('should return 400 for invalid status', async () => {
      mockRequest = {
        params: { id: 'test-doc-id' },
        user: { id: 'test-user-id' },
        body: { status: 'invalid-status' },
      };

      await documentController.updateProcessingStatus(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Invalid status',
        message: 'Status must be one of: pending, processing, completed, failed'
      });
    });

    it('should return 404 when document not found', async () => {
      mockRequest = {
        params: { id: 'nonexistent-doc-id' },
        user: { id: 'test-user-id' },
        body: { status: 'completed' },
      };

      (documentModel.findByIdAndUser as jest.Mock).mockResolvedValue(null);

      await documentController.updateProcessingStatus(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Document not found',
        message: 'The requested document does not exist or you do not have access to it'
      });
    });
  });

  describe('getProcessingStatus', () => {
    it('should get processing status successfully', async () => {
      mockRequest = {
        params: { id: 'test-doc-id' },
        user: { id: 'test-user-id' },
      };

      const mockDocument = {
        id: 'test-doc-id',
        original_name: 'test.pdf',
        processing_status: 'completed',
        upload_timestamp: new Date('2024-01-01T00:00:00.000Z'),
        processed_timestamp: new Date('2024-01-01T01:00:00.000Z'),
        metadata: {
          processingSteps: {
            ingestion: { status: 'completed', timestamp: new Date() }
          },
          processingMetrics: {
            duration: 3600
          }
        }
      };

      (documentModel.findByIdAndUser as jest.Mock).mockResolvedValue(mockDocument);

      await documentController.getProcessingStatus(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: {
          documentId: 'test-doc-id',
          originalName: 'test.pdf',
          processingStatus: 'completed',
          uploadTimestamp: new Date('2024-01-01T00:00:00.000Z'),
          processedTimestamp: new Date('2024-01-01T01:00:00.000Z'),
          processingSteps: {
            ingestion: { status: 'completed', timestamp: expect.any(Date) }
          },
          processingMetrics: {
            duration: 3600
          }
        }
      });
    });
  });

  describe('updateMetadata', () => {
    it('should update metadata successfully', async () => {
      mockRequest = {
        params: { id: 'test-doc-id' },
        user: { id: 'test-user-id' },
        body: {
          metadata: {
            extractedContent: { textLength: 1000, pageCount: 5 }
          }
        },
      };

      const mockDocument = {
        id: 'test-doc-id',
        user_id: 'test-user-id'
      };

      (documentModel.findByIdAndUser as jest.Mock).mockResolvedValue(mockDocument);
      (documentModel.updateMetadata as jest.Mock).mockResolvedValue(true);

      await documentController.updateMetadata(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(documentModel.updateMetadata).toHaveBeenCalledWith(
        'test-doc-id',
        { extractedContent: { textLength: 1000, pageCount: 5 } }
      );

      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        message: 'Document metadata updated successfully',
        data: {
          documentId: 'test-doc-id',
          metadata: { extractedContent: { textLength: 1000, pageCount: 5 } }
        }
      });
    });

    it('should return 400 for invalid metadata', async () => {
      mockRequest = {
        params: { id: 'test-doc-id' },
        user: { id: 'test-user-id' },
        body: { metadata: 'invalid-metadata' },
      };

      await documentController.updateMetadata(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Invalid metadata',
        message: 'Metadata must be a valid object'
      });
    });
  });

  describe('addProcessingStep', () => {
    it('should add processing step successfully', async () => {
      mockRequest = {
        params: { id: 'test-doc-id' },
        user: { id: 'test-user-id' },
        body: {
          stepName: 'ingestion',
          status: 'completed'
        },
      };

      const mockDocument = {
        id: 'test-doc-id',
        user_id: 'test-user-id'
      };

      (documentModel.findByIdAndUser as jest.Mock).mockResolvedValue(mockDocument);
      (documentModel.addProcessingStep as jest.Mock).mockResolvedValue(true);

      await documentController.addProcessingStep(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(documentModel.addProcessingStep).toHaveBeenCalledWith(
        'test-doc-id',
        'ingestion',
        'completed',
        undefined
      );

      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        message: 'Processing step added successfully',
        data: {
          documentId: 'test-doc-id',
          stepName: 'ingestion',
          status: 'completed',
          timestamp: expect.any(Date)
        }
      });
    });

    it('should add processing step with error', async () => {
      mockRequest = {
        params: { id: 'test-doc-id' },
        user: { id: 'test-user-id' },
        body: {
          stepName: 'analysis',
          status: 'failed',
          error: 'Processing timeout'
        },
      };

      const mockDocument = {
        id: 'test-doc-id',
        user_id: 'test-user-id'
      };

      (documentModel.findByIdAndUser as jest.Mock).mockResolvedValue(mockDocument);
      (documentModel.addProcessingStep as jest.Mock).mockResolvedValue(true);

      await documentController.addProcessingStep(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(documentModel.addProcessingStep).toHaveBeenCalledWith(
        'test-doc-id',
        'analysis',
        'failed',
        'Processing timeout'
      );

      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        message: 'Processing step added successfully',
        data: {
          documentId: 'test-doc-id',
          stepName: 'analysis',
          status: 'failed',
          timestamp: expect.any(Date),
          error: 'Processing timeout'
        }
      });
    });

    it('should return 400 for missing required fields', async () => {
      mockRequest = {
        params: { id: 'test-doc-id' },
        user: { id: 'test-user-id' },
        body: { stepName: 'ingestion' }, // missing status
      };

      await documentController.addProcessingStep(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Missing required fields',
        message: 'stepName and status are required'
      });
    });
  });

  describe('processDocument', () => {
    it('should start document processing successfully', async () => {
      mockRequest = {
        params: { id: 'test-doc-id' },
        user: { id: 'test-user-id' },
        body: { processingOptions: { includeImages: true } },
      };

      const mockDocument = {
        id: 'test-doc-id',
        user_id: 'test-user-id',
        processing_status: 'pending'
      };

      (documentModel.findByIdAndUser as jest.Mock).mockResolvedValue(mockDocument);
      (documentModel.updateStatus as jest.Mock).mockResolvedValue(true);
      (documentModel.addProcessingStep as jest.Mock).mockResolvedValue(true);

      await documentController.processDocument(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(documentModel.updateStatus).toHaveBeenCalledWith('test-doc-id', 'processing');
      expect(documentModel.addProcessingStep).toHaveBeenCalledWith(
        'test-doc-id',
        'processing_started',
        'processing'
      );

      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        message: 'Document processing started successfully',
        data: {
          documentId: 'test-doc-id',
          processingStatus: 'processing',
          startedAt: expect.any(Date),
          processingOptions: { includeImages: true }
        }
      });
    });

    it('should return 409 when document is already processing', async () => {
      mockRequest = {
        params: { id: 'test-doc-id' },
        user: { id: 'test-user-id' },
        body: {},
      };

      const mockDocument = {
        id: 'test-doc-id',
        user_id: 'test-user-id',
        processing_status: 'processing'
      };

      (documentModel.findByIdAndUser as jest.Mock).mockResolvedValue(mockDocument);

      await documentController.processDocument(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(409);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Document already processing',
        message: 'This document is currently being processed'
      });
    });

    it('should return 409 when document is already completed', async () => {
      mockRequest = {
        params: { id: 'test-doc-id' },
        user: { id: 'test-user-id' },
        body: {},
      };

      const mockDocument = {
        id: 'test-doc-id',
        user_id: 'test-user-id',
        processing_status: 'completed'
      };

      (documentModel.findByIdAndUser as jest.Mock).mockResolvedValue(mockDocument);

      await documentController.processDocument(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(409);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Document already processed',
        message: 'This document has already been processed successfully'
      });
    });

    it('should return 404 when document not found', async () => {
      mockRequest = {
        params: { id: 'nonexistent-doc-id' },
        user: { id: 'test-user-id' },
        body: {},
      };

      (documentModel.findByIdAndUser as jest.Mock).mockResolvedValue(null);

      await documentController.processDocument(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Document not found',
        message: 'The requested document does not exist or you do not have access to it'
      });
    });

    it('should return 401 when user not authenticated', async () => {
      mockRequest = {
        params: { id: 'test-doc-id' },
        user: undefined,
        body: {},
      };

      await documentController.processDocument(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'User authentication required'
      });
    });
  });

  describe('cancelProcessing', () => {
    it('should cancel document processing successfully', async () => {
      mockRequest = {
        params: { id: 'test-doc-id' },
        user: { id: 'test-user-id' },
      };

      const mockDocument = {
        id: 'test-doc-id',
        user_id: 'test-user-id',
        processing_status: 'processing'
      };

      (documentModel.findByIdAndUser as jest.Mock).mockResolvedValue(mockDocument);
      (documentModel.updateStatus as jest.Mock).mockResolvedValue(true);
      (documentModel.addProcessingStep as jest.Mock).mockResolvedValue(true);

      await documentController.cancelProcessing(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(documentModel.updateStatus).toHaveBeenCalledWith('test-doc-id', 'failed');
      expect(documentModel.addProcessingStep).toHaveBeenCalledWith(
        'test-doc-id',
        'processing_cancelled',
        'failed',
        'Processing cancelled by user'
      );

      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        message: 'Document processing cancelled successfully',
        data: {
          documentId: 'test-doc-id',
          processingStatus: 'failed',
          cancelledAt: expect.any(Date)
        }
      });
    });

    it('should return 400 when document is not being processed', async () => {
      mockRequest = {
        params: { id: 'test-doc-id' },
        user: { id: 'test-user-id' },
      };

      const mockDocument = {
        id: 'test-doc-id',
        user_id: 'test-user-id',
        processing_status: 'completed'
      };

      (documentModel.findByIdAndUser as jest.Mock).mockResolvedValue(mockDocument);

      await documentController.cancelProcessing(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Cannot cancel processing',
        message: 'Document is not currently being processed'
      });
    });

    it('should return 404 when document not found', async () => {
      mockRequest = {
        params: { id: 'nonexistent-doc-id' },
        user: { id: 'test-user-id' },
      };

      (documentModel.findByIdAndUser as jest.Mock).mockResolvedValue(null);

      await documentController.cancelProcessing(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Document not found',
        message: 'The requested document does not exist or you do not have access to it'
      });
    });

    it('should return 401 when user not authenticated', async () => {
      mockRequest = {
        params: { id: 'test-doc-id' },
        user: undefined,
      };

      await documentController.cancelProcessing(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'User authentication required'
      });
    });
  });

  describe('getProcessingStats', () => {
    it('should get processing statistics successfully', async () => {
      const mockStats = {
        pending: 5,
        processing: 2,
        completed: 10,
        failed: 1,
        total: 18
      };

      (documentModel.getProcessingStats as jest.Mock).mockResolvedValue(mockStats);

      await documentController.getProcessingStats(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: mockStats
      });
    });
  });
});