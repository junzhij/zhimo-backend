import { Router } from 'express';
import { documentController } from '../controllers/documentController';
import { uploadSingle, handleUploadError } from '../middleware/upload';
import { validateDocumentId } from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// Upload document endpoint
router.post('/upload', 
  uploadSingle, 
  handleUploadError, 
  asyncHandler(documentController.uploadDocument.bind(documentController))
);

// List documents for user
router.get('/', 
  asyncHandler(documentController.listDocuments.bind(documentController))
);

// Get document information and download URL
router.get('/:id', 
  validateDocumentId,
  asyncHandler(documentController.getDocument.bind(documentController))
);

// Delete document
router.delete('/:id', 
  validateDocumentId,
  asyncHandler(documentController.deleteDocument.bind(documentController))
);

export default router;