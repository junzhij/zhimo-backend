import { Request, Response } from 'express';
import { notebookController } from '../notebookController';
import { notebookModel } from '../../models/notebookModel';
import { annotationModel } from '../../models/annotationModel';
import { mongoConnection } from '../../database/mongodb';
import { v4 as uuidv4 } from 'uuid';
import { User } from '../../models/userModel';

// Extend Request interface to include user property
declare global {
    namespace Express {
        interface Request {
            user?: User;
        }
    }
}

// Mock synthesis agent
const mockSynthesisAgent = {
    compileNotebook: jest.fn(),
    generateFormattedText: jest.fn(),
    getCompilationStats: jest.fn(),
    exportToPDF: jest.fn()
};

jest.mock('../../agents/synthesis', () => ({
    synthesisAgent: mockSynthesisAgent
}));

// Mock dependencies
jest.mock('../../models/notebookModel');
jest.mock('../../models/annotationModel');
jest.mock('../../database/mongodb');

const mockNotebookModel = notebookModel as jest.Mocked<typeof notebookModel>;
const mockAnnotationModel = annotationModel as jest.Mocked<typeof annotationModel>;
const mockMongoConnection = mongoConnection as jest.Mocked<typeof mongoConnection>;

describe('NotebookController', () => {
    let mockRequest: Partial<Request>;
    let mockResponse: Partial<Response>;
    let mockJson: jest.Mock;
    let mockStatus: jest.Mock;

    const mockUserId = uuidv4();
    const mockNotebookId = uuidv4();

    beforeEach(() => {
        mockJson = jest.fn();
        mockStatus = jest.fn().mockReturnValue({ json: mockJson });

        mockRequest = {
            user: {
                id: mockUserId,
                email: 'test@example.com',
                password_hash: 'hashed-password',
                first_name: 'Test',
                last_name: 'User',
                role: 'user' as const,
                is_active: true,
                email_verified: false,
                created_at: new Date(),
                updated_at: new Date()
            },
            params: {},
            body: {},
            query: {}
        };

        mockResponse = {
            json: mockJson,
            status: mockStatus
        };

        jest.clearAllMocks();

        // Reset synthesis agent mocks
        mockSynthesisAgent.compileNotebook.mockReset();
        mockSynthesisAgent.generateFormattedText.mockReset();
        mockSynthesisAgent.getCompilationStats.mockReset();
    });

    describe('createNotebook', () => {
        it('should create notebook successfully', async () => {
            const mockNotebook = {
                id: mockNotebookId,
                user_id: mockUserId,
                title: 'Test Notebook',
                description: 'Test Description',
                created_at: new Date(),
                updated_at: new Date()
            };

            mockRequest.body = {
                title: 'Test Notebook',
                description: 'Test Description',
                templateType: 'academic',
                isPublic: false
            };

            mockNotebookModel.create.mockResolvedValueOnce(mockNotebook);

            await notebookController.createNotebook(mockRequest as Request, mockResponse as Response);

            expect(mockNotebookModel.create).toHaveBeenCalledWith({
                userId: mockUserId,
                title: 'Test Notebook',
                description: 'Test Description',
                templateType: 'academic',
                isPublic: false
            });

            expect(mockStatus).toHaveBeenCalledWith(201);
            expect(mockJson).toHaveBeenCalledWith({
                success: true,
                data: mockNotebook
            });
        });

        it('should return 401 when user not authenticated', async () => {
            mockRequest.user = undefined;

            await notebookController.createNotebook(mockRequest as Request, mockResponse as Response);

            expect(mockStatus).toHaveBeenCalledWith(401);
            expect(mockJson).toHaveBeenCalledWith({ error: 'User not authenticated' });
            expect(mockNotebookModel.create).not.toHaveBeenCalled();
        });

        it('should return 400 when title is missing', async () => {
            mockRequest.body = { description: 'Test Description' };

            await notebookController.createNotebook(mockRequest as Request, mockResponse as Response);

            expect(mockStatus).toHaveBeenCalledWith(400);
            expect(mockJson).toHaveBeenCalledWith({ error: 'Title is required' });
            expect(mockNotebookModel.create).not.toHaveBeenCalled();
        });

        it('should return 400 when title is empty', async () => {
            mockRequest.body = { title: '   ' };

            await notebookController.createNotebook(mockRequest as Request, mockResponse as Response);

            expect(mockStatus).toHaveBeenCalledWith(400);
            expect(mockJson).toHaveBeenCalledWith({ error: 'Title is required' });
            expect(mockNotebookModel.create).not.toHaveBeenCalled();
        });

        it('should handle database errors', async () => {
            mockRequest.body = { title: 'Test Notebook' };
            mockNotebookModel.create.mockRejectedValueOnce(new Error('Database error'));

            await notebookController.createNotebook(mockRequest as Request, mockResponse as Response);

            expect(mockStatus).toHaveBeenCalledWith(500);
            expect(mockJson).toHaveBeenCalledWith({ error: 'Failed to create notebook' });
        });
    });

    describe('getNotebook', () => {
        it('should get notebook successfully', async () => {
            const mockNotebook = {
                id: mockNotebookId,
                user_id: mockUserId,
                title: 'Test Notebook',
                description: 'Test Description',
                created_at: new Date(),
                updated_at: new Date()
            };

            mockRequest.params = { id: mockNotebookId };
            mockNotebookModel.findByIdAndUser.mockResolvedValueOnce(mockNotebook);

            await notebookController.getNotebook(mockRequest as Request, mockResponse as Response);

            expect(mockNotebookModel.findByIdAndUser).toHaveBeenCalledWith(mockNotebookId, mockUserId);
            expect(mockJson).toHaveBeenCalledWith({
                success: true,
                data: mockNotebook
            });
        });

        it('should return 404 when notebook not found', async () => {
            mockRequest.params = { id: mockNotebookId };
            mockNotebookModel.findByIdAndUser.mockResolvedValueOnce(null);

            await notebookController.getNotebook(mockRequest as Request, mockResponse as Response);

            expect(mockStatus).toHaveBeenCalledWith(404);
            expect(mockJson).toHaveBeenCalledWith({ error: 'Notebook not found' });
        });
    });

    describe('getUserNotebooks', () => {
        it('should get user notebooks with pagination', async () => {
            const mockNotebooks = [
                {
                    id: uuidv4(),
                    user_id: mockUserId,
                    title: 'Notebook 1',
                    description: 'Description 1',
                    created_at: new Date(),
                    updated_at: new Date()
                },
                {
                    id: uuidv4(),
                    user_id: mockUserId,
                    title: 'Notebook 2',
                    description: 'Description 2',
                    created_at: new Date(),
                    updated_at: new Date()
                }
            ];

            mockRequest.query = { limit: '10', offset: '0' };
            mockNotebookModel.findByUser.mockResolvedValueOnce({
                notebooks: mockNotebooks,
                total: 2
            });

            await notebookController.getUserNotebooks(mockRequest as Request, mockResponse as Response);

            expect(mockNotebookModel.findByUser).toHaveBeenCalledWith(mockUserId, {
                limit: 10,
                offset: 0,
                includePublic: false
            });

            expect(mockJson).toHaveBeenCalledWith({
                success: true,
                data: mockNotebooks,
                pagination: {
                    total: 2,
                    limit: 10,
                    offset: 0
                }
            });
        });

        it('should handle includePublic parameter', async () => {
            mockRequest.query = { includePublic: 'true' };
            mockNotebookModel.findByUser.mockResolvedValueOnce({
                notebooks: [],
                total: 0
            });

            await notebookController.getUserNotebooks(mockRequest as Request, mockResponse as Response);

            expect(mockNotebookModel.findByUser).toHaveBeenCalledWith(mockUserId, {
                limit: 20,
                offset: 0,
                includePublic: true
            });
        });
    });

    describe('updateNotebook', () => {
        it('should update notebook successfully', async () => {
            const updatedNotebook = {
                id: mockNotebookId,
                user_id: mockUserId,
                title: 'Updated Title',
                description: 'Updated Description',
                created_at: new Date(),
                updated_at: new Date()
            };

            mockRequest.params = { id: mockNotebookId };
            mockRequest.body = {
                title: 'Updated Title',
                description: 'Updated Description'
            };

            mockNotebookModel.update.mockResolvedValueOnce(true);
            mockNotebookModel.findByIdAndUser.mockResolvedValueOnce(updatedNotebook);

            await notebookController.updateNotebook(mockRequest as Request, mockResponse as Response);

            expect(mockNotebookModel.update).toHaveBeenCalledWith(mockNotebookId, mockUserId, {
                title: 'Updated Title',
                description: 'Updated Description'
            });

            expect(mockJson).toHaveBeenCalledWith({
                success: true,
                data: updatedNotebook
            });
        });

        it('should return 400 when title is empty', async () => {
            mockRequest.params = { id: mockNotebookId };
            mockRequest.body = { title: '   ' };

            await notebookController.updateNotebook(mockRequest as Request, mockResponse as Response);

            expect(mockStatus).toHaveBeenCalledWith(400);
            expect(mockJson).toHaveBeenCalledWith({ error: 'Title cannot be empty' });
            expect(mockNotebookModel.update).not.toHaveBeenCalled();
        });

        it('should return 404 when notebook not found', async () => {
            mockRequest.params = { id: mockNotebookId };
            mockRequest.body = { title: 'Updated Title' };

            mockNotebookModel.update.mockResolvedValueOnce(false);

            await notebookController.updateNotebook(mockRequest as Request, mockResponse as Response);

            expect(mockStatus).toHaveBeenCalledWith(404);
            expect(mockJson).toHaveBeenCalledWith({ error: 'Notebook not found or no changes made' });
        });
    });

    describe('deleteNotebook', () => {
        it('should delete notebook successfully', async () => {
            mockRequest.params = { id: mockNotebookId };
            mockNotebookModel.deleteByIdAndUser.mockResolvedValueOnce(true);

            await notebookController.deleteNotebook(mockRequest as Request, mockResponse as Response);

            expect(mockNotebookModel.deleteByIdAndUser).toHaveBeenCalledWith(mockNotebookId, mockUserId);
            expect(mockJson).toHaveBeenCalledWith({
                success: true,
                message: 'Notebook deleted successfully'
            });
        });

        it('should return 404 when notebook not found', async () => {
            mockRequest.params = { id: mockNotebookId };
            mockNotebookModel.deleteByIdAndUser.mockResolvedValueOnce(false);

            await notebookController.deleteNotebook(mockRequest as Request, mockResponse as Response);

            expect(mockStatus).toHaveBeenCalledWith(404);
            expect(mockJson).toHaveBeenCalledWith({ error: 'Notebook not found' });
        });
    });

    describe('addCompositionItem', () => {
        it('should add annotation composition item successfully', async () => {
            const mockAnnotation = {
                id: 'annotation-123',
                user_id: mockUserId,
                document_id: 'doc-123',
                annotation_type: 'highlight' as const,
                content: 'Test annotation',
                position_data: { page: 1 },
                created_at: new Date(),
                updated_at: new Date()
            };

            const mockCompositionItem = {
                id: uuidv4(),
                notebook_id: mockNotebookId,
                element_type: 'annotation' as const,
                element_id: 'annotation-123',
                order_index: 0
            };

            mockRequest.params = { id: mockNotebookId };
            mockRequest.body = {
                elementType: 'annotation',
                elementId: 'annotation-123',
                orderIndex: 0,
                sectionTitle: 'Section 1'
            };

            mockAnnotationModel.findByIdAndUser.mockResolvedValueOnce(mockAnnotation);
            mockNotebookModel.addCompositionItem.mockResolvedValueOnce(mockCompositionItem);

            await notebookController.addCompositionItem(mockRequest as Request, mockResponse as Response);

            expect(mockAnnotationModel.findByIdAndUser).toHaveBeenCalledWith('annotation-123', mockUserId);
            expect(mockNotebookModel.addCompositionItem).toHaveBeenCalledWith(mockNotebookId, mockUserId, {
                elementType: 'annotation',
                elementId: 'annotation-123',
                orderIndex: 0,
                sectionTitle: 'Section 1',
                customContent: undefined
            });

            expect(mockStatus).toHaveBeenCalledWith(201);
            expect(mockJson).toHaveBeenCalledWith({
                success: true,
                data: mockCompositionItem
            });
        });

        it('should add knowledge element composition item successfully', async () => {
            const mockKnowledgeElement = {
                _id: 'element-123',
                document_id: 'doc-123',
                agent_type: 'analysis',
                element_type: 'summary',
                content: { title: 'Test', body: 'Content' },
                source_location: { section: 'intro' },
                created_at: new Date(),
                tags: []
            };

            const mockCompositionItem = {
                id: uuidv4(),
                notebook_id: mockNotebookId,
                element_type: 'knowledge_element' as const,
                element_id: 'element-123',
                order_index: 1
            };

            mockRequest.params = { id: mockNotebookId };
            mockRequest.body = {
                elementType: 'knowledge_element',
                elementId: 'element-123',
                orderIndex: 1
            };

            const mockDb = {
                collection: jest.fn().mockReturnValue({
                    findOne: jest.fn().mockResolvedValueOnce(mockKnowledgeElement)
                })
            };

            mockMongoConnection.getDb.mockReturnValueOnce(mockDb as any);
            mockNotebookModel.addCompositionItem.mockResolvedValueOnce(mockCompositionItem);

            await notebookController.addCompositionItem(mockRequest as Request, mockResponse as Response);

            expect(mockDb.collection).toHaveBeenCalledWith('knowledge_elements');
            expect(mockNotebookModel.addCompositionItem).toHaveBeenCalledWith(mockNotebookId, mockUserId, {
                elementType: 'knowledge_element',
                elementId: 'element-123',
                orderIndex: 1,
                sectionTitle: undefined,
                customContent: undefined
            });

            expect(mockStatus).toHaveBeenCalledWith(201);
        });

        it('should return 400 for invalid element type', async () => {
            mockRequest.params = { id: mockNotebookId };
            mockRequest.body = {
                elementType: 'invalid_type',
                elementId: 'element-123',
                orderIndex: 0
            };

            await notebookController.addCompositionItem(mockRequest as Request, mockResponse as Response);

            expect(mockStatus).toHaveBeenCalledWith(400);
            expect(mockJson).toHaveBeenCalledWith({
                error: 'elementType must be either "knowledge_element" or "annotation"'
            });
        });

        it('should return 404 when annotation not found', async () => {
            mockRequest.params = { id: mockNotebookId };
            mockRequest.body = {
                elementType: 'annotation',
                elementId: 'nonexistent-annotation',
                orderIndex: 0
            };

            mockAnnotationModel.findByIdAndUser.mockResolvedValueOnce(null);

            await notebookController.addCompositionItem(mockRequest as Request, mockResponse as Response);

            expect(mockStatus).toHaveBeenCalledWith(404);
            expect(mockJson).toHaveBeenCalledWith({ error: 'Annotation not found' });
        });

        it('should return 404 when knowledge element not found', async () => {
            mockRequest.params = { id: mockNotebookId };
            mockRequest.body = {
                elementType: 'knowledge_element',
                elementId: 'nonexistent-element',
                orderIndex: 0
            };

            const mockDb = {
                collection: jest.fn().mockReturnValue({
                    findOne: jest.fn().mockResolvedValueOnce(null)
                })
            };

            mockMongoConnection.getDb.mockReturnValueOnce(mockDb as any);

            await notebookController.addCompositionItem(mockRequest as Request, mockResponse as Response);

            expect(mockStatus).toHaveBeenCalledWith(404);
            expect(mockJson).toHaveBeenCalledWith({ error: 'Knowledge element not found' });
        });
    });

    describe('searchNotebooks', () => {
        it('should search notebooks successfully', async () => {
            const mockNotebooks = [
                {
                    id: uuidv4(),
                    user_id: mockUserId,
                    title: 'Math Study Guide',
                    description: 'Mathematics notes',
                    created_at: new Date(),
                    updated_at: new Date()
                }
            ];

            mockRequest.query = { q: 'Math', limit: '10', offset: '0' };
            mockNotebookModel.searchByTitle.mockResolvedValueOnce({
                notebooks: mockNotebooks,
                total: 1
            });

            await notebookController.searchNotebooks(mockRequest as Request, mockResponse as Response);

            expect(mockNotebookModel.searchByTitle).toHaveBeenCalledWith(mockUserId, 'Math', {
                limit: 10,
                offset: 0,
                includePublic: false
            });

            expect(mockJson).toHaveBeenCalledWith({
                success: true,
                data: mockNotebooks,
                pagination: {
                    total: 1,
                    limit: 10,
                    offset: 0
                }
            });
        });

        it('should return 400 when search term is missing', async () => {
            mockRequest.query = {};

            await notebookController.searchNotebooks(mockRequest as Request, mockResponse as Response);

            expect(mockStatus).toHaveBeenCalledWith(400);
            expect(mockJson).toHaveBeenCalledWith({ error: 'Search term is required' });
        });
    });

    describe('duplicateNotebook', () => {
        it('should duplicate notebook successfully', async () => {
            const mockDuplicatedNotebook = {
                id: uuidv4(),
                user_id: mockUserId,
                title: 'Duplicated Notebook',
                description: 'Original Description',
                created_at: new Date(),
                updated_at: new Date()
            };

            mockRequest.params = { id: mockNotebookId };
            mockRequest.body = { title: 'Duplicated Notebook' };

            mockNotebookModel.duplicate.mockResolvedValueOnce(mockDuplicatedNotebook);

            await notebookController.duplicateNotebook(mockRequest as Request, mockResponse as Response);

            expect(mockNotebookModel.duplicate).toHaveBeenCalledWith(mockNotebookId, mockUserId, 'Duplicated Notebook');

            expect(mockStatus).toHaveBeenCalledWith(201);
            expect(mockJson).toHaveBeenCalledWith({
                success: true,
                data: mockDuplicatedNotebook
            });
        });

        it('should return 400 when title is missing', async () => {
            mockRequest.params = { id: mockNotebookId };
            mockRequest.body = {};

            await notebookController.duplicateNotebook(mockRequest as Request, mockResponse as Response);

            expect(mockStatus).toHaveBeenCalledWith(400);
            expect(mockJson).toHaveBeenCalledWith({ error: 'Title is required for duplicated notebook' });
        });

        it('should return 404 when original notebook not found', async () => {
            mockRequest.params = { id: mockNotebookId };
            mockRequest.body = { title: 'New Title' };

            mockNotebookModel.duplicate.mockResolvedValueOnce(null);

            await notebookController.duplicateNotebook(mockRequest as Request, mockResponse as Response);

            expect(mockStatus).toHaveBeenCalledWith(404);
            expect(mockJson).toHaveBeenCalledWith({ error: 'Notebook not found' });
        });
    });

    describe('compileNotebook', () => {
        it('should compile notebook successfully', async () => {
            const mockCompiledContent = {
                title: 'Test Notebook',
                description: 'Test Description',
                sections: [
                    {
                        title: 'Section 1',
                        content: 'Content 1',
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

            mockRequest.params = { id: mockNotebookId };
            mockRequest.body = {
                formatStyle: 'academic',
                includeSourceReferences: true
            };

            // Setup mock
            mockSynthesisAgent.compileNotebook.mockResolvedValueOnce(mockCompiledContent);

            await notebookController.compileNotebook(mockRequest as Request, mockResponse as Response);

            expect(mockJson).toHaveBeenCalledWith({
                success: true,
                data: mockCompiledContent
            });
        });

        it('should return 404 when notebook not found for compilation', async () => {
            mockRequest.params = { id: mockNotebookId };
            mockRequest.body = {};

            // Setup mock
            mockSynthesisAgent.compileNotebook.mockResolvedValueOnce(null);

            await notebookController.compileNotebook(mockRequest as Request, mockResponse as Response);

            expect(mockStatus).toHaveBeenCalledWith(404);
            expect(mockJson).toHaveBeenCalledWith({ error: 'Notebook not found' });
        });
    });

    describe('generateFormattedText', () => {
        it('should generate formatted text successfully', async () => {
            const mockCompiledContent = {
                title: 'Test Notebook',
                sections: [
                    {
                        title: 'Section 1',
                        content: 'Content 1',
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

            const mockFormattedText = '# Test Notebook\n\n## Section 1\n\nContent 1';

            mockRequest.params = { id: mockNotebookId };
            mockRequest.body = {
                formatStyle: 'structured'
            };

            // Setup mocks
            mockSynthesisAgent.compileNotebook.mockResolvedValueOnce(mockCompiledContent);
            mockSynthesisAgent.generateFormattedText.mockReturnValueOnce(mockFormattedText);

            await notebookController.generateFormattedText(mockRequest as Request, mockResponse as Response);

            expect(mockJson).toHaveBeenCalledWith({
                success: true,
                data: {
                    formattedText: mockFormattedText,
                    metadata: mockCompiledContent.metadata
                }
            });
        });
    });

    describe('getCompilationStats', () => {
        it('should get compilation statistics successfully', async () => {
            const mockStats = {
                totalElements: 5,
                elementTypes: {
                    knowledge_element: 3,
                    annotation: 2
                },
                lastCompiled: new Date('2023-12-01')
            };

            mockRequest.params = { id: mockNotebookId };

            // Setup mock
            mockSynthesisAgent.getCompilationStats.mockResolvedValueOnce(mockStats);

            await notebookController.getCompilationStats(mockRequest as Request, mockResponse as Response);

            expect(mockJson).toHaveBeenCalledWith({
                success: true,
                data: mockStats
            });
        });

        it('should return 404 when notebook not found for stats', async () => {
            mockRequest.params = { id: mockNotebookId };

            // Setup mock
            mockSynthesisAgent.getCompilationStats.mockResolvedValueOnce(null);

            await notebookController.getCompilationStats(mockRequest as Request, mockResponse as Response);

            expect(mockStatus).toHaveBeenCalledWith(404);
            expect(mockJson).toHaveBeenCalledWith({ error: 'Notebook not found' });
        });
    });

    describe('exportToPDF', () => {
        let mockSend: jest.Mock;
        let mockSetHeader: jest.Mock;

        beforeEach(() => {
            mockSend = jest.fn();
            mockSetHeader = jest.fn();
            mockResponse.send = mockSend;
            mockResponse.setHeader = mockSetHeader;
        });

        it('should export notebook to PDF successfully', async () => {
            const mockPDFResult = {
                buffer: Buffer.from('mock-pdf-content'),
                filename: 'Test_Notebook_2023-12-01.pdf',
                metadata: {
                    title: 'Test Notebook',
                    pageCount: 5,
                    generatedAt: new Date(),
                    template: 'academic',
                    fileSize: 1024
                }
            };

            mockRequest.params = { id: mockNotebookId };
            mockRequest.body = {
                template: 'academic',
                pageSize: 'A4',
                orientation: 'portrait',
                includeTableOfContents: true,
                includePageNumbers: true,
                fontSize: 'medium'
            };

            // Setup mock
            mockSynthesisAgent.exportToPDF = jest.fn().mockResolvedValueOnce(mockPDFResult);

            await notebookController.exportToPDF(mockRequest as Request, mockResponse as Response);

            expect(mockSetHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
            expect(mockSetHeader).toHaveBeenCalledWith('Content-Disposition', `attachment; filename="${mockPDFResult.filename}"`);
            expect(mockSetHeader).toHaveBeenCalledWith('Content-Length', mockPDFResult.buffer.length);
            expect(mockSend).toHaveBeenCalledWith(mockPDFResult.buffer);
        });

        it('should return 404 when notebook not found for PDF export', async () => {
            mockRequest.params = { id: mockNotebookId };
            mockRequest.body = {};

            // Setup mock
            mockSynthesisAgent.exportToPDF = jest.fn().mockResolvedValueOnce(null);

            await notebookController.exportToPDF(mockRequest as Request, mockResponse as Response);

            expect(mockStatus).toHaveBeenCalledWith(404);
            expect(mockJson).toHaveBeenCalledWith({ error: 'Notebook not found or failed to generate PDF' });
        });

        it('should return 400 for invalid template', async () => {
            mockRequest.params = { id: mockNotebookId };
            mockRequest.body = {
                template: 'invalid-template'
            };

            await notebookController.exportToPDF(mockRequest as Request, mockResponse as Response);

            expect(mockStatus).toHaveBeenCalledWith(400);
            expect(mockJson).toHaveBeenCalledWith({
                error: 'Invalid template. Must be one of: academic, modern, minimal, report'
            });
        });

        it('should return 400 for invalid page size', async () => {
            mockRequest.params = { id: mockNotebookId };
            mockRequest.body = {
                template: 'academic',
                pageSize: 'invalid-size'
            };

            await notebookController.exportToPDF(mockRequest as Request, mockResponse as Response);

            expect(mockStatus).toHaveBeenCalledWith(400);
            expect(mockJson).toHaveBeenCalledWith({
                error: 'Invalid page size. Must be one of: A4, Letter, Legal'
            });
        });

        it('should return 400 for invalid orientation', async () => {
            mockRequest.params = { id: mockNotebookId };
            mockRequest.body = {
                template: 'academic',
                pageSize: 'A4',
                orientation: 'invalid-orientation'
            };

            await notebookController.exportToPDF(mockRequest as Request, mockResponse as Response);

            expect(mockStatus).toHaveBeenCalledWith(400);
            expect(mockJson).toHaveBeenCalledWith({
                error: 'Invalid orientation. Must be one of: portrait, landscape'
            });
        });

        it('should return 400 for invalid font size', async () => {
            mockRequest.params = { id: mockNotebookId };
            mockRequest.body = {
                template: 'academic',
                pageSize: 'A4',
                orientation: 'portrait',
                fontSize: 'invalid-size'
            };

            await notebookController.exportToPDF(mockRequest as Request, mockResponse as Response);

            expect(mockStatus).toHaveBeenCalledWith(400);
            expect(mockJson).toHaveBeenCalledWith({
                error: 'Invalid font size. Must be one of: small, medium, large'
            });
        });

        it('should handle PDF export errors', async () => {
            mockRequest.params = { id: mockNotebookId };
            mockRequest.body = {};

            // Setup mock to throw error
            mockSynthesisAgent.exportToPDF = jest.fn().mockRejectedValueOnce(new Error('PDF generation failed'));

            await notebookController.exportToPDF(mockRequest as Request, mockResponse as Response);

            expect(mockStatus).toHaveBeenCalledWith(500);
            expect(mockJson).toHaveBeenCalledWith({ error: 'Failed to export notebook to PDF' });
        });
    });

    describe('shareNotebook', () => {
        it('should share notebook successfully', async () => {
            const mockNotebook = {
                id: mockNotebookId,
                user_id: mockUserId,
                title: 'Test Notebook',
                description: 'Test Description',
                created_at: new Date(),
                updated_at: new Date()
            };

            mockRequest.params = { id: mockNotebookId };
            mockRequest.body = {
                userEmail: 'test@example.com',
                permission: 'read'
            };

            mockNotebookModel.findByIdAndUser.mockResolvedValue(mockNotebook);

            await notebookController.shareNotebook(mockRequest as Request, mockResponse as Response);

            expect(mockNotebookModel.findByIdAndUser).toHaveBeenCalledWith(mockNotebookId, mockUserId);
            expect(mockJson).toHaveBeenCalledWith({
                success: true,
                message: 'Notebook shared successfully',
                data: {
                    notebookId: mockNotebookId,
                    sharedWith: 'test@example.com',
                    permission: 'read',
                    sharedAt: expect.any(Date)
                }
            });
        });

        it('should return 400 when user email is missing', async () => {
            mockRequest.params = { id: mockNotebookId };
            mockRequest.body = { permission: 'read' };

            await notebookController.shareNotebook(mockRequest as Request, mockResponse as Response);

            expect(mockStatus).toHaveBeenCalledWith(400);
            expect(mockJson).toHaveBeenCalledWith({ error: 'User email is required' });
        });

        it('should return 400 for invalid permission', async () => {
            mockRequest.params = { id: mockNotebookId };
            mockRequest.body = {
                userEmail: 'test@example.com',
                permission: 'invalid'
            };

            await notebookController.shareNotebook(mockRequest as Request, mockResponse as Response);

            expect(mockStatus).toHaveBeenCalledWith(400);
            expect(mockJson).toHaveBeenCalledWith({ error: 'Permission must be either "read" or "write"' });
        });

        it('should return 404 when notebook not found', async () => {
            mockRequest.params = { id: mockNotebookId };
            mockRequest.body = {
                userEmail: 'test@example.com',
                permission: 'read'
            };

            mockNotebookModel.findByIdAndUser.mockResolvedValue(null);

            await notebookController.shareNotebook(mockRequest as Request, mockResponse as Response);

            expect(mockStatus).toHaveBeenCalledWith(404);
            expect(mockJson).toHaveBeenCalledWith({ error: 'Notebook not found' });
        });
    });

    describe('getNotebookSharing', () => {
        it('should get notebook sharing information successfully', async () => {
            const mockNotebook = {
                id: mockNotebookId,
                user_id: mockUserId,
                title: 'Test Notebook',
                description: 'Test Description',
                created_at: new Date(),
                updated_at: new Date()
            };

            mockRequest.params = { id: mockNotebookId };
            mockNotebookModel.findByIdAndUser.mockResolvedValue(mockNotebook);

            await notebookController.getNotebookSharing(mockRequest as Request, mockResponse as Response);

            expect(mockJson).toHaveBeenCalledWith({
                success: true,
                data: {
                    notebookId: mockNotebookId,
                    isPublic: false,
                    sharedWith: [],
                    permissions: {
                        canShare: true,
                        canEdit: true,
                        canDelete: true
                    }
                }
            });
        });

        it('should return 404 when notebook not found', async () => {
            mockRequest.params = { id: mockNotebookId };
            mockNotebookModel.findByIdAndUser.mockResolvedValue(null);

            await notebookController.getNotebookSharing(mockRequest as Request, mockResponse as Response);

            expect(mockStatus).toHaveBeenCalledWith(404);
            expect(mockJson).toHaveBeenCalledWith({ error: 'Notebook not found' });
        });
    });

    describe('unshareNotebook', () => {
        it('should unshare notebook successfully', async () => {
            const mockNotebook = {
                id: mockNotebookId,
                user_id: mockUserId,
                title: 'Test Notebook',
                description: 'Test Description',
                created_at: new Date(),
                updated_at: new Date()
            };

            mockRequest.params = { id: mockNotebookId };
            mockRequest.body = { userEmail: 'test@example.com' };
            mockNotebookModel.findByIdAndUser.mockResolvedValue(mockNotebook);

            await notebookController.unshareNotebook(mockRequest as Request, mockResponse as Response);

            expect(mockJson).toHaveBeenCalledWith({
                success: true,
                message: 'Notebook sharing removed successfully',
                data: {
                    notebookId: mockNotebookId,
                    removedFrom: 'test@example.com',
                    removedAt: expect.any(Date)
                }
            });
        });

        it('should return 400 when user email is missing', async () => {
            mockRequest.params = { id: mockNotebookId };
            mockRequest.body = {};

            await notebookController.unshareNotebook(mockRequest as Request, mockResponse as Response);

            expect(mockStatus).toHaveBeenCalledWith(400);
            expect(mockJson).toHaveBeenCalledWith({ error: 'User email is required' });
        });
    });

    describe('getSharedNotebooks', () => {
        it('should get shared notebooks successfully', async () => {
            mockRequest.query = { limit: '10', offset: '0' };

            await notebookController.getSharedNotebooks(mockRequest as Request, mockResponse as Response);

            expect(mockJson).toHaveBeenCalledWith({
                success: true,
                data: {
                    notebooks: [],
                    pagination: {
                        limit: 10,
                        offset: 0,
                        total: 0,
                        hasMore: false
                    }
                }
            });
        });
    });

    describe('addComment', () => {
        it('should add comment successfully', async () => {
            const mockNotebook = {
                id: mockNotebookId,
                user_id: mockUserId,
                title: 'Test Notebook',
                description: 'Test Description',
                created_at: new Date(),
                updated_at: new Date()
            };

            mockRequest.params = { id: mockNotebookId };
            mockRequest.body = {
                content: 'This is a test comment',
                elementId: uuidv4()
            };

            mockNotebookModel.findByIdAndUser.mockResolvedValue(mockNotebook);

            await notebookController.addComment(mockRequest as Request, mockResponse as Response);

            expect(mockStatus).toHaveBeenCalledWith(201);
            expect(mockJson).toHaveBeenCalledWith({
                success: true,
                message: 'Comment added successfully',
                data: expect.objectContaining({
                    id: expect.any(String),
                    notebookId: mockNotebookId,
                    userId: mockUserId,
                    content: 'This is a test comment',
                    elementId: expect.any(String),
                    createdAt: expect.any(Date),
                    updatedAt: expect.any(Date)
                })
            });
        });

        it('should return 400 when content is missing', async () => {
            mockRequest.params = { id: mockNotebookId };
            mockRequest.body = {};

            await notebookController.addComment(mockRequest as Request, mockResponse as Response);

            expect(mockStatus).toHaveBeenCalledWith(400);
            expect(mockJson).toHaveBeenCalledWith({ error: 'Comment content is required' });
        });

        it('should return 404 when notebook not found', async () => {
            mockRequest.params = { id: mockNotebookId };
            mockRequest.body = { content: 'Test comment' };
            mockNotebookModel.findByIdAndUser.mockResolvedValue(null);

            await notebookController.addComment(mockRequest as Request, mockResponse as Response);

            expect(mockStatus).toHaveBeenCalledWith(404);
            expect(mockJson).toHaveBeenCalledWith({ error: 'Notebook not found' });
        });
    });

    describe('getComments', () => {
        it('should get comments successfully', async () => {
            const mockNotebook = {
                id: mockNotebookId,
                user_id: mockUserId,
                title: 'Test Notebook',
                description: 'Test Description',
                created_at: new Date(),
                updated_at: new Date()
            };

            mockRequest.params = { id: mockNotebookId };
            mockRequest.query = { elementId: uuidv4() };
            mockNotebookModel.findByIdAndUser.mockResolvedValue(mockNotebook);

            await notebookController.getComments(mockRequest as Request, mockResponse as Response);

            expect(mockJson).toHaveBeenCalledWith({
                success: true,
                data: {
                    comments: [],
                    notebookId: mockNotebookId,
                    elementId: expect.any(String)
                }
            });
        });

        it('should return 404 when notebook not found', async () => {
            mockRequest.params = { id: mockNotebookId };
            mockNotebookModel.findByIdAndUser.mockResolvedValue(null);

            await notebookController.getComments(mockRequest as Request, mockResponse as Response);

            expect(mockStatus).toHaveBeenCalledWith(404);
            expect(mockJson).toHaveBeenCalledWith({ error: 'Notebook not found' });
        });
    });
});
