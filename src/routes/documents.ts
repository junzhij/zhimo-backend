import { Router } from 'express';
import { documentController } from '../controllers/documentController';
import { uploadSingle, handleUploadError } from '../middleware/upload';
import { validateDocumentId } from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticateToken, requireAdmin } from '../middleware/auth';

const router = Router();

// Upload document endpoint
router.post('/upload', 
  authenticateToken,
  uploadSingle, 
  handleUploadError, 
  asyncHandler(documentController.uploadDocument.bind(documentController))
);

// List documents for user
router.get('/', 
  authenticateToken,
  asyncHandler(documentController.listDocuments.bind(documentController))
);

// Get document information and download URL
router.get('/:id', 
  authenticateToken,
  validateDocumentId,
  asyncHandler(documentController.getDocument.bind(documentController))
);

// Delete document
router.delete('/:id', 
  authenticateToken,
  validateDocumentId,
  asyncHandler(documentController.deleteDocument.bind(documentController))
);

// Update document processing status
router.put('/:id/status', 
  authenticateToken,
  validateDocumentId,
  asyncHandler(documentController.updateProcessingStatus.bind(documentController))
);

// Get document processing status
router.get('/:id/status', 
  authenticateToken,
  validateDocumentId,
  asyncHandler(documentController.getProcessingStatus.bind(documentController))
);

// Start document processing
router.post('/:id/process', 
  authenticateToken,
  validateDocumentId,
  asyncHandler(documentController.processDocument.bind(documentController))
);

// Cancel document processing
router.post('/:id/cancel', 
  authenticateToken,
  validateDocumentId,
  asyncHandler(documentController.cancelProcessing.bind(documentController))
);

// Update document metadata
router.put('/:id/metadata', 
  authenticateToken,
  validateDocumentId,
  asyncHandler(documentController.updateMetadata.bind(documentController))
);

// Add processing step to document
router.post('/:id/processing-step', 
  authenticateToken,
  validateDocumentId,
  asyncHandler(documentController.addProcessingStep.bind(documentController))
);

// Get processing statistics (admin endpoint)
router.get('/admin/stats', 
  authenticateToken,
  requireAdmin,
  asyncHandler(documentController.getProcessingStats.bind(documentController))
);

export default router;