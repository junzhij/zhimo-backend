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

// Update document processing status
router.put('/:id/status', 
  validateDocumentId,
  asyncHandler(documentController.updateProcessingStatus.bind(documentController))
);

// Get document processing status
router.get('/:id/status', 
  validateDocumentId,
  asyncHandler(documentController.getProcessingStatus.bind(documentController))
);

// Update document metadata
router.put('/:id/metadata', 
  validateDocumentId,
  asyncHandler(documentController.updateMetadata.bind(documentController))
);

// Add processing step to document
router.post('/:id/processing-step', 
  validateDocumentId,
  asyncHandler(documentController.addProcessingStep.bind(documentController))
);

// Get processing statistics (admin endpoint)
router.get('/admin/stats', 
  asyncHandler(documentController.getProcessingStats.bind(documentController))
);

export default router;