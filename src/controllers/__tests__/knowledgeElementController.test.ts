import { Request, Response } from 'express';
import { knowledgeElementController } from '../knowledgeElementController';
import { mongoConnection } from '../../database/mongodb';
import { ObjectId } from 'mongodb';

// Mock dependencies
jest.mock('../../database/mongodb');
jest.mock('../../utils/logger');

const mockMongoConnection = mongoConnection as jest.Mocked<typeof mongoConnection>;

describe('KnowledgeElementController', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockStatus: jest.Mock;
  let mockJson: jest.Mock;

  const mockUserId = 'user-123';
  const mockElementId = new ObjectId().toString();

  beforeEach(() => {
    mockStatus = jest.fn().mockReturnThis();
    mockJson = jest.fn();
    
    mockRequest = {
      user: { id: mockUserId } as any,
      query: {},
      body: {},
      params: {}
    };
    
    mockResponse = {
      status: mockStatus,
      json: mockJson
    };

    jest.clearAllMocks();
  });

  describe('getKnowledgeElements', () => {
    const mockKnowledgeElements = [
      {
        _id: mockElementId,
        document_id: 'doc-123',
        agent_type: 'analysis' as const,
        element_type: 'summary' as const,
        content: { title: 'Test Summary', body: 'Summary content' },
        source_location: {},
        created_at: new Date(),
        updated_at: new Date(),
        tags: ['test'],
        user_id: mockUserId
      }
    ];

    beforeEach(() => {
      mockMongoConnection.findKnowledgeElements = jest.fn().mockResolvedValue(mockKnowledgeElements);
      mockMongoConnection.getKnowledgeElementsCollection = jest.fn().mockReturnValue({
        countDocuments: jest.fn().mockResolvedValue(1)
      });
    });

    it('should get knowledge elements successfully', async () => {
      await knowledgeElementController.getKnowledgeElements(mockRequest as Request, mockResponse as Response);

      expect(mockMongoConnection.findKnowledgeElements).toHaveBeenCalledWith(
        { user_id: mockUserId },
        { limit: 50, skip: 0, sort: { created_at: -1 } }
      );
      expect(mockJson).toHaveBeenCalledWith({
        data: mockKnowledgeElements,
        pagination: {
          total: 1,
          limit: 50,
          skip: 0,
          hasMore: false
        }
      });
    });

    it('should filter by document_id', async () => {
      mockRequest.query = { document_id: 'doc-123' };

      await knowledgeElementController.getKnowledgeElements(mockRequest as Request, mockResponse as Response);

      expect(mockMongoConnection.findKnowledgeElements).toHaveBeenCalledWith(
        { user_id: mockUserId, document_id: 'doc-123' },
        { limit: 50, skip: 0, sort: { created_at: -1 } }
      );
    });

    it('should filter by tags', async () => {
      mockRequest.query = { tags: ['tag1', 'tag2'] };

      await knowledgeElementController.getKnowledgeElements(mockRequest as Request, mockResponse as Response);

      expect(mockMongoConnection.findKnowledgeElements).toHaveBeenCalledWith(
        { user_id: mockUserId, tags: { $in: ['tag1', 'tag2'] } },
        { limit: 50, skip: 0, sort: { created_at: -1 } }
      );
    });

    it('should return 401 when user not authenticated', async () => {
      mockRequest.user = undefined;

      await knowledgeElementController.getKnowledgeElements(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockJson).toHaveBeenCalledWith({ error: 'User not authenticated' });
    });
  });

  describe('searchKnowledgeElements', () => {
    const mockSearchResults = [
      {
        _id: mockElementId,
        document_id: 'doc-123',
        agent_type: 'analysis' as const,
        element_type: 'summary' as const,
        content: { title: 'Test Summary', body: 'Summary content' },
        source_location: {},
        created_at: new Date(),
        updated_at: new Date(),
        tags: ['test'],
        user_id: mockUserId
      }
    ];

    beforeEach(() => {
      mockMongoConnection.searchKnowledgeElements = jest.fn().mockResolvedValue(mockSearchResults);
    });

    it('should search knowledge elements successfully', async () => {
      mockRequest.body = { text: 'test search' };

      await knowledgeElementController.searchKnowledgeElements(mockRequest as Request, mockResponse as Response);

      expect(mockMongoConnection.searchKnowledgeElements).toHaveBeenCalledWith(
        'test search',
        { user_id: mockUserId }
      );
      expect(mockJson).toHaveBeenCalledWith({
        data: mockSearchResults,
        pagination: {
          total: 1,
          limit: 50,
          skip: 0,
          hasMore: false
        },
        searchQuery: 'test search'
      });
    });

    it('should return 400 when search text is empty', async () => {
      mockRequest.body = { text: '' };

      await knowledgeElementController.searchKnowledgeElements(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({ error: 'Search text is required' });
    });

    it('should return 401 when user not authenticated', async () => {
      mockRequest.user = undefined;
      mockRequest.body = { text: 'test' };

      await knowledgeElementController.searchKnowledgeElements(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockJson).toHaveBeenCalledWith({ error: 'User not authenticated' });
    });
  });

  describe('getKnowledgeElement', () => {
    const mockKnowledgeElement = {
      _id: mockElementId,
      document_id: 'doc-123',
      agent_type: 'analysis' as const,
      element_type: 'summary' as const,
      content: { title: 'Test Summary', body: 'Summary content' },
      source_location: {},
      created_at: new Date(),
      updated_at: new Date(),
      tags: ['test'],
      user_id: mockUserId
    };

    beforeEach(() => {
      mockMongoConnection.getKnowledgeElementsCollection = jest.fn().mockReturnValue({
        findOne: jest.fn().mockResolvedValue(mockKnowledgeElement)
      });
    });

    it('should get knowledge element by ID successfully', async () => {
      mockRequest.params = { id: mockElementId };

      await knowledgeElementController.getKnowledgeElement(mockRequest as Request, mockResponse as Response);

      expect(mockJson).toHaveBeenCalledWith(mockKnowledgeElement);
    });

    it('should return 400 for invalid ObjectId', async () => {
      mockRequest.params = { id: 'invalid-id' };

      await knowledgeElementController.getKnowledgeElement(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({ error: 'Invalid knowledge element ID' });
    });

    it('should return 404 when knowledge element not found', async () => {
      mockRequest.params = { id: mockElementId };
      mockMongoConnection.getKnowledgeElementsCollection = jest.fn().mockReturnValue({
        findOne: jest.fn().mockResolvedValue(null)
      });

      await knowledgeElementController.getKnowledgeElement(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({ error: 'Knowledge element not found' });
    });
  });

  describe('createKnowledgeElement', () => {
    beforeEach(() => {
      mockMongoConnection.insertKnowledgeElement = jest.fn().mockResolvedValue(mockElementId);
    });

    it('should create knowledge element successfully', async () => {
      mockRequest.body = {
        document_id: 'doc-123',
        agent_type: 'analysis',
        element_type: 'summary',
        content: { title: 'Test', body: 'Content' },
        tags: ['test']
      };

      await knowledgeElementController.createKnowledgeElement(mockRequest as Request, mockResponse as Response);

      expect(mockMongoConnection.insertKnowledgeElement).toHaveBeenCalledWith({
        document_id: 'doc-123',
        agent_type: 'analysis',
        element_type: 'summary',
        content: { title: 'Test', body: 'Content' },
        source_location: {},
        tags: ['test'],
        user_id: mockUserId
      });
      expect(mockStatus).toHaveBeenCalledWith(201);
      expect(mockJson).toHaveBeenCalledWith({
        id: mockElementId,
        message: 'Knowledge element created successfully'
      });
    });

    it('should return 400 for missing required fields', async () => {
      mockRequest.body = { document_id: 'doc-123' };

      await knowledgeElementController.createKnowledgeElement(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Missing required fields: document_id, agent_type, element_type, content'
      });
    });

    it('should return 400 for invalid content structure', async () => {
      mockRequest.body = {
        document_id: 'doc-123',
        agent_type: 'analysis',
        element_type: 'summary',
        content: { title: 'Test' } // missing body
      };

      await knowledgeElementController.createKnowledgeElement(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Content must include title and body'
      });
    });
  });

  describe('updateKnowledgeElement', () => {
    beforeEach(() => {
      mockMongoConnection.getKnowledgeElementsCollection = jest.fn().mockReturnValue({
        updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 })
      });
    });

    it('should update knowledge element successfully', async () => {
      mockRequest.params = { id: mockElementId };
      mockRequest.body = {
        content: { title: 'Updated', body: 'Updated content' },
        tags: ['updated']
      };

      await knowledgeElementController.updateKnowledgeElement(mockRequest as Request, mockResponse as Response);

      expect(mockJson).toHaveBeenCalledWith({
        message: 'Knowledge element updated successfully'
      });
    });

    it('should return 404 when knowledge element not found', async () => {
      mockRequest.params = { id: mockElementId };
      mockRequest.body = { tags: ['test'] };
      mockMongoConnection.getKnowledgeElementsCollection = jest.fn().mockReturnValue({
        updateOne: jest.fn().mockResolvedValue({ matchedCount: 0 })
      });

      await knowledgeElementController.updateKnowledgeElement(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({ error: 'Knowledge element not found' });
    });
  });

  describe('deleteKnowledgeElement', () => {
    beforeEach(() => {
      mockMongoConnection.getKnowledgeElementsCollection = jest.fn().mockReturnValue({
        deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 })
      });
    });

    it('should delete knowledge element successfully', async () => {
      mockRequest.params = { id: mockElementId };

      await knowledgeElementController.deleteKnowledgeElement(mockRequest as Request, mockResponse as Response);

      expect(mockJson).toHaveBeenCalledWith({
        message: 'Knowledge element deleted successfully'
      });
    });

    it('should return 404 when knowledge element not found', async () => {
      mockRequest.params = { id: mockElementId };
      mockMongoConnection.getKnowledgeElementsCollection = jest.fn().mockReturnValue({
        deleteOne: jest.fn().mockResolvedValue({ deletedCount: 0 })
      });

      await knowledgeElementController.deleteKnowledgeElement(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({ error: 'Knowledge element not found' });
    });
  });

  describe('getKnowledgeElementStats', () => {
    beforeEach(() => {
      mockMongoConnection.getKnowledgeElementsCollection = jest.fn().mockReturnValue({
        countDocuments: jest.fn()
          .mockResolvedValueOnce(10) // total count
          .mockResolvedValueOnce(3), // recent count
        aggregate: jest.fn()
          .mockReturnValueOnce({
            toArray: jest.fn().mockResolvedValue([
              { _id: 'analysis', count: 5 },
              { _id: 'extraction', count: 3 }
            ])
          })
          .mockReturnValueOnce({
            toArray: jest.fn().mockResolvedValue([
              { _id: 'summary', count: 4 },
              { _id: 'definition', count: 6 }
            ])
          })
      });
    });

    it('should get knowledge element stats successfully', async () => {
      await knowledgeElementController.getKnowledgeElementStats(mockRequest as Request, mockResponse as Response);

      expect(mockJson).toHaveBeenCalledWith({
        total: 10,
        recent: 3,
        byAgentType: {
          analysis: 5,
          extraction: 3
        },
        byElementType: {
          summary: 4,
          definition: 6
        }
      });
    });
  });
});