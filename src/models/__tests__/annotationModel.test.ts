import { annotationModel, AnnotationType } from '../annotationModel';
import { mysqlConnection } from '../../database/mysql';
import { v4 as uuidv4 } from 'uuid';

// Mock the database connection
jest.mock('../../database/mysql');
const mockMysqlConnection = mysqlConnection as jest.Mocked<typeof mysqlConnection>;

describe('AnnotationModel', () => {
  const mockUserId = uuidv4();
  const mockDocumentId = uuidv4();
  const mockAnnotationId = uuidv4();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new annotation successfully', async () => {
      const mockAnnotationData = {
        userId: mockUserId,
        documentId: mockDocumentId,
        annotationType: 'highlight' as AnnotationType,
        content: 'This is a test highlight',
        positionData: { start: 0, end: 10, page: 1 },
        color: '#ffff00'
      };

      mockMysqlConnection.executeQuery.mockResolvedValueOnce(undefined);

      const result = await annotationModel.create(mockAnnotationData);

      expect(mockMysqlConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO annotations'),
        expect.arrayContaining([
          expect.any(String), // annotation ID
          mockUserId,
          mockDocumentId,
          'highlight',
          'This is a test highlight',
          JSON.stringify({ start: 0, end: 10, page: 1 }),
          '#ffff00',
          expect.any(Date),
          expect.any(Date)
        ])
      );

      expect(result).toMatchObject({
        id: expect.any(String),
        user_id: mockUserId,
        document_id: mockDocumentId,
        annotation_type: 'highlight',
        content: 'This is a test highlight',
        position_data: { start: 0, end: 10, page: 1 }
      });
    });

    it('should use default color when not provided', async () => {
      const mockAnnotationData = {
        userId: mockUserId,
        documentId: mockDocumentId,
        annotationType: 'note' as AnnotationType,
        content: 'This is a test note',
        positionData: { start: 0, end: 10, page: 1 }
      };

      mockMysqlConnection.executeQuery.mockResolvedValueOnce(undefined);

      const result = await annotationModel.create(mockAnnotationData);

      expect(mockMysqlConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO annotations'),
        expect.arrayContaining([
          expect.any(String),
          mockUserId,
          mockDocumentId,
          'note',
          'This is a test note',
          JSON.stringify({ start: 0, end: 10, page: 1 }),
          '#ffff00', // default color
          expect.any(Date),
          expect.any(Date)
        ])
      );
    });
  });

  describe('findByIdAndUser', () => {
    it('should return annotation when found', async () => {
      const mockRow = {
        id: mockAnnotationId,
        user_id: mockUserId,
        document_id: mockDocumentId,
        annotation_type: 'highlight',
        content: 'Test content',
        position_data: JSON.stringify({ start: 0, end: 10 }),
        created_at: new Date(),
        updated_at: new Date()
      };

      mockMysqlConnection.executeQuery.mockResolvedValueOnce([mockRow]);

      const result = await annotationModel.findByIdAndUser(mockAnnotationId, mockUserId);

      expect(mockMysqlConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [mockAnnotationId, mockUserId]
      );

      expect(result).toMatchObject({
        id: mockAnnotationId,
        user_id: mockUserId,
        document_id: mockDocumentId,
        annotation_type: 'highlight',
        content: 'Test content',
        position_data: { start: 0, end: 10 }
      });
    });

    it('should return null when annotation not found', async () => {
      mockMysqlConnection.executeQuery.mockResolvedValueOnce([]);

      const result = await annotationModel.findByIdAndUser(mockAnnotationId, mockUserId);

      expect(result).toBeNull();
    });
  });

  describe('findByDocumentAndUser', () => {
    it('should return annotations for document', async () => {
      const mockRows = [
        {
          id: uuidv4(),
          user_id: mockUserId,
          document_id: mockDocumentId,
          annotation_type: 'highlight',
          content: 'Highlight 1',
          position_data: JSON.stringify({ start: 0, end: 10 }),
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: uuidv4(),
          user_id: mockUserId,
          document_id: mockDocumentId,
          annotation_type: 'note',
          content: 'Note 1',
          position_data: JSON.stringify({ start: 20, end: 30 }),
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      mockMysqlConnection.executeQuery.mockResolvedValueOnce(mockRows);

      const result = await annotationModel.findByDocumentAndUser(mockDocumentId, mockUserId);

      expect(mockMysqlConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE document_id = ? AND user_id = ?'),
        [mockDocumentId, mockUserId]
      );

      expect(result).toHaveLength(2);
      expect(result[0].annotation_type).toBe('highlight');
      expect(result[1].annotation_type).toBe('note');
    });

    it('should filter by annotation type when provided', async () => {
      mockMysqlConnection.executeQuery.mockResolvedValueOnce([]);

      await annotationModel.findByDocumentAndUser(mockDocumentId, mockUserId, 'highlight');

      expect(mockMysqlConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND annotation_type = ?'),
        [mockDocumentId, mockUserId, 'highlight']
      );
    });
  });

  describe('findByUser', () => {
    it('should return paginated annotations for user', async () => {
      const mockCountResult = [{ total: 5 }];
      const mockRows = [
        {
          id: uuidv4(),
          user_id: mockUserId,
          document_id: mockDocumentId,
          annotation_type: 'highlight',
          content: 'Test content',
          position_data: JSON.stringify({ start: 0, end: 10 }),
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      mockMysqlConnection.executeQuery
        .mockResolvedValueOnce(mockCountResult)
        .mockResolvedValueOnce(mockRows);

      const result = await annotationModel.findByUser(mockUserId, {
        limit: 10,
        offset: 0
      });

      expect(result.total).toBe(5);
      expect(result.annotations).toHaveLength(1);
    });

    it('should apply content filter when provided', async () => {
      mockMysqlConnection.executeQuery
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([]);

      await annotationModel.findByUser(mockUserId, {
        content: 'search term'
      });

      expect(mockMysqlConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND content LIKE ?'),
        expect.arrayContaining([mockUserId, '%search term%'])
      );
    });
  });

  describe('update', () => {
    it('should update annotation successfully', async () => {
      const mockResult = { affectedRows: 1 };
      mockMysqlConnection.executeQuery.mockResolvedValueOnce(mockResult);

      const updateData = {
        content: 'Updated content',
        color: '#ff0000'
      };

      const result = await annotationModel.update(mockAnnotationId, mockUserId, updateData);

      expect(mockMysqlConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE annotations'),
        ['Updated content', '#ff0000', mockAnnotationId, mockUserId]
      );

      expect(result).toBe(true);
    });

    it('should return false when no fields to update', async () => {
      const result = await annotationModel.update(mockAnnotationId, mockUserId, {});

      expect(result).toBe(false);
      expect(mockMysqlConnection.executeQuery).not.toHaveBeenCalled();
    });
  });

  describe('deleteByIdAndUser', () => {
    it('should delete annotation successfully', async () => {
      const mockResult = { affectedRows: 1 };
      mockMysqlConnection.executeQuery.mockResolvedValueOnce(mockResult);

      const result = await annotationModel.deleteByIdAndUser(mockAnnotationId, mockUserId);

      expect(mockMysqlConnection.executeQuery).toHaveBeenCalledWith(
        'DELETE FROM annotations WHERE id = ? AND user_id = ?',
        [mockAnnotationId, mockUserId]
      );

      expect(result).toBe(true);
    });

    it('should return false when annotation not found', async () => {
      const mockResult = { affectedRows: 0 };
      mockMysqlConnection.executeQuery.mockResolvedValueOnce(mockResult);

      const result = await annotationModel.deleteByIdAndUser(mockAnnotationId, mockUserId);

      expect(result).toBe(false);
    });
  });

  describe('searchByContent', () => {
    it('should search annotations with relevance scoring', async () => {
      const mockCountResult = [{ total: 2 }];
      const mockRows = [
        {
          id: uuidv4(),
          user_id: mockUserId,
          document_id: mockDocumentId,
          annotation_type: 'highlight',
          content: 'Important concept explanation',
          position_data: JSON.stringify({ start: 0, end: 10 }),
          created_at: new Date(),
          updated_at: new Date(),
          relevance_score: 3
        }
      ];

      mockMysqlConnection.executeQuery
        .mockResolvedValueOnce(mockCountResult)
        .mockResolvedValueOnce(mockRows);

      const result = await annotationModel.searchByContent(mockUserId, 'concept', {
        limit: 10,
        offset: 0
      });

      expect(mockMysqlConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('CASE'),
        expect.arrayContaining(['%concept%', 'concept%', mockUserId, '%concept%'])
      );

      expect(result.total).toBe(2);
      expect(result.annotations).toHaveLength(1);
    });
  });

  describe('getStatsByUser', () => {
    it('should return annotation statistics', async () => {
      const mockTypeStats = [
        { annotation_type: 'highlight', count: 5 },
        { annotation_type: 'note', count: 3 },
        { annotation_type: 'bookmark', count: 2 }
      ];

      const mockDocumentStats = [
        { document_id: mockDocumentId, count: 8 }
      ];

      mockMysqlConnection.executeQuery
        .mockResolvedValueOnce(mockTypeStats)
        .mockResolvedValueOnce(mockDocumentStats);

      const result = await annotationModel.getStatsByUser(mockUserId);

      expect(result.total).toBe(10);
      expect(result.byType.highlight).toBe(5);
      expect(result.byType.note).toBe(3);
      expect(result.byType.bookmark).toBe(2);
      expect(result.byDocument).toHaveLength(1);
      expect(result.byDocument[0].documentId).toBe(mockDocumentId);
      expect(result.byDocument[0].count).toBe(8);
    });
  });

  describe('getRecentByUser', () => {
    it('should return recent annotations', async () => {
      const mockRows = [
        {
          id: uuidv4(),
          user_id: mockUserId,
          document_id: mockDocumentId,
          annotation_type: 'highlight',
          content: 'Recent annotation',
          position_data: JSON.stringify({ start: 0, end: 10 }),
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      mockMysqlConnection.executeQuery.mockResolvedValueOnce(mockRows);

      const result = await annotationModel.getRecentByUser(mockUserId, 5);

      expect(mockMysqlConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC'),
        [mockUserId, 5]
      );

      expect(result).toHaveLength(1);
    });
  });
});