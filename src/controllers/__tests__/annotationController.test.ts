import { Request, Response } from 'express';
import { annotationController } from '../annotationController';
import { annotationModel } from '../../models/annotationModel';
import { documentModel } from '../../models/documentModel';
import { v4 as uuidv4 } from 'uuid';

// Mock the models
jest.mock('../../models/annotationModel');
jest.mock('../../models/documentModel');

const mockAnnotationModel = annotationModel as jest.Mocked<typeof annotationModel>;
const mockDocumentModel = documentModel as jest.Mocked<typeof documentModel>;

describe('AnnotationController', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;

  const mockUserId = uuidv4();
  const mockDocumentId = uuidv4();
  const mockAnnotationId = uuidv4();

  beforeEach(() => {
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson });
    
    mockRequest = {
      headers: { 'user-id': mockUserId },
      params: {},
      query: {},
      body: {}
    };
    
    mockResponse = {
      json: mockJson,
      status: mockStatus
    };

    jest.clearAllMocks();
  });

  describe('createAnnotation', () => {
    it('should create annotation successfully', async () => {
      const mockAnnotationData = {
        documentId: mockDocumentId,
        annotationType: 'highlight',
        content: 'Test highlight',
        positionData: { start: 0, end: 10, page: 1 },
        color: '#ffff00'
      };

      const mockDocument = {
        id: mockDocumentId,
        user_id: mockUserId,
        original_name: 'test.pdf',
        file_type: 'PDF',
        file_size: 1024,
        s3_path: 'path/to/file',
        processing_status: 'completed' as const,
        upload_timestamp: new Date()
      };

      const mockCreatedAnnotation = {
        id: mockAnnotationId,
        user_id: mockUserId,
        document_id: mockDocumentId,
        annotation_type: 'highlight' as const,
        content: 'Test highlight',
        position_data: { start: 0, end: 10, page: 1 },
        created_at: new Date(),
        updated_at: new Date()
      };

      mockRequest.body = mockAnnotationData;
      mockDocumentModel.findByIdAndUser.mockResolvedValueOnce(mockDocument);
      mockAnnotationModel.create.mockResolvedValueOnce(mockCreatedAnnotation);

      await annotationController.createAnnotation(mockRequest as Request, mockResponse as Response);

      expect(mockDocumentModel.findByIdAndUser).toHaveBeenCalledWith(mockDocumentId, mockUserId);
      expect(mockAnnotationModel.create).toHaveBeenCalledWith({
        userId: mockUserId,
        documentId: mockDocumentId,
        annotationType: 'highlight',
        content: 'Test highlight',
        positionData: { start: 0, end: 10, page: 1 },
        color: '#ffff00'
      });
      expect(mockStatus).toHaveBeenCalledWith(201);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        message: 'Annotation created successfully',
        data: mockCreatedAnnotation
      });
    });

    it('should return 401 when user ID is missing', async () => {
      mockRequest.headers = {};

      await annotationController.createAnnotation(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'User ID is required'
      });
    });

    it('should return 400 when required fields are missing', async () => {
      mockRequest.body = { documentId: mockDocumentId };

      await annotationController.createAnnotation(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Missing required fields',
        message: 'documentId, annotationType, content, and positionData are required'
      });
    });

    it('should return 400 when annotation type is invalid', async () => {
      mockRequest.body = {
        documentId: mockDocumentId,
        annotationType: 'invalid',
        content: 'Test',
        positionData: { start: 0, end: 10 }
      };

      await annotationController.createAnnotation(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Invalid annotation type',
        message: 'annotationType must be one of: highlight, note, bookmark'
      });
    });

    it('should return 404 when document not found', async () => {
      mockRequest.body = {
        documentId: mockDocumentId,
        annotationType: 'highlight',
        content: 'Test',
        positionData: { start: 0, end: 10 }
      };

      mockDocumentModel.findByIdAndUser.mockResolvedValueOnce(null);

      await annotationController.createAnnotation(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Document not found',
        message: 'The specified document does not exist or you do not have access to it'
      });
    });
  });

  describe('getAnnotation', () => {
    it('should return annotation successfully', async () => {
      const mockAnnotation = {
        id: mockAnnotationId,
        user_id: mockUserId,
        document_id: mockDocumentId,
        annotation_type: 'highlight' as const,
        content: 'Test highlight',
        position_data: { start: 0, end: 10 },
        created_at: new Date(),
        updated_at: new Date()
      };

      mockRequest.params = { id: mockAnnotationId };
      mockAnnotationModel.findByIdAndUser.mockResolvedValueOnce(mockAnnotation);

      await annotationController.getAnnotation(mockRequest as Request, mockResponse as Response);

      expect(mockAnnotationModel.findByIdAndUser).toHaveBeenCalledWith(mockAnnotationId, mockUserId);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: mockAnnotation
      });
    });

    it('should return 404 when annotation not found', async () => {
      mockRequest.params = { id: mockAnnotationId };
      mockAnnotationModel.findByIdAndUser.mockResolvedValueOnce(null);

      await annotationController.getAnnotation(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Annotation not found',
        message: 'The requested annotation does not exist or you do not have access to it'
      });
    });
  });

  describe('getDocumentAnnotations', () => {
    it('should return document annotations successfully', async () => {
      const mockDocument = {
        id: mockDocumentId,
        user_id: mockUserId,
        original_name: 'test.pdf',
        file_type: 'PDF',
        file_size: 1024,
        s3_path: 'path/to/file',
        processing_status: 'completed' as const,
        upload_timestamp: new Date()
      };

      const mockAnnotations = [
        {
          id: uuidv4(),
          user_id: mockUserId,
          document_id: mockDocumentId,
          annotation_type: 'highlight' as const,
          content: 'Highlight 1',
          position_data: { start: 0, end: 10 },
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      mockRequest.params = { documentId: mockDocumentId };
      mockDocumentModel.findByIdAndUser.mockResolvedValueOnce(mockDocument);
      mockAnnotationModel.findByDocumentAndUser.mockResolvedValueOnce(mockAnnotations);

      await annotationController.getDocumentAnnotations(mockRequest as Request, mockResponse as Response);

      expect(mockDocumentModel.findByIdAndUser).toHaveBeenCalledWith(mockDocumentId, mockUserId);
      expect(mockAnnotationModel.findByDocumentAndUser).toHaveBeenCalledWith(mockDocumentId, mockUserId, undefined);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: {
          documentId: mockDocumentId,
          annotations: mockAnnotations,
          total: 1
        }
      });
    });

    it('should filter by annotation type when provided', async () => {
      const mockDocument = {
        id: mockDocumentId,
        user_id: mockUserId,
        original_name: 'test.pdf',
        file_type: 'PDF',
        file_size: 1024,
        s3_path: 'path/to/file',
        processing_status: 'completed' as const,
        upload_timestamp: new Date()
      };

      mockRequest.params = { documentId: mockDocumentId };
      mockRequest.query = { type: 'highlight' };
      mockDocumentModel.findByIdAndUser.mockResolvedValueOnce(mockDocument);
      mockAnnotationModel.findByDocumentAndUser.mockResolvedValueOnce([]);

      await annotationController.getDocumentAnnotations(mockRequest as Request, mockResponse as Response);

      expect(mockAnnotationModel.findByDocumentAndUser).toHaveBeenCalledWith(mockDocumentId, mockUserId, 'highlight');
    });
  });

  describe('getUserAnnotations', () => {
    it('should return user annotations with pagination', async () => {
      const mockResult = {
        annotations: [
          {
            id: mockAnnotationId,
            user_id: mockUserId,
            document_id: mockDocumentId,
            annotation_type: 'highlight' as const,
            content: 'Test annotation',
            position_data: { start: 0, end: 10 },
            created_at: new Date(),
            updated_at: new Date()
          }
        ],
        total: 1
      };

      mockRequest.query = { page: '1', limit: '20' };
      mockAnnotationModel.findByUser.mockResolvedValueOnce(mockResult);

      await annotationController.getUserAnnotations(mockRequest as Request, mockResponse as Response);

      expect(mockAnnotationModel.findByUser).toHaveBeenCalledWith(mockUserId, {
        documentId: undefined,
        annotationType: undefined,
        content: undefined,
        startDate: undefined,
        endDate: undefined,
        limit: 20,
        offset: 0
      });

      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: {
          annotations: mockResult.annotations,
          pagination: {
            page: 1,
            limit: 20,
            total: 1,
            totalPages: 1,
            hasNext: false,
            hasPrev: false
          }
        }
      });
    });

    it('should validate pagination parameters', async () => {
      mockRequest.query = { page: '0', limit: '200' };

      await annotationController.getUserAnnotations(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Invalid pagination parameters',
        message: 'Page must be >= 1 and limit must be between 1 and 100'
      });
    });
  });

  describe('updateAnnotation', () => {
    it('should update annotation successfully', async () => {
      const mockExistingAnnotation = {
        id: mockAnnotationId,
        user_id: mockUserId,
        document_id: mockDocumentId,
        annotation_type: 'highlight' as const,
        content: 'Original content',
        position_data: { start: 0, end: 10 },
        created_at: new Date(),
        updated_at: new Date()
      };

      const mockUpdatedAnnotation = {
        ...mockExistingAnnotation,
        content: 'Updated content',
        updated_at: new Date()
      };

      mockRequest.params = { id: mockAnnotationId };
      mockRequest.body = { content: 'Updated content' };

      mockAnnotationModel.findByIdAndUser
        .mockResolvedValueOnce(mockExistingAnnotation)
        .mockResolvedValueOnce(mockUpdatedAnnotation);
      mockAnnotationModel.update.mockResolvedValueOnce(true);

      await annotationController.updateAnnotation(mockRequest as Request, mockResponse as Response);

      expect(mockAnnotationModel.update).toHaveBeenCalledWith(mockAnnotationId, mockUserId, {
        content: 'Updated content'
      });
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        message: 'Annotation updated successfully',
        data: mockUpdatedAnnotation
      });
    });

    it('should return 400 when no update data provided', async () => {
      const mockExistingAnnotation = {
        id: mockAnnotationId,
        user_id: mockUserId,
        document_id: mockDocumentId,
        annotation_type: 'highlight' as const,
        content: 'Original content',
        position_data: { start: 0, end: 10 },
        created_at: new Date(),
        updated_at: new Date()
      };

      mockRequest.params = { id: mockAnnotationId };
      mockRequest.body = {};
      mockAnnotationModel.findByIdAndUser.mockResolvedValueOnce(mockExistingAnnotation);

      await annotationController.updateAnnotation(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'No update data provided',
        message: 'At least one field (content, positionData, color, tags) must be provided'
      });
    });
  });

  describe('deleteAnnotation', () => {
    it('should delete annotation successfully', async () => {
      const mockAnnotation = {
        id: mockAnnotationId,
        user_id: mockUserId,
        document_id: mockDocumentId,
        annotation_type: 'highlight' as const,
        content: 'Test annotation',
        position_data: { start: 0, end: 10 },
        created_at: new Date(),
        updated_at: new Date()
      };

      mockRequest.params = { id: mockAnnotationId };
      mockAnnotationModel.findByIdAndUser.mockResolvedValueOnce(mockAnnotation);
      mockAnnotationModel.deleteByIdAndUser.mockResolvedValueOnce(true);

      await annotationController.deleteAnnotation(mockRequest as Request, mockResponse as Response);

      expect(mockAnnotationModel.deleteByIdAndUser).toHaveBeenCalledWith(mockAnnotationId, mockUserId);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        message: 'Annotation deleted successfully'
      });
    });
  });

  describe('searchAnnotations', () => {
    it('should search annotations successfully', async () => {
      const mockResult = {
        annotations: [
          {
            id: mockAnnotationId,
            user_id: mockUserId,
            document_id: mockDocumentId,
            annotation_type: 'highlight' as const,
            content: 'Important concept',
            position_data: { start: 0, end: 10 },
            created_at: new Date(),
            updated_at: new Date()
          }
        ],
        total: 1
      };

      mockRequest.query = { q: 'concept', page: '1', limit: '20' };
      mockAnnotationModel.searchByContent.mockResolvedValueOnce(mockResult);

      await annotationController.searchAnnotations(mockRequest as Request, mockResponse as Response);

      expect(mockAnnotationModel.searchByContent).toHaveBeenCalledWith(mockUserId, 'concept', {
        documentId: undefined,
        annotationType: undefined,
        limit: 20,
        offset: 0
      });

      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: {
          searchTerm: 'concept',
          annotations: mockResult.annotations,
          pagination: {
            page: 1,
            limit: 20,
            total: 1,
            totalPages: 1,
            hasNext: false,
            hasPrev: false
          }
        }
      });
    });

    it('should return 400 when search term is missing', async () => {
      mockRequest.query = {};

      await annotationController.searchAnnotations(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Missing search term',
        message: 'Query parameter "q" is required'
      });
    });
  });

  describe('getAnnotationStats', () => {
    it('should return annotation statistics', async () => {
      const mockStats = {
        total: 10,
        byType: {
          highlight: 5,
          note: 3,
          bookmark: 2
        },
        byDocument: [
          { documentId: mockDocumentId, count: 8 }
        ]
      };

      mockAnnotationModel.getStatsByUser.mockResolvedValueOnce(mockStats);

      await annotationController.getAnnotationStats(mockRequest as Request, mockResponse as Response);

      expect(mockAnnotationModel.getStatsByUser).toHaveBeenCalledWith(mockUserId);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: mockStats
      });
    });
  });

  describe('getRecentAnnotations', () => {
    it('should return recent annotations', async () => {
      const mockAnnotations = [
        {
          id: mockAnnotationId,
          user_id: mockUserId,
          document_id: mockDocumentId,
          annotation_type: 'highlight' as const,
          content: 'Recent annotation',
          position_data: { start: 0, end: 10 },
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      mockRequest.query = { limit: '5' };
      mockAnnotationModel.getRecentByUser.mockResolvedValueOnce(mockAnnotations);

      await annotationController.getRecentAnnotations(mockRequest as Request, mockResponse as Response);

      expect(mockAnnotationModel.getRecentByUser).toHaveBeenCalledWith(mockUserId, 5);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: {
          annotations: mockAnnotations,
          total: 1
        }
      });
    });

    it('should validate limit parameter', async () => {
      mockRequest.query = { limit: '100' };

      await annotationController.getRecentAnnotations(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Invalid limit parameter',
        message: 'Limit must be between 1 and 50'
      });
    });
  });
});