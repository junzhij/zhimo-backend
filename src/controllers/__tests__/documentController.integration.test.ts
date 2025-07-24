import request from 'supertest';
import app from '../../index';
import { mysqlConnection } from '../../database/mysql';
import { s3Service } from '../../services/s3Service';

// Mock external dependencies
jest.mock('../../database/mysql');
jest.mock('../../services/s3Service');
jest.mock('../../database', () => ({
  DatabaseManager: {
    initializeAll: jest.fn(),
    healthCheck: jest.fn().mockResolvedValue({
      mysql: true,
      mongodb: true,
      redis: true
    }),
    closeAll: jest.fn()
  }
}));

describe('Document API Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    // Prevent Jest from hanging
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  describe('POST /api/documents/upload', () => {
    it('should upload a document successfully', async () => {
      const mockS3Result = {
        key: 'documents/test-user/2024-01-01/uuid_test.pdf',
        location: 'https://test-bucket.s3.amazonaws.com/documents/test-user/2024-01-01/uuid_test.pdf',
        bucket: 'test-bucket',
        etag: '"test-etag"',
      };

      (s3Service.uploadFile as jest.Mock).mockResolvedValue(mockS3Result);
      (mysqlConnection.executeQuery as jest.Mock).mockResolvedValue([]);

      const response = await request(app)
        .post('/api/documents/upload')
        .set('user-id', 'test-user-id')
        .attach('document', Buffer.from('mock pdf content'), 'test.pdf')
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('File uploaded successfully');
      expect(response.body.data).toMatchObject({
        originalName: 'test.pdf',
        fileType: 'PDF',
        s3Path: mockS3Result.key,
        processingStatus: 'pending',
      });
    });

    it('should return 400 when no file is uploaded', async () => {
      const response = await request(app)
        .post('/api/documents/upload')
        .set('user-id', 'test-user-id')
        .expect(400);

      expect(response.body.error).toBe('No file uploaded');
    });

    it('should return 401 when user ID is missing', async () => {
      const response = await request(app)
        .post('/api/documents/upload')
        .attach('document', Buffer.from('mock pdf content'), 'test.pdf')
        .expect(401);

      expect(response.body.error).toBe('Unauthorized');
    });
  });

  describe('GET /api/documents/:id', () => {
    it('should get document successfully', async () => {
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

      const response = await request(app)
        .get('/api/documents/test-doc-id')
        .set('user-id', 'test-user-id')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        id: 'test-doc-id',
        originalName: 'test.pdf',
        downloadUrl: 'https://signed-url.com',
      });
    });

    it('should return 404 when document not found', async () => {
      (mysqlConnection.executeQuery as jest.Mock).mockResolvedValue([]);

      const response = await request(app)
        .get('/api/documents/nonexistent-id')
        .set('user-id', 'test-user-id')
        .expect(404);

      expect(response.body.error).toBe('Document not found');
    });
  });

  describe('DELETE /api/documents/:id', () => {
    it('should delete document successfully', async () => {
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

      const response = await request(app)
        .delete('/api/documents/test-doc-id')
        .set('user-id', 'test-user-id')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Document deleted successfully');
    });

    it('should return 404 when document not found', async () => {
      (mysqlConnection.executeQuery as jest.Mock).mockResolvedValue([]);

      const response = await request(app)
        .delete('/api/documents/nonexistent-id')
        .set('user-id', 'test-user-id')
        .expect(404);

      expect(response.body.error).toBe('Document not found');
    });
  });

  describe('GET /api/documents', () => {
    it('should list documents successfully', async () => {
      const mockDocuments = [
        {
          id: 'doc-1',
          original_name: 'test1.pdf',
          file_type: 'PDF',
          file_size: 1024,
          processing_status: 'completed',
          upload_timestamp: '2025-07-24T07:38:20.329Z',
          processed_timestamp: '2025-07-24T07:38:20.329Z'
        }
      ];

      (mysqlConnection.executeQuery as jest.Mock)
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce(mockDocuments);

      const response = await request(app)
        .get('/api/documents')
        .set('user-id', 'test-user-id')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.documents).toEqual(mockDocuments);
      expect(response.body.data.pagination).toMatchObject({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      });
    });

    it('should return 401 when user ID is missing', async () => {
      const response = await request(app)
        .get('/api/documents')
        .expect(401);

      expect(response.body.error).toBe('Unauthorized');
    });
  });
});