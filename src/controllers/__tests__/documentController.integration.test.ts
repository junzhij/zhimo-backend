import request from 'supertest';
import express from 'express';
import { documentController } from '../documentController';
import { documentModel } from '../../models/documentModel';
import { s3Service } from '../../services/s3Service';
import documentRoutes from '../../routes/documents';

// Mock dependencies
jest.mock('../../models/documentModel');
jest.mock('../../services/s3Service');
jest.mock('../../middleware/auth', () => ({
    authenticateToken: (req: any, res: any, next: any) => {
        const userId = req.headers['user-id'];
        if (userId) {
            req.user = { id: userId };
            next();
        } else {
            res.status(401).json({ error: 'Unauthorized' });
        }
    },
    requireAdmin: (req: any, res: any, next: any) => {
        const userId = req.headers['user-id'];
        if (userId) {
            req.user = { id: userId, role: 'admin' };
            next();
        } else {
            res.status(401).json({ error: 'Unauthorized' });
        }
    }
}));

const mockDocumentModel = documentModel as jest.Mocked<typeof documentModel>;
const mockS3Service = s3Service as jest.Mocked<typeof s3Service>;

describe('Document Controller Integration Tests', () => {
    let app: express.Application;

    beforeEach(() => {
        app = express();
        app.use(express.json());
        app.use('/api/documents', documentRoutes);
        jest.clearAllMocks();
    });

    describe('Document Processing Status Workflow', () => {
        it('should handle complete document processing workflow', async () => {
            const userId = 'test-user-123';
            const documentId = 'test-doc-123';

            // Mock document creation
            const mockDocument = {
                id: documentId,
                user_id: userId,
                original_name: 'test.pdf',
                file_type: 'PDF',
                file_size: 1024,
                s3_path: 'documents/test.pdf',
                processing_status: 'pending' as const,
                upload_timestamp: new Date(),
                metadata: {}
            };

            mockDocumentModel.findByIdAndUser.mockResolvedValue(mockDocument);

            // Test 1: Get initial processing status
            const statusResponse1 = await request(app)
                .get(`/api/documents/${documentId}/status`)
                .set('user-id', userId)
                .expect(200);

            expect(statusResponse1.body.success).toBe(true);
            expect(statusResponse1.body.data.processingStatus).toBe('pending');

            // Test 2: Update status to processing
            mockDocumentModel.updateStatus.mockResolvedValue(true);

            await request(app)
                .put(`/api/documents/${documentId}/status`)
                .set('user-id', userId)
                .send({ status: 'processing' })
                .expect(200);

            expect(mockDocumentModel.updateStatus).toHaveBeenCalledWith(
                documentId,
                'processing',
                undefined
            );

            // Test 3: Add processing steps
            mockDocumentModel.addProcessingStep.mockResolvedValue(true);

            // Add ingestion step
            await request(app)
                .post(`/api/documents/${documentId}/processing-step`)
                .set('user-id', userId)
                .send({
                    stepName: 'ingestion',
                    status: 'completed'
                })
                .expect(200);

            expect(mockDocumentModel.addProcessingStep).toHaveBeenCalledWith(
                documentId,
                'ingestion',
                'completed',
                undefined
            );

            // Add analysis step with error
            await request(app)
                .post(`/api/documents/${documentId}/processing-step`)
                .set('user-id', userId)
                .send({
                    stepName: 'analysis',
                    status: 'failed',
                    error: 'Analysis timeout'
                })
                .expect(200);

            expect(mockDocumentModel.addProcessingStep).toHaveBeenCalledWith(
                documentId,
                'analysis',
                'failed',
                'Analysis timeout'
            );

            // Test 4: Update metadata
            mockDocumentModel.updateMetadata.mockResolvedValue(true);

            const startTime = new Date();
            const metadata = {
                extractedContent: {
                    textLength: 5000,
                    pageCount: 10,
                    language: 'en'
                },
                processingMetrics: {
                    startTime: startTime.toISOString(),
                    duration: 120
                }
            };

            await request(app)
                .put(`/api/documents/${documentId}/metadata`)
                .set('user-id', userId)
                .send({ metadata })
                .expect(200);

            expect(mockDocumentModel.updateMetadata).toHaveBeenCalledWith(
                documentId,
                metadata
            );

            // Test 5: Final status update to failed (due to analysis failure)
            await request(app)
                .put(`/api/documents/${documentId}/status`)
                .set('user-id', userId)
                .send({
                    status: 'failed',
                    processedTimestamp: new Date().toISOString()
                })
                .expect(200);

            expect(mockDocumentModel.updateStatus).toHaveBeenCalledWith(
                documentId,
                'failed',
                expect.any(Date)
            );
        });

        it('should handle unauthorized access to processing endpoints', async () => {
            const documentId = 'test-doc-123';

            // Test without user-id header
            await request(app)
                .get(`/api/documents/${documentId}/status`)
                .expect(401);

            await request(app)
                .put(`/api/documents/${documentId}/status`)
                .send({ status: 'completed' })
                .expect(401);

            await request(app)
                .put(`/api/documents/${documentId}/metadata`)
                .send({ metadata: {} })
                .expect(401);

            await request(app)
                .post(`/api/documents/${documentId}/processing-step`)
                .send({ stepName: 'test', status: 'completed' })
                .expect(401);
        });

        it('should handle document not found scenarios', async () => {
            const userId = 'test-user-123';
            const documentId = 'nonexistent-doc';

            mockDocumentModel.findByIdAndUser.mockResolvedValue(null);

            await request(app)
                .get(`/api/documents/${documentId}/status`)
                .set('user-id', userId)
                .expect(404);

            await request(app)
                .put(`/api/documents/${documentId}/status`)
                .set('user-id', userId)
                .send({ status: 'completed' })
                .expect(404);

            await request(app)
                .put(`/api/documents/${documentId}/metadata`)
                .set('user-id', userId)
                .send({ metadata: {} })
                .expect(404);

            await request(app)
                .post(`/api/documents/${documentId}/processing-step`)
                .set('user-id', userId)
                .send({ stepName: 'test', status: 'completed' })
                .expect(404);
        });

        it('should validate processing status values', async () => {
            const userId = 'test-user-123';
            const documentId = 'test-doc-123';

            const mockDocument = {
                id: documentId,
                user_id: userId,
                original_name: 'test.pdf',
                file_type: 'PDF',
                file_size: 1024,
                s3_path: 'documents/test.pdf',
                processing_status: 'pending' as const,
                upload_timestamp: new Date(),
                metadata: {}
            };

            mockDocumentModel.findByIdAndUser.mockResolvedValue(mockDocument);

            // Test invalid status values
            await request(app)
                .put(`/api/documents/${documentId}/status`)
                .set('user-id', userId)
                .send({ status: 'invalid-status' })
                .expect(400);

            await request(app)
                .post(`/api/documents/${documentId}/processing-step`)
                .set('user-id', userId)
                .send({ stepName: 'test', status: 'invalid-status' })
                .expect(400);

            // Test missing required fields
            await request(app)
                .post(`/api/documents/${documentId}/processing-step`)
                .set('user-id', userId)
                .send({ stepName: 'test' }) // missing status
                .expect(400);

            await request(app)
                .post(`/api/documents/${documentId}/processing-step`)
                .set('user-id', userId)
                .send({ status: 'completed' }) // missing stepName
                .expect(400);
        });

        it('should get processing statistics', async () => {
            const mockStats = {
                pending: 5,
                processing: 2,
                completed: 10,
                failed: 1,
                total: 18
            };

            mockDocumentModel.getProcessingStats.mockResolvedValue(mockStats);

            const response = await request(app)
                .get('/api/documents/admin/stats')
                .set('user-id', 'admin-user-123')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toEqual(mockStats);
            expect(mockDocumentModel.getProcessingStats).toHaveBeenCalled();
        });
    });

    describe('Error Handling', () => {
        it('should handle database errors gracefully', async () => {
            const userId = 'test-user-123';
            const documentId = 'test-doc-123';

            // Mock database error
            mockDocumentModel.findByIdAndUser.mockRejectedValue(new Error('Database connection failed'));

            await request(app)
                .get(`/api/documents/${documentId}/status`)
                .set('user-id', userId)
                .expect(500);

            // Mock update error
            mockDocumentModel.findByIdAndUser.mockResolvedValue({
                id: documentId,
                user_id: userId,
                original_name: 'test.pdf',
                file_type: 'PDF',
                file_size: 1024,
                s3_path: 'documents/test.pdf',
                processing_status: 'pending' as const,
                upload_timestamp: new Date(),
                metadata: {}
            });
            mockDocumentModel.updateStatus.mockRejectedValue(new Error('Update failed'));

            await request(app)
                .put(`/api/documents/${documentId}/status`)
                .set('user-id', userId)
                .send({ status: 'completed' })
                .expect(500);
        });

        it('should handle metadata validation', async () => {
            const userId = 'test-user-123';
            const documentId = 'test-doc-123';

            mockDocumentModel.findByIdAndUser.mockResolvedValue({
                id: documentId,
                user_id: userId,
                original_name: 'test.pdf',
                file_type: 'PDF',
                file_size: 1024,
                s3_path: 'documents/test.pdf',
                processing_status: 'pending' as const,
                upload_timestamp: new Date(),
                metadata: {}
            });

            // Test invalid metadata types
            await request(app)
                .put(`/api/documents/${documentId}/metadata`)
                .set('user-id', userId)
                .send({ metadata: 'invalid-metadata' })
                .expect(400);

            await request(app)
                .put(`/api/documents/${documentId}/metadata`)
                .set('user-id', userId)
                .send({ metadata: null })
                .expect(400);

            await request(app)
                .put(`/api/documents/${documentId}/metadata`)
                .set('user-id', userId)
                .send({}) // missing metadata
                .expect(400);
        });
    });
});