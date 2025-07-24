import { Router } from 'express';
import { knowledgeElementController } from '../controllers/knowledgeElementController';
import { authenticateToken } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { body, query, param } from 'express-validator';
import { validateRequest } from '../middleware/validation';

const router = Router();

// Validation middleware
const validateKnowledgeElementId = [
  param('id')
    .isMongoId()
    .withMessage('Invalid knowledge element ID'),
  validateRequest
];

const validateCreateKnowledgeElement = [
  body('document_id')
    .isUUID()
    .withMessage('document_id must be a valid UUID'),
  body('agent_type')
    .isIn(['analysis', 'extraction', 'pedagogy'])
    .withMessage('agent_type must be one of: analysis, extraction, pedagogy'),
  body('element_type')
    .isIn(['summary', 'definition', 'formula', 'question', 'entity', 'topic', 'flashcard', 'concept', 'theorem', 'relationship'])
    .withMessage('element_type must be a valid type'),
  body('content.title')
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('content.title must be between 1 and 500 characters'),
  body('content.body')
    .trim()
    .isLength({ min: 1 })
    .withMessage('content.body is required'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('tags must be an array'),
  body('tags.*')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Each tag must be between 1 and 50 characters'),
  body('confidence_score')
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage('confidence_score must be between 0 and 1'),
  validateRequest
];

const validateUpdateKnowledgeElement = [
  body('content.title')
    .optional()
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('content.title must be between 1 and 500 characters'),
  body('content.body')
    .optional()
    .trim()
    .isLength({ min: 1 })
    .withMessage('content.body cannot be empty'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('tags must be an array'),
  body('tags.*')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Each tag must be between 1 and 50 characters'),
  body('confidence_score')
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage('confidence_score must be between 0 and 1'),
  validateRequest
];

const validateSearchKnowledgeElements = [
  body('text')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Search text is required'),
  body('filters.document_id')
    .optional()
    .isUUID()
    .withMessage('filters.document_id must be a valid UUID'),
  body('filters.agent_type')
    .optional()
    .isIn(['analysis', 'extraction', 'pedagogy'])
    .withMessage('filters.agent_type must be one of: analysis, extraction, pedagogy'),
  body('filters.element_type')
    .optional()
    .isIn(['summary', 'definition', 'formula', 'question', 'entity', 'topic', 'flashcard', 'concept', 'theorem', 'relationship'])
    .withMessage('filters.element_type must be a valid type'),
  body('filters.tags')
    .optional()
    .isArray()
    .withMessage('filters.tags must be an array'),
  body('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be between 1 and 100'),
  body('skip')
    .optional()
    .isInt({ min: 0 })
    .withMessage('skip must be a non-negative integer'),
  validateRequest
];

const validateGetKnowledgeElements = [
  query('document_id')
    .optional()
    .isUUID()
    .withMessage('document_id must be a valid UUID'),
  query('agent_type')
    .optional()
    .isIn(['analysis', 'extraction', 'pedagogy'])
    .withMessage('agent_type must be one of: analysis, extraction, pedagogy'),
  query('element_type')
    .optional()
    .isIn(['summary', 'definition', 'formula', 'question', 'entity', 'topic', 'flashcard', 'concept', 'theorem', 'relationship'])
    .withMessage('element_type must be a valid type'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be between 1 and 100'),
  query('skip')
    .optional()
    .isInt({ min: 0 })
    .withMessage('skip must be a non-negative integer'),
  query('sort_by')
    .optional()
    .isIn(['created_at', 'updated_at', 'confidence_score', 'element_type', 'agent_type'])
    .withMessage('sort_by must be a valid field'),
  query('sort_order')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('sort_order must be asc or desc'),
  validateRequest
];

// Get knowledge elements with filtering and pagination
router.get('/', 
  authenticateToken,
  validateGetKnowledgeElements,
  asyncHandler(knowledgeElementController.getKnowledgeElements.bind(knowledgeElementController))
);

// Search knowledge elements by text content
router.post('/search', 
  authenticateToken,
  validateSearchKnowledgeElements,
  asyncHandler(knowledgeElementController.searchKnowledgeElements.bind(knowledgeElementController))
);

// Get knowledge element statistics
router.get('/stats', 
  authenticateToken,
  asyncHandler(knowledgeElementController.getKnowledgeElementStats.bind(knowledgeElementController))
);

// Get specific knowledge element by ID
router.get('/:id', 
  authenticateToken,
  validateKnowledgeElementId,
  asyncHandler(knowledgeElementController.getKnowledgeElement.bind(knowledgeElementController))
);

// Create new knowledge element
router.post('/', 
  authenticateToken,
  validateCreateKnowledgeElement,
  asyncHandler(knowledgeElementController.createKnowledgeElement.bind(knowledgeElementController))
);

// Update knowledge element
router.put('/:id', 
  authenticateToken,
  validateKnowledgeElementId,
  validateUpdateKnowledgeElement,
  asyncHandler(knowledgeElementController.updateKnowledgeElement.bind(knowledgeElementController))
);

// Delete knowledge element
router.delete('/:id', 
  authenticateToken,
  validateKnowledgeElementId,
  asyncHandler(knowledgeElementController.deleteKnowledgeElement.bind(knowledgeElementController))
);

export default router;