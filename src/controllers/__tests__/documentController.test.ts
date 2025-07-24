import { Request, Response } from 'express';
import { documentController } from '../documentController';
import { s3Service } from '../../services/s3Service';
import { mysqlConnection } from '../../database/mysql';

// Mock the S3 service and database
jest.mock('../../services/s3Service');
jest.mock('../../database/mysql');

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

      (s3Service.uploadFile as jest.Mock).mockResolvedValue(mockS3Result);
      (mysqlConnection.executeQuery as jest.Mock).mockResolvedValue([]);

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

      expect(mysqlConnection.executeQuery).toHaveBeenCalled();
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
        headers: { 'user-id': 'test-user-id' },
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

      (mysqlConnection.executeQuery as jest.Mock).mockResolvedValue([mockDocument]);
      (s3Service.fileExists as jest.Mock).mockResolvedValue(true);
      (s3Service.getSignedUrl as jest.Mock).mockResolvedValue('https://signed-url.com');

      await documentController.getDocument(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mysqlConnection.executeQuery).toHaveBeenCalled();
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
        headers: { 'user-id': 'test-user-id' },
      };

      (mysqlConnection.executeQuery as jest.Mock).mockResolvedValue([]);

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
        headers: {},
      };

      await documentController.getDocument(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'User ID is required',
      });
    });
  });

  describe('deleteDocument', () => {
    it('should delete document successfully', async () => {
      mockRequest = {
        params: { id: 'test-doc-id' },
        headers: { 'user-id': 'test-user-id' },
      };

      const mockDocument = {
        id: 'test-doc-id',
        user_id: 'test-user-id',
        s3_path: 'documents/user/file.pdf',
        original_name: 'test.pdf'
      };

      (mysqlConnection.executeQuery as jest.Mock).mockResolvedValue([mockDocument]);
      (mysqlConnection.executeTransaction as jest.Mock).mockImplementation(async (callback) => {
        const mockConnection = {
          execute: jest.fn().mockResolvedValue([{ affectedRows: 1 }, {}])
        };
        return await callback(mockConnection);
      });
      (s3Service.deleteFile as jest.Mock).mockResolvedValue(undefined);

      await documentController.deleteDocument(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mysqlConnection.executeQuery).toHaveBeenCalled();
      expect(mysqlConnection.executeTransaction).toHaveBeenCalled();
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        message: 'Document deleted successfully',
      });
    });

    it('should return 404 when document does not exist', async () => {
      mockRequest = {
        params: { id: 'nonexistent-doc-id' },
        headers: { 'user-id': 'test-user-id' },
      };

      (mysqlConnection.executeQuery as jest.Mock).mockResolvedValue([]);

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
        headers: {},
      };

      await documentController.deleteDocument(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'User ID is required',
      });
    });
  });

  describe('listDocuments', () => {
    it('should list documents successfully', async () => {
      mockRequest = {
        headers: { 'user-id': 'test-user-id' },
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

      (mysqlConnection.executeQuery as jest.Mock)
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce(mockDocuments);

      await documentController.listDocuments(
        mockRequest as Request,
        mockResponse as Response
      );

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
        headers: {},
        query: {},
      };

      await documentController.listDocuments(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'User ID is required',
      });
    });
  });
});