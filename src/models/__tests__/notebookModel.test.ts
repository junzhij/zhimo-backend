import { notebookModel, CreateNotebookData, UpdateNotebookData, NotebookCompositionItem } from '../notebookModel';
import { mysqlConnection } from '../../database/mysql';
import { v4 as uuidv4 } from 'uuid';

// Mock the database connection
jest.mock('../../database/mysql');
const mockMysqlConnection = mysqlConnection as jest.Mocked<typeof mysqlConnection>;

describe('NotebookModel', () => {
  const mockUserId = uuidv4();
  const mockNotebookId = uuidv4();
  const mockCompositionId = uuidv4();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new notebook successfully', async () => {
      const createData: CreateNotebookData = {
        userId: mockUserId,
        title: 'Test Notebook',
        description: 'Test Description',
        templateType: 'academic',
        isPublic: false
      };

      mockMysqlConnection.executeQuery.mockResolvedValueOnce(undefined);

      const result = await notebookModel.create(createData);

      expect(result).toMatchObject({
        user_id: mockUserId,
        title: 'Test Notebook',
        description: 'Test Description'
      });
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);

      expect(mockMysqlConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO review_notebooks'),
        expect.arrayContaining([
          expect.any(String), // id
          mockUserId,
          'Test Notebook',
          'Test Description',
          'academic',
          false,
          expect.any(Date),
          expect.any(Date)
        ])
      );
    });

    it('should create notebook with default values', async () => {
      const createData: CreateNotebookData = {
        userId: mockUserId,
        title: 'Simple Notebook'
      };

      mockMysqlConnection.executeQuery.mockResolvedValueOnce(undefined);

      const result = await notebookModel.create(createData);

      expect(result.title).toBe('Simple Notebook');
      expect(result.description).toBeUndefined();

      expect(mockMysqlConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO review_notebooks'),
        expect.arrayContaining([
          expect.any(String),
          mockUserId,
          'Simple Notebook',
          null, // description
          'default', // templateType
          false, // isPublic
          expect.any(Date),
          expect.any(Date)
        ])
      );
    });
  });

  describe('findByIdAndUser', () => {
    it('should find notebook by ID and user ID', async () => {
      const mockRow = {
        id: mockNotebookId,
        user_id: mockUserId,
        title: 'Test Notebook',
        description: 'Test Description',
        template_type: 'academic',
        is_public: false,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockMysqlConnection.executeQuery.mockResolvedValueOnce([mockRow]);

      const result = await notebookModel.findByIdAndUser(mockNotebookId, mockUserId);

      expect(result).toMatchObject({
        id: mockNotebookId,
        user_id: mockUserId,
        title: 'Test Notebook',
        description: 'Test Description'
      });

      expect(mockMysqlConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, user_id, title, description'),
        [mockNotebookId, mockUserId]
      );
    });

    it('should return null when notebook not found', async () => {
      mockMysqlConnection.executeQuery.mockResolvedValueOnce([]);

      const result = await notebookModel.findByIdAndUser(mockNotebookId, mockUserId);

      expect(result).toBeNull();
    });
  });

  describe('findByUser', () => {
    it('should find notebooks by user with pagination', async () => {
      const mockCountResult = [{ total: 5 }];
      const mockNotebooks = [
        {
          id: uuidv4(),
          user_id: mockUserId,
          title: 'Notebook 1',
          description: 'Description 1',
          template_type: 'default',
          is_public: false,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: uuidv4(),
          user_id: mockUserId,
          title: 'Notebook 2',
          description: 'Description 2',
          template_type: 'academic',
          is_public: true,
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      mockMysqlConnection.executeQuery
        .mockResolvedValueOnce(mockCountResult)
        .mockResolvedValueOnce(mockNotebooks);

      const result = await notebookModel.findByUser(mockUserId, {
        limit: 10,
        offset: 0
      });

      expect(result.total).toBe(5);
      expect(result.notebooks).toHaveLength(2);
      expect(result.notebooks[0].title).toBe('Notebook 1');
      expect(result.notebooks[1].title).toBe('Notebook 2');

      expect(mockMysqlConnection.executeQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe('update', () => {
    it('should update notebook successfully', async () => {
      const updateData: UpdateNotebookData = {
        title: 'Updated Title',
        description: 'Updated Description'
      };

      const mockResult = { affectedRows: 1 };
      mockMysqlConnection.executeQuery.mockResolvedValueOnce(mockResult);

      const result = await notebookModel.update(mockNotebookId, mockUserId, updateData);

      expect(result).toBe(true);

      expect(mockMysqlConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE review_notebooks'),
        ['Updated Title', 'Updated Description', mockNotebookId, mockUserId]
      );
    });

    it('should return false when no rows affected', async () => {
      const updateData: UpdateNotebookData = {
        title: 'Updated Title'
      };

      const mockResult = { affectedRows: 0 };
      mockMysqlConnection.executeQuery.mockResolvedValueOnce(mockResult);

      const result = await notebookModel.update(mockNotebookId, mockUserId, updateData);

      expect(result).toBe(false);
    });

    it('should return false when no update data provided', async () => {
      const result = await notebookModel.update(mockNotebookId, mockUserId, {});

      expect(result).toBe(false);
      expect(mockMysqlConnection.executeQuery).not.toHaveBeenCalled();
    });
  });

  describe('deleteByIdAndUser', () => {
    it('should delete notebook and composition items', async () => {
      const mockConnection = {
        execute: jest.fn()
          .mockResolvedValueOnce([{ affectedRows: 2 }]) // Delete composition items
          .mockResolvedValueOnce([{ affectedRows: 1 }]) // Delete notebook
      };

      mockMysqlConnection.executeTransaction.mockImplementation(async (callback) => {
        return await callback(mockConnection as any);
      });

      const result = await notebookModel.deleteByIdAndUser(mockNotebookId, mockUserId);

      expect(result).toBe(true);
      expect(mockConnection.execute).toHaveBeenCalledTimes(2);
      expect(mockConnection.execute).toHaveBeenNthCalledWith(1,
        'DELETE FROM notebook_composition WHERE notebook_id = ?',
        [mockNotebookId]
      );
      expect(mockConnection.execute).toHaveBeenNthCalledWith(2,
        'DELETE FROM review_notebooks WHERE id = ? AND user_id = ?',
        [mockNotebookId, mockUserId]
      );
    });
  });

  describe('addCompositionItem', () => {
    it('should add composition item successfully', async () => {
      const mockNotebook = {
        id: mockNotebookId,
        user_id: mockUserId,
        title: 'Test Notebook',
        description: 'Test Description',
        created_at: new Date(),
        updated_at: new Date()
      };

      const item: NotebookCompositionItem = {
        elementType: 'knowledge_element',
        elementId: 'element-123',
        orderIndex: 0,
        sectionTitle: 'Section 1'
      };

      // Mock findByIdAndUser
      mockMysqlConnection.executeQuery
        .mockResolvedValueOnce([mockNotebook]) // findByIdAndUser
        .mockResolvedValueOnce(undefined); // insert

      const result = await notebookModel.addCompositionItem(mockNotebookId, mockUserId, item);

      expect(result).toMatchObject({
        notebook_id: mockNotebookId,
        element_type: 'knowledge_element',
        element_id: 'element-123',
        order_index: 0
      });
      expect(result?.id).toBeDefined();

      expect(mockMysqlConnection.executeQuery).toHaveBeenCalledTimes(2);
    });

    it('should return null when notebook not found', async () => {
      const item: NotebookCompositionItem = {
        elementType: 'annotation',
        elementId: 'annotation-123',
        orderIndex: 1
      };

      mockMysqlConnection.executeQuery.mockResolvedValueOnce([]); // findByIdAndUser returns empty

      const result = await notebookModel.addCompositionItem(mockNotebookId, mockUserId, item);

      expect(result).toBeNull();
      expect(mockMysqlConnection.executeQuery).toHaveBeenCalledTimes(1);
    });
  });

  describe('getComposition', () => {
    it('should get composition items ordered by index', async () => {
      const mockNotebook = {
        id: mockNotebookId,
        user_id: mockUserId,
        title: 'Test Notebook',
        description: 'Test Description',
        created_at: new Date(),
        updated_at: new Date()
      };

      const mockComposition = [
        {
          id: uuidv4(),
          notebook_id: mockNotebookId,
          element_type: 'knowledge_element',
          element_id: 'element-1',
          order_index: 0,
          section_title: 'Section 1',
          custom_content: null,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: uuidv4(),
          notebook_id: mockNotebookId,
          element_type: 'annotation',
          element_id: 'annotation-1',
          order_index: 1,
          section_title: 'Section 2',
          custom_content: 'Custom content',
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      mockMysqlConnection.executeQuery
        .mockResolvedValueOnce([mockNotebook]) // findByIdAndUser
        .mockResolvedValueOnce(mockComposition); // get composition

      const result = await notebookModel.getComposition(mockNotebookId, mockUserId);

      expect(result).toHaveLength(2);
      expect(result[0].element_type).toBe('knowledge_element');
      expect(result[0].order_index).toBe(0);
      expect(result[1].element_type).toBe('annotation');
      expect(result[1].order_index).toBe(1);

      expect(mockMysqlConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY order_index ASC'),
        [mockNotebookId]
      );
    });

    it('should return empty array when notebook not found', async () => {
      mockMysqlConnection.executeQuery.mockResolvedValueOnce([]); // findByIdAndUser returns empty

      const result = await notebookModel.getComposition(mockNotebookId, mockUserId);

      expect(result).toEqual([]);
      expect(mockMysqlConnection.executeQuery).toHaveBeenCalledTimes(1);
    });
  });

  describe('searchByTitle', () => {
    it('should search notebooks by title', async () => {
      const mockCountResult = [{ total: 2 }];
      const mockNotebooks = [
        {
          id: uuidv4(),
          user_id: mockUserId,
          title: 'Math Study Guide',
          description: 'Mathematics notes',
          template_type: 'study_guide',
          is_public: false,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: uuidv4(),
          user_id: 'other-user',
          title: 'Math Research',
          description: 'Public math research',
          template_type: 'research',
          is_public: true,
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      mockMysqlConnection.executeQuery
        .mockResolvedValueOnce(mockCountResult)
        .mockResolvedValueOnce(mockNotebooks);

      const result = await notebookModel.searchByTitle(mockUserId, 'Math', {
        includePublic: true,
        limit: 10
      });

      expect(result.total).toBe(2);
      expect(result.notebooks).toHaveLength(2);
      expect(result.notebooks[0].title).toBe('Math Study Guide');
      expect(result.notebooks[1].title).toBe('Math Research');

      expect(mockMysqlConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('title LIKE'),
        expect.arrayContaining([mockUserId, '%Math%', '%Math%', mockUserId, 10])
      );
    });
  });

  describe('getStatsByUser', () => {
    it('should return user notebook statistics', async () => {
      const mockStats = [{
        total_notebooks: 5,
        total_elements: 25,
        recent_activity: new Date('2023-12-01')
      }];

      mockMysqlConnection.executeQuery.mockResolvedValueOnce(mockStats);

      const result = await notebookModel.getStatsByUser(mockUserId);

      expect(result).toEqual({
        total: 5,
        totalElements: 25,
        averageElementsPerNotebook: 5,
        recentActivity: new Date('2023-12-01')
      });

      expect(mockMysqlConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('COUNT(DISTINCT rn.id)'),
        [mockUserId]
      );
    });

    it('should handle zero notebooks', async () => {
      const mockStats = [{
        total_notebooks: 0,
        total_elements: 0,
        recent_activity: null
      }];

      mockMysqlConnection.executeQuery.mockResolvedValueOnce(mockStats);

      const result = await notebookModel.getStatsByUser(mockUserId);

      expect(result).toEqual({
        total: 0,
        totalElements: 0,
        averageElementsPerNotebook: 0,
        recentActivity: null
      });
    });
  });

  describe('duplicate', () => {
    it('should duplicate notebook with composition', async () => {
      const originalNotebook = {
        id: mockNotebookId,
        user_id: mockUserId,
        title: 'Original Notebook',
        description: 'Original Description',
        created_at: new Date(),
        updated_at: new Date()
      };

      const mockConnection = {
        execute: jest.fn()
          .mockResolvedValueOnce([{ insertId: 1 }]) // Insert new notebook
          .mockResolvedValueOnce([{ affectedRows: 2 }]) // Copy composition
      };

      mockMysqlConnection.executeQuery.mockResolvedValueOnce([originalNotebook]); // findByIdAndUser
      mockMysqlConnection.executeTransaction.mockImplementation(async (callback) => {
        return await callback(mockConnection as any);
      });

      const result = await notebookModel.duplicate(mockNotebookId, mockUserId, 'Duplicated Notebook');

      expect(result).toMatchObject({
        user_id: mockUserId,
        title: 'Duplicated Notebook',
        description: 'Original Description'
      });
      expect(result?.id).toBeDefined();
      expect(result?.id).not.toBe(mockNotebookId);

      expect(mockConnection.execute).toHaveBeenCalledTimes(2);
    });

    it('should return null when original notebook not found', async () => {
      mockMysqlConnection.executeQuery.mockResolvedValueOnce([]); // findByIdAndUser returns empty

      const result = await notebookModel.duplicate(mockNotebookId, mockUserId, 'New Title');

      expect(result).toBeNull();
      expect(mockMysqlConnection.executeTransaction).not.toHaveBeenCalled();
    });
  });
});