import { documentModel, ProcessingStatus, DocumentMetadata } from '../documentModel';
import { mysqlConnection } from '../../database/mysql';

// Mock the MySQL connection
jest.mock('../../database/mysql');
const mockMysqlConnection = mysqlConnection as jest.Mocked<typeof mysqlConnection>;

describe('DocumentModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new document with default status pending', async () => {
      const mockExecuteQuery = jest.fn().mockResolvedValue(undefined);
      mockMysqlConnection.executeQuery = mockExecuteQuery;

      const createData = {
        userId: 'user-123',
        originalName: 'test.pdf',
        fileType: 'PDF',
        fileSize: 1024,
        s3Path: 'documents/test.pdf',
        metadata: { mimeType: 'application/pdf' }
      };

      const result = await documentModel.create(createData);

      expect(mockExecuteQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO documents'),
        expect.arrayContaining([
          expect.any(String), // document ID
          'user-123',
          'test.pdf',
          'PDF',
          1024,
          'documents/test.pdf',
          'pending',
          expect.any(Date),
          expect.any(String), // JSON metadata
          expect.any(Date),
          expect.any(Date)
        ])
      );

      expect(result).toMatchObject({
        id: expect.any(String),
        user_id: 'user-123',
        original_name: 'test.pdf',
        file_type: 'PDF',
        file_size: 1024,
        s3_path: 'documents/test.pdf',
        processing_status: 'pending',
        upload_timestamp: expect.any(Date),
        metadata: { mimeType: 'application/pdf' }
      });
    });
  });

  describe('findByIdAndUser', () => {
    it('should return document when found', async () => {
      const mockDocument = {
        id: 'doc-123',
        user_id: 'user-123',
        original_name: 'test.pdf',
        file_type: 'PDF',
        file_size: 1024,
        s3_path: 'documents/test.pdf',
        processing_status: 'completed',
        upload_timestamp: new Date(),
        processed_timestamp: new Date(),
        metadata: '{"mimeType": "application/pdf"}'
      };

      mockMysqlConnection.executeQuery = jest.fn().mockResolvedValue([mockDocument]);

      const result = await documentModel.findByIdAndUser('doc-123', 'user-123');

      expect(result).toMatchObject({
        id: 'doc-123',
        user_id: 'user-123',
        original_name: 'test.pdf',
        file_type: 'PDF',
        processing_status: 'completed',
        metadata: { mimeType: 'application/pdf' }
      });
    });

    it('should return null when document not found', async () => {
      mockMysqlConnection.executeQuery = jest.fn().mockResolvedValue([]);

      const result = await documentModel.findByIdAndUser('doc-123', 'user-123');

      expect(result).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('should update processing status successfully', async () => {
      const mockResult = { affectedRows: 1 };
      mockMysqlConnection.executeQuery = jest.fn().mockResolvedValue(mockResult);

      const result = await documentModel.updateStatus('doc-123', 'completed', new Date());

      expect(mockMysqlConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE documents'),
        expect.arrayContaining(['completed', expect.any(Date), 'doc-123'])
      );

      expect(result).toBe(true);
    });

    it('should return false when no rows affected', async () => {
      const mockResult = { affectedRows: 0 };
      mockMysqlConnection.executeQuery = jest.fn().mockResolvedValue(mockResult);

      const result = await documentModel.updateStatus('doc-123', 'failed');

      expect(result).toBe(false);
    });
  });

  describe('updateMetadata', () => {
    it('should update document metadata successfully', async () => {
      const mockResult = { affectedRows: 1 };
      mockMysqlConnection.executeQuery = jest.fn().mockResolvedValue(mockResult);

      const metadata: DocumentMetadata = {
        processingSteps: {
          ingestion: { status: 'completed', timestamp: new Date() }
        }
      };

      const result = await documentModel.updateMetadata('doc-123', metadata);

      expect(mockMysqlConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE documents'),
        [JSON.stringify(metadata), 'doc-123']
      );

      expect(result).toBe(true);
    });
  });

  describe('updateStatusAndMetadata', () => {
    it('should update both status and metadata in transaction', async () => {
      const mockTransaction = jest.fn().mockImplementation(async (callback) => {
        const mockConnection = {
          execute: jest.fn().mockResolvedValue([{ affectedRows: 1 }, undefined])
        };
        return await callback(mockConnection);
      });

      mockMysqlConnection.executeTransaction = mockTransaction;

      const metadata: DocumentMetadata = {
        processingSteps: {
          analysis: { status: 'completed', timestamp: new Date() }
        }
      };

      const result = await documentModel.updateStatusAndMetadata('doc-123', {
        processingStatus: 'completed',
        processedTimestamp: new Date(),
        metadata
      });

      expect(mockTransaction).toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });

  describe('addProcessingStep', () => {
    it('should add processing step to existing metadata', async () => {
      const existingDocument = {
        id: 'doc-123',
        user_id: 'user-123',
        original_name: 'test.pdf',
        file_type: 'PDF',
        file_size: 1024,
        s3_path: 'documents/test.pdf',
        processing_status: 'processing',
        upload_timestamp: new Date(),
        processed_timestamp: null,
        metadata: JSON.stringify({ processingSteps: {} })
      };

      // Mock findById to return existing document
      mockMysqlConnection.executeQuery = jest.fn()
        .mockResolvedValueOnce([existingDocument]) // findById call
        .mockResolvedValueOnce({ affectedRows: 1 }); // updateMetadata call

      const result = await documentModel.addProcessingStep('doc-123', 'ingestion', 'completed');

      expect(result).toBe(true);
      expect(mockMysqlConnection.executeQuery).toHaveBeenCalledTimes(2);
    });

    it('should return false when document not found', async () => {
      mockMysqlConnection.executeQuery = jest.fn().mockResolvedValue([]);

      const result = await documentModel.addProcessingStep('doc-123', 'ingestion', 'failed', 'Error message');

      expect(result).toBe(false);
    });
  });

  describe('findByStatus', () => {
    it('should return documents with specified status', async () => {
      const mockDocuments = [
        {
          id: 'doc-1',
          user_id: 'user-123',
          original_name: 'test1.pdf',
          file_type: 'PDF',
          file_size: 1024,
          s3_path: 'documents/test1.pdf',
          processing_status: 'pending',
          upload_timestamp: new Date(),
          processed_timestamp: null,
          metadata: null
        },
        {
          id: 'doc-2',
          user_id: 'user-456',
          original_name: 'test2.pdf',
          file_type: 'PDF',
          file_size: 2048,
          s3_path: 'documents/test2.pdf',
          processing_status: 'pending',
          upload_timestamp: new Date(),
          processed_timestamp: null,
          metadata: null
        }
      ];

      mockMysqlConnection.executeQuery = jest.fn().mockResolvedValue(mockDocuments);

      const result = await documentModel.findByStatus('pending', 10);

      expect(mockMysqlConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE processing_status = ?'),
        ['pending', 10]
      );

      expect(result).toHaveLength(2);
      expect(result[0].processing_status).toBe('pending');
    });
  });

  describe('findByUser', () => {
    it('should return paginated documents for user', async () => {
      const mockCountResult = [{ total: 5 }];
      const mockDocuments = [
        {
          id: 'doc-1',
          user_id: 'user-123',
          original_name: 'test1.pdf',
          file_type: 'PDF',
          file_size: 1024,
          s3_path: 'documents/test1.pdf',
          processing_status: 'completed',
          upload_timestamp: new Date(),
          processed_timestamp: new Date(),
          metadata: null
        }
      ];

      mockMysqlConnection.executeQuery = jest.fn()
        .mockResolvedValueOnce(mockCountResult)
        .mockResolvedValueOnce(mockDocuments);

      const result = await documentModel.findByUser('user-123', undefined, 10, 0);

      expect(result.total).toBe(5);
      expect(result.documents).toHaveLength(1);
      expect(result.documents[0].user_id).toBe('user-123');
    });

    it('should filter by status when provided', async () => {
      const mockCountResult = [{ total: 2 }];
      const mockDocuments: any[] = [];

      mockMysqlConnection.executeQuery = jest.fn()
        .mockResolvedValueOnce(mockCountResult)
        .mockResolvedValueOnce(mockDocuments);

      await documentModel.findByUser('user-123', 'completed', 10, 0);

      expect(mockMysqlConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND processing_status = ?'),
        expect.arrayContaining(['user-123', 'completed'])
      );
    });
  });

  describe('getProcessingStats', () => {
    it('should return processing statistics', async () => {
      const mockStats = [
        { processing_status: 'pending', count: 5 },
        { processing_status: 'processing', count: 2 },
        { processing_status: 'completed', count: 10 },
        { processing_status: 'failed', count: 1 }
      ];

      mockMysqlConnection.executeQuery = jest.fn().mockResolvedValue(mockStats);

      const result = await documentModel.getProcessingStats();

      expect(result).toEqual({
        pending: 5,
        processing: 2,
        completed: 10,
        failed: 1,
        total: 18
      });
    });

    it('should handle missing statuses', async () => {
      const mockStats = [
        { processing_status: 'completed', count: 3 }
      ];

      mockMysqlConnection.executeQuery = jest.fn().mockResolvedValue(mockStats);

      const result = await documentModel.getProcessingStats();

      expect(result).toEqual({
        pending: 0,
        processing: 0,
        completed: 3,
        failed: 0,
        total: 3
      });
    });
  });

  describe('deleteByIdAndUser', () => {
    it('should delete document successfully', async () => {
      const mockResult = { affectedRows: 1 };
      mockMysqlConnection.executeQuery = jest.fn().mockResolvedValue(mockResult);

      const result = await documentModel.deleteByIdAndUser('doc-123', 'user-123');

      expect(mockMysqlConnection.executeQuery).toHaveBeenCalledWith(
        'DELETE FROM documents WHERE id = ? AND user_id = ?',
        ['doc-123', 'user-123']
      );

      expect(result).toBe(true);
    });

    it('should return false when no rows affected', async () => {
      const mockResult = { affectedRows: 0 };
      mockMysqlConnection.executeQuery = jest.fn().mockResolvedValue(mockResult);

      const result = await documentModel.deleteByIdAndUser('doc-123', 'user-123');

      expect(result).toBe(false);
    });
  });
});