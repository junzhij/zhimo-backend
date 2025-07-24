import { Router } from 'express';
import { documentController } from '../controllers/documentController';
import { uploadSingle, handleUploadError } from '../middleware/upload';

const router = Router();

// Upload document endpoint
router.post('/upload', uploadSingle, handleUploadError, documentController.uploadDocument);

// Get document download URL
router.get('/:documentId/url', documentController.getDocumentUrl);

// Delete document
router.delete('/:documentId', documentController.deleteDocument);

export default router;