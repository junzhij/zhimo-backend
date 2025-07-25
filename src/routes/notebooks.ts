import { Router } from 'express';
import { notebookController } from '../controllers/notebookController';
import { validateRequest } from '../middleware/validation';
import { authenticateToken } from '../middleware/auth';

// Use require for express-validator due to CommonJS compatibility issues
const { body, param, query } = require('express-validator');

const router = Router();

// Validation middleware for notebook creation
const validateCreateNotebook = [
  body('title')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Title must be between 1 and 255 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description must be less than 1000 characters'),
  body('templateType')
    .optional()
    .isIn(['default', 'academic', 'research', 'study_guide', 'summary'])
    .withMessage('Invalid template type'),
  body('isPublic')
    .optional()
    .isBoolean()
    .withMessage('isPublic must be a boolean'),
  validateRequest
];

// Validation middleware for notebook update
const validateUpdateNotebook = [
  body('title')
    .optional()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Title must be between 1 and 255 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description must be less than 1000 characters'),
  body('templateType')
    .optional()
    .isIn(['default', 'academic', 'research', 'study_guide', 'summary'])
    .withMessage('Invalid template type'),
  body('isPublic')
    .optional()
    .isBoolean()
    .withMessage('isPublic must be a boolean'),
  validateRequest
];

// Validation middleware for composition item
const validateCompositionItem = [
  body('elementType')
    .isIn(['knowledge_element', 'annotation'])
    .withMessage('elementType must be either "knowledge_element" or "annotation"'),
  body('elementId')
    .trim()
    .isLength({ min: 1 })
    .withMessage('elementId is required'),
  body('orderIndex')
    .isInt({ min: 0 })
    .withMessage('orderIndex must be a non-negative integer'),
  body('sectionTitle')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('sectionTitle must be less than 255 characters'),
  body('customContent')
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage('customContent must be less than 5000 characters'),
  validateRequest
];

// Validation middleware for composition order update
const validateCompositionOrder = [
  body('items')
    .isArray()
    .withMessage('items must be an array'),
  body('items.*.id')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Each item must have a valid id'),
  body('items.*.orderIndex')
    .isInt({ min: 0 })
    .withMessage('Each item must have a valid orderIndex'),
  validateRequest
];

// Validation middleware for UUID parameters
const validateUUID = [
  param('id')
    .isUUID()
    .withMessage('Invalid notebook ID'),
  validateRequest
];

const validateCompositionUUID = [
  param('id')
    .isUUID()
    .withMessage('Invalid notebook ID'),
  param('compositionId')
    .isUUID()
    .withMessage('Invalid composition ID'),
  validateRequest
];

// Validation middleware for search
const validateSearch = [
  query('q')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Search term must be between 1 and 100 characters'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be non-negative'),
  query('includePublic')
    .optional()
    .isBoolean()
    .withMessage('includePublic must be a boolean'),
  validateRequest
];

// Validation middleware for pagination
const validatePagination = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be non-negative'),
  query('includePublic')
    .optional()
    .isBoolean()
    .withMessage('includePublic must be a boolean'),
  validateRequest
];

// Validation middleware for duplicate
const validateDuplicate = [
  body('title')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Title must be between 1 and 255 characters'),
  validateRequest
];

// Routes

/**
 * @route POST /api/notebooks
 * @desc Create a new notebook
 * @access Private
 */
router.post('/', authenticateToken, validateCreateNotebook, notebookController.createNotebook);

/**
 * @route GET /api/notebooks
 * @desc Get user's notebooks with pagination
 * @access Private
 */
router.get('/', authenticateToken, validatePagination, notebookController.getUserNotebooks);

/**
 * @route GET /api/notebooks/search
 * @desc Search notebooks by title
 * @access Private
 */
router.get('/search', authenticateToken, validateSearch, notebookController.searchNotebooks);

/**
 * @route GET /api/notebooks/stats
 * @desc Get notebook statistics for the user
 * @access Private
 */
router.get('/stats', authenticateToken, notebookController.getNotebookStats);

/**
 * @route GET /api/notebooks/:id
 * @desc Get notebook by ID
 * @access Private
 */
router.get('/:id', authenticateToken, validateUUID, notebookController.getNotebook);

/**
 * @route GET /api/notebooks/:id/composition
 * @desc Get notebook with its composition
 * @access Private
 */
router.get('/:id/composition', authenticateToken, validateUUID, notebookController.getNotebookWithComposition);

/**
 * @route PUT /api/notebooks/:id
 * @desc Update notebook
 * @access Private
 */
router.put('/:id', authenticateToken, validateUUID, validateUpdateNotebook, notebookController.updateNotebook);

/**
 * @route DELETE /api/notebooks/:id
 * @desc Delete notebook
 * @access Private
 */
router.delete('/:id', authenticateToken, validateUUID, notebookController.deleteNotebook);

/**
 * @route POST /api/notebooks/:id/duplicate
 * @desc Duplicate notebook with new title
 * @access Private
 */
router.post('/:id/duplicate', authenticateToken, validateUUID, validateDuplicate, notebookController.duplicateNotebook);

/**
 * @route POST /api/notebooks/:id/composition
 * @desc Add element to notebook composition
 * @access Private
 */
router.post('/:id/composition', authenticateToken, validateUUID, validateCompositionItem, notebookController.addCompositionItem);

/**
 * @route PUT /api/notebooks/:id/composition/order
 * @desc Update composition order
 * @access Private
 */
router.put('/:id/composition/order', authenticateToken, validateUUID, validateCompositionOrder, notebookController.updateCompositionOrder);

/**
 * @route GET /api/notebooks/:id/composition/items
 * @desc Get notebook composition items
 * @access Private
 */
router.get('/:id/composition/items', authenticateToken, validateUUID, notebookController.getComposition);

/**
 * @route DELETE /api/notebooks/:id/composition/:compositionId
 * @desc Remove composition item
 * @access Private
 */
router.delete('/:id/composition/:compositionId', authenticateToken, validateCompositionUUID, notebookController.removeCompositionItem);

/**
 * @route POST /api/notebooks/:id/compile
 * @desc Compile notebook content
 * @access Private
 */
router.post('/:id/compile', authenticateToken, validateUUID, notebookController.compileNotebook);

/**
 * @route POST /api/notebooks/:id/format
 * @desc Generate formatted text from notebook
 * @access Private
 */
router.post('/:id/format', authenticateToken, validateUUID, notebookController.generateFormattedText);

/**
 * @route GET /api/notebooks/:id/stats
 * @desc Get compilation statistics
 * @access Private
 */
router.get('/:id/stats', authenticateToken, validateUUID, notebookController.getCompilationStats);

/**
 * @route POST /api/notebooks/:id/export
 * @desc Export notebook to PDF
 * @access Private
 */
router.post('/:id/export', authenticateToken, validateUUID, notebookController.exportToPDF);

// Validation middleware for sharing
const validateShare = [
  body('userEmail')
    .isEmail()
    .withMessage('Valid email is required'),
  body('permission')
    .optional()
    .isIn(['read', 'write'])
    .withMessage('Permission must be either "read" or "write"'),
  validateRequest
];

const validateUnshare = [
  body('userEmail')
    .isEmail()
    .withMessage('Valid email is required'),
  validateRequest
];

const validateComment = [
  body('content')
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Comment content must be between 1 and 1000 characters'),
  body('elementId')
    .optional()
    .isUUID()
    .withMessage('Element ID must be a valid UUID'),
  validateRequest
];

/**
 * @route POST /api/notebooks/:id/share
 * @desc Share notebook with another user
 * @access Private
 */
router.post('/:id/share', authenticateToken, validateUUID, validateShare, notebookController.shareNotebook);

/**
 * @route GET /api/notebooks/:id/sharing
 * @desc Get notebook sharing information
 * @access Private
 */
router.get('/:id/sharing', authenticateToken, validateUUID, notebookController.getNotebookSharing);

/**
 * @route DELETE /api/notebooks/:id/share
 * @desc Remove sharing access for a user
 * @access Private
 */
router.delete('/:id/share', authenticateToken, validateUUID, validateUnshare, notebookController.unshareNotebook);

/**
 * @route GET /api/notebooks/shared
 * @desc Get notebooks shared with the current user
 * @access Private
 */
router.get('/shared', authenticateToken, validatePagination, notebookController.getSharedNotebooks);

/**
 * @route POST /api/notebooks/:id/comments
 * @desc Add comment to notebook
 * @access Private
 */
router.post('/:id/comments', authenticateToken, validateUUID, validateComment, notebookController.addComment);

/**
 * @route GET /api/notebooks/:id/comments
 * @desc Get comments for a notebook
 * @access Private
 */
router.get('/:id/comments', authenticateToken, validateUUID, notebookController.getComments);

export default router;