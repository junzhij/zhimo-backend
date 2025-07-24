import { synthesisAgent, SynthesisAgent } from '../index';
import { notebookModel } from '../../../models/notebookModel';
import { annotationModel } from '../../../models/annotationModel';
import { mongoConnection } from '../../../database/mongodb';
import { v4 as uuidv4 } from 'uuid';

// Mock dependencies
jest.mock('../../../models/notebookModel');
jest.mock('../../../models/annotationModel');
jest.mock('../../../database/mongodb');
jest.mock('../../../utils/logger');

const mockNotebookModel = notebookModel as jest.Mocked<typeof notebookModel>;
const mockAnnotationModel = annotationModel as jest.Mocked<typeof annotationModel>;
const mockMongoConnection = mongoConnection as jest.Mocked<typeof mongoConnection>;

describe('SynthesisAgent', () => {
  const mockUserId = uuidv4();
  const mockNotebookId = uuidv4();
  const mockElementId = uuidv4();
  const mockAnnotationId = uuidv4();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('compileNotebook', () => {
    it('should compile notebook with knowledge elements and annotations', async () => {
      const mockNotebookWithComposition = {
        id: mockNotebookId,
        user_id: mockUserId,
        title: 'Test Notebook',
        description: 'Test Description',
        created_at: new Date(),
        updated_at: new Date(),
        composition: [
          {
            id: uuidv4(),
            notebook_id: mockNotebookId,
            element_type: 'knowledge_element' as const,
            element_id: mockElementId,
            order_index: 0,
            section_title: 'Summary Section',
            custom_content: null
          },
          {
            id: uuidv4(),
            notebook_id: mockNotebookId,
            element_type: 'annotation' as const,
            element_id: mockAnnotationId,
            order_index: 1,
            section_title: 'My Notes',
            custom_content: 'Additional context'
          }
        ]
      };

      const mockKnowledgeElement = {
        _id: mockElementId,
        document_id: 'doc-123',
        agent_type: 'analysis',
        element_type: 'summary',
        content: {
          title: 'Document Summary',
          body: 'This is a comprehensive summary of the document content.'
        },
        source_location: {
          section: 'Introduction',
          page: 1
        },
        created_at: new Date(),
        tags: ['summary', 'analysis']
      };

      const mockAnnotation = {
        id: mockAnnotationId,
        user_id: mockUserId,
        document_id: 'doc-123',
        annotation_type: 'note' as const,
        content: 'This is an important point to remember.',
        position_data: { page: 2, position: { x: 100, y: 200 } },
        created_at: new Date(),
        updated_at: new Date()
      };

      const mockDb = {
        collection: jest.fn().mockReturnValue({
          findOne: jest.fn().mockResolvedValueOnce(mockKnowledgeElement)
        })
      };

      mockNotebookModel.getNotebookWithComposition.mockResolvedValueOnce(mockNotebookWithComposition);
      mockMongoConnection.getDb.mockReturnValueOnce(mockDb as any);
      mockAnnotationModel.findByIdAndUser.mockResolvedValueOnce(mockAnnotation);

      const result = await synthesisAgent.compileNotebook(mockNotebookId, mockUserId);

      expect(result).toBeDefined();
      expect(result?.title).toBe('Test Notebook');
      expect(result?.description).toBe('Test Description');
      expect(result?.sections).toHaveLength(2);
      expect(result?.metadata.totalElements).toBe(2);
      expect(result?.metadata.userId).toBe(mockUserId);
      expect(result?.metadata.notebookId).toBe(mockNotebookId);

      // Check first section (knowledge element)
      const firstSection = result?.sections[0];
      expect(firstSection?.title).toBe('Summary Section');
      expect(firstSection?.content).toContain('This is a comprehensive summary');
      expect(firstSection?.elementType).toBe('knowledge_element');
      expect(firstSection?.orderIndex).toBe(0);

      // Check second section (annotation)
      const secondSection = result?.sections[1];
      expect(secondSection?.title).toBe('My Notes');
      expect(secondSection?.content).toContain('Additional context');
      expect(secondSection?.content).toContain('This is an important point');
      expect(secondSection?.elementType).toBe('annotation');
      expect(secondSection?.orderIndex).toBe(1);

      expect(mockNotebookModel.getNotebookWithComposition).toHaveBeenCalledWith(mockNotebookId, mockUserId);
    });

    it('should return null when notebook not found', async () => {
      mockNotebookModel.getNotebookWithComposition.mockResolvedValueOnce(null);

      const result = await synthesisAgent.compileNotebook(mockNotebookId, mockUserId);

      expect(result).toBeNull();
    });

    it('should handle empty composition', async () => {
      const mockNotebookWithComposition = {
        id: mockNotebookId,
        user_id: mockUserId,
        title: 'Empty Notebook',
        description: 'No content',
        created_at: new Date(),
        updated_at: new Date(),
        composition: []
      };

      mockNotebookModel.getNotebookWithComposition.mockResolvedValueOnce(mockNotebookWithComposition);

      const result = await synthesisAgent.compileNotebook(mockNotebookId, mockUserId);

      expect(result).toBeDefined();
      expect(result?.sections).toHaveLength(0);
      expect(result?.metadata.totalElements).toBe(0);
    });

    it('should skip sections when elements are not found', async () => {
      const mockNotebookWithComposition = {
        id: mockNotebookId,
        user_id: mockUserId,
        title: 'Test Notebook',
        description: 'Test Description',
        created_at: new Date(),
        updated_at: new Date(),
        composition: [
          {
            id: uuidv4(),
            notebook_id: mockNotebookId,
            element_type: 'knowledge_element' as const,
            element_id: 'nonexistent-element',
            order_index: 0,
            section_title: null,
            custom_content: null
          },
          {
            id: uuidv4(),
            notebook_id: mockNotebookId,
            element_type: 'annotation' as const,
            element_id: 'nonexistent-annotation',
            order_index: 1,
            section_title: null,
            custom_content: null
          }
        ]
      };

      const mockDb = {
        collection: jest.fn().mockReturnValue({
          findOne: jest.fn().mockResolvedValueOnce(null)
        })
      };

      mockNotebookModel.getNotebookWithComposition.mockResolvedValueOnce(mockNotebookWithComposition);
      mockMongoConnection.getDb.mockReturnValueOnce(mockDb as any);
      mockAnnotationModel.findByIdAndUser.mockResolvedValueOnce(null);

      const result = await synthesisAgent.compileNotebook(mockNotebookId, mockUserId);

      expect(result).toBeDefined();
      expect(result?.sections).toHaveLength(0);
      expect(result?.metadata.totalElements).toBe(0);
    });
  });

  describe('generateFormattedText', () => {
    it('should generate formatted text with default options', () => {
      const mockCompiledContent = {
        title: 'Test Notebook',
        description: 'Test Description',
        sections: [
          {
            title: 'Section 1',
            content: 'Content of section 1',
            elementType: 'knowledge_element' as const,
            sourceId: 'element-1',
            orderIndex: 0
          },
          {
            title: 'Section 2',
            content: 'Content of section 2',
            elementType: 'annotation' as const,
            sourceId: 'annotation-1',
            orderIndex: 1
          }
        ],
        metadata: {
          totalElements: 2,
          compiledAt: new Date(),
          userId: mockUserId,
          notebookId: mockNotebookId
        }
      };

      const result = synthesisAgent.generateFormattedText(mockCompiledContent);

      expect(result).toContain('# Test Notebook');
      expect(result).toContain('Test Description');
      expect(result).toContain('## Section 1');
      expect(result).toContain('Content of section 1');
      expect(result).toContain('## Section 2');
      expect(result).toContain('Content of section 2');
      expect(result).toContain('---'); // Section separator
    });

    it('should generate formatted text without metadata', () => {
      const mockCompiledContent = {
        title: 'Test Notebook',
        sections: [
          {
            title: 'Section 1',
            content: 'Content of section 1',
            elementType: 'knowledge_element' as const,
            sourceId: 'element-1',
            orderIndex: 0
          }
        ],
        metadata: {
          totalElements: 1,
          compiledAt: new Date(),
          userId: mockUserId,
          notebookId: mockNotebookId
        }
      };

      const result = synthesisAgent.generateFormattedText(mockCompiledContent, {
        includeMetadata: false
      });

      expect(result).toContain('# Test Notebook');
      expect(result).toContain('## Section 1');
      expect(result).not.toContain('Compiled on');
    });

    it('should use custom section separator', () => {
      const mockCompiledContent = {
        title: 'Test Notebook',
        sections: [
          {
            title: 'Section 1',
            content: 'Content 1',
            elementType: 'knowledge_element' as const,
            sourceId: 'element-1',
            orderIndex: 0
          },
          {
            title: 'Section 2',
            content: 'Content 2',
            elementType: 'annotation' as const,
            sourceId: 'annotation-1',
            orderIndex: 1
          }
        ],
        metadata: {
          totalElements: 2,
          compiledAt: new Date(),
          userId: mockUserId,
          notebookId: mockNotebookId
        }
      };

      const result = synthesisAgent.generateFormattedText(mockCompiledContent, {
        sectionSeparator: '\n\n***\n\n'
      });

      expect(result).toContain('***');
      expect(result).not.toContain('---');
    });
  });

  describe('getCompilationStats', () => {
    it('should return compilation statistics', async () => {
      const mockNotebookWithComposition = {
        id: mockNotebookId,
        user_id: mockUserId,
        title: 'Test Notebook',
        description: 'Test Description',
        created_at: new Date(),
        updated_at: new Date('2023-12-01'),
        composition: [
          {
            id: uuidv4(),
            notebook_id: mockNotebookId,
            element_type: 'knowledge_element' as const,
            element_id: mockElementId,
            order_index: 0
          },
          {
            id: uuidv4(),
            notebook_id: mockNotebookId,
            element_type: 'knowledge_element' as const,
            element_id: uuidv4(),
            order_index: 1
          },
          {
            id: uuidv4(),
            notebook_id: mockNotebookId,
            element_type: 'annotation' as const,
            element_id: mockAnnotationId,
            order_index: 2
          }
        ]
      };

      mockNotebookModel.getNotebookWithComposition.mockResolvedValueOnce(mockNotebookWithComposition);

      const result = await synthesisAgent.getCompilationStats(mockNotebookId, mockUserId);

      expect(result).toBeDefined();
      expect(result?.totalElements).toBe(3);
      expect(result?.elementTypes).toEqual({
        knowledge_element: 2,
        annotation: 1
      });
      expect(result?.lastCompiled).toEqual(new Date('2023-12-01'));
    });

    it('should return null when notebook not found', async () => {
      mockNotebookModel.getNotebookWithComposition.mockResolvedValueOnce(null);

      const result = await synthesisAgent.getCompilationStats(mockNotebookId, mockUserId);

      expect(result).toBeNull();
    });

    it('should handle empty composition in stats', async () => {
      const mockNotebookWithComposition = {
        id: mockNotebookId,
        user_id: mockUserId,
        title: 'Empty Notebook',
        description: 'No content',
        created_at: new Date(),
        updated_at: new Date('2023-12-01'),
        composition: []
      };

      mockNotebookModel.getNotebookWithComposition.mockResolvedValueOnce(mockNotebookWithComposition);

      const result = await synthesisAgent.getCompilationStats(mockNotebookId, mockUserId);

      expect(result).toBeDefined();
      expect(result?.totalElements).toBe(0);
      expect(result?.elementTypes).toEqual({});
    });
  });

  describe('formatting styles', () => {
    it('should format content in academic style', () => {
      const agent = new SynthesisAgent();
      
      // Test private method through compilation
      const mockCompiledContent = {
        title: 'Academic Paper',
        sections: [
          {
            title: 'Definition',
            content: 'Machine learning is a subset of artificial intelligence.',
            elementType: 'knowledge_element' as const,
            sourceId: 'element-1',
            orderIndex: 0,
            metadata: { elementType: 'definition' }
          }
        ],
        metadata: {
          totalElements: 1,
          compiledAt: new Date(),
          userId: mockUserId,
          notebookId: mockNotebookId
        }
      };

      const result = synthesisAgent.generateFormattedText(mockCompiledContent, {
        formatStyle: 'academic'
      });

      expect(result).toContain('# Academic Paper');
      expect(result).toContain('## Definition');
    });

    it('should format content in casual style', () => {
      const mockCompiledContent = {
        title: 'Study Notes',
        sections: [
          {
            title: 'Concept',
            content: 'This is an important concept to understand.',
            elementType: 'knowledge_element' as const,
            sourceId: 'element-1',
            orderIndex: 0,
            metadata: { elementType: 'concept' }
          }
        ],
        metadata: {
          totalElements: 1,
          compiledAt: new Date(),
          userId: mockUserId,
          notebookId: mockNotebookId
        }
      };

      const result = synthesisAgent.generateFormattedText(mockCompiledContent, {
        formatStyle: 'casual'
      });

      expect(result).toContain('# Study Notes');
      expect(result).toContain('## Concept');
    });
  });
});