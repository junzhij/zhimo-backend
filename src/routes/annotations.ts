import { Router } from 'express';
import { annotationController } from '../controllers/annotationController';
import { validateDocumentId } from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// Create annotation
router.post('/', 
  asyncHandler(annotationController.createAnnotation.bind(annotationController))
);

// Get user's annotations with filtering and pagination
router.get('/', 
  asyncHandler(annotationController.getUserAnnotations.bind(annotationController))
);

// Search annotations by content
router.get('/search', 
  asyncHandler(annotationController.searchAnnotations.bind(annotationController))
);

// Get annotation statistics for user
router.get('/stats', 
  asyncHandler(annotationController.getAnnotationStats.bind(annotationController))
);

// Get recent annotations for user
router.get('/recent', 
  asyncHandler(annotationController.getRecentAnnotations.bind(annotationController))
);

// Get all tags used by user
router.get('/tags', 
  asyncHandler(annotationController.getUserTags.bind(annotationController))
);

// Get tag usage statistics
router.get('/tags/stats', 
  asyncHandler(annotationController.getTagStats.bind(annotationController))
);

// Get annotations by tags
router.post('/tags/search', 
  asyncHandler(annotationController.getAnnotationsByTags.bind(annotationController))
);

// Get specific annotation by ID
router.get('/:id', 
  asyncHandler(annotationController.getAnnotation.bind(annotationController))
);

// Update annotation
router.put('/:id', 
  asyncHandler(annotationController.updateAnnotation.bind(annotationController))
);

// Delete annotation
router.delete('/:id', 
  asyncHandler(annotationController.deleteAnnotation.bind(annotationController))
);

// Get annotations for a specific document
router.get('/document/:documentId', 
  validateDocumentId,
  asyncHandler(annotationController.getDocumentAnnotations.bind(annotationController))
);

// Delete all annotations for a specific document
router.delete('/document/:documentId', 
  validateDocumentId,
  asyncHandler(annotationController.deleteDocumentAnnotations.bind(annotationController))
);

export default router;