import { Request, Response } from 'express';
import { documentController } from '../documentController';
import { s3Service } from '../../services/s3Service';

// Mock the S3 service
jest.mock('../../services/s3Service');

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

      (s3Service.uploadFile as jest.Mock).mockResolvedValue(mockS3Result);

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

      expect(mockStatus).toHaveBeenCalledWith(201);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        message: 'File uploaded successfully',
        data: expect.objectContaining({
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
      };

      mockRequest = {
        file: mockFile,
        user: undefined,
        body: {},
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

  describe('getDocumentUrl', () => {
    it('should generate signed URL successfully', async () => {
      mockRequest = {
        params: { documentId: 'test-doc-id' },
        query: { s3Key: 'documents/user/file.pdf' },
      };

      (s3Service.fileExists as jest.Mock).mockResolvedValue(true);
      (s3Service.getSignedUrl as jest.Mock).mockResolvedValue('https://signed-url.com');

      await documentController.getDocumentUrl(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(s3Service.fileExists).toHaveBeenCalledWith('documents/user/file.pdf');
      expect(s3Service.getSignedUrl).toHaveBeenCalledWith('documents/user/file.pdf', 3600);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: {
          downloadUrl: 'https://signed-url.com',
          expiresIn: 3600,
        },
      });
    });

    it('should return 404 when file does not exist', async () => {
      mockRequest = {
        params: { documentId: 'test-doc-id' },
        query: { s3Key: 'documents/user/nonexistent.pdf' },
      };

      (s3Service.fileExists as jest.Mock).mockResolvedValue(false);

      await documentController.getDocumentUrl(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'File not found',
        message: 'The requested document does not exist',
      });
    });
  });

  describe('deleteDocument', () => {
    it('should delete document successfully', async () => {
      mockRequest = {
        params: { documentId: 'test-doc-id' },
        body: { s3Key: 'documents/user/file.pdf' },
      };

      (s3Service.fileExists as jest.Mock).mockResolvedValue(true);
      (s3Service.deleteFile as jest.Mock).mockResolvedValue(undefined);

      await documentController.deleteDocument(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(s3Service.fileExists).toHaveBeenCalledWith('documents/user/file.pdf');
      expect(s3Service.deleteFile).toHaveBeenCalledWith('documents/user/file.pdf');
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        message: 'Document deleted successfully',
      });
    });
  });
});