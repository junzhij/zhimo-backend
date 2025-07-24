// Request validation middleware
import { Request, Response, NextFunction } from 'express';
import { createError } from './errorHandler';

// Use require for express-validator due to CommonJS compatibility issues
const { validationResult } = require('express-validator');

// Middleware to handle express-validator validation results
export const validateRequest = (req: Request, _res: Response, next: NextFunction): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessage = errors.array()
      .map((error: any) => error.msg)
      .join(', ');
    return next(createError(errorMessage, 400));
  }
  next();
};

export const validateFileUpload = (req: Request, _res: Response, next: NextFunction): void => {
  // Check if file exists in request (will be added by multer middleware in later tasks)
  const hasFile = (req as any).file || (req as any).files;
  if (!hasFile) {
    return next(createError('No file uploaded', 400));
  }
  next();
};

export const validateDocumentId = (req: Request, _res: Response, next: NextFunction): void => {
  const { id } = req.params;
  
  if (!id || typeof id !== 'string' || id.trim().length === 0) {
    return next(createError('Invalid document ID', 400));
  }
  
  next();
};

export const validateUserId = (req: Request, _res: Response, next: NextFunction): void => {
  const userId = req.headers['user-id'] as string;
  
  if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
    return next(createError('User ID is required', 401));
  }
  
  // Add user ID to request for later use
  (req as any).userId = userId;
  next();
};

export const validatePagination = (req: Request, _res: Response, next: NextFunction): void => {
  const { page = '1', limit = '10' } = req.query;
  
  const pageNum = parseInt(page as string, 10);
  const limitNum = parseInt(limit as string, 10);
  
  if (isNaN(pageNum) || pageNum < 1) {
    return next(createError('Invalid page number', 400));
  }
  
  if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
    return next(createError('Invalid limit (must be between 1 and 100)', 400));
  }
  
  (req as any).pagination = { page: pageNum, limit: limitNum };
  next();
};

// Orchestrator-specific validation middleware

export const validateWorkflowId = (req: Request, _res: Response, next: NextFunction): void => {
  const { workflowId } = req.params;
  
  if (!workflowId || typeof workflowId !== 'string' || workflowId.trim().length === 0) {
    return next(createError('Invalid workflow ID', 400));
  }
  
  next();
};

export const validateTaskId = (req: Request, _res: Response, next: NextFunction): void => {
  const { taskId } = req.params;
  
  if (!taskId || typeof taskId !== 'string' || taskId.trim().length === 0) {
    return next(createError('Invalid task ID', 400));
  }
  
  next();
};

export const validateUserInstruction = (req: Request, _res: Response, next: NextFunction): void => {
  const { instruction, documentId } = req.body;
  
  if (!instruction || typeof instruction !== 'string' || instruction.trim().length === 0) {
    return next(createError('Instruction is required', 400));
  }
  
  if (!documentId || typeof documentId !== 'string' || documentId.trim().length === 0) {
    return next(createError('Document ID is required', 400));
  }
  
  // Validate options if provided
  if (req.body.options) {
    const { options } = req.body;
    
    if (options.summaryLength && !['short', 'medium', 'long'].includes(options.summaryLength)) {
      return next(createError('Invalid summary length', 400));
    }
    
    if (options.questionTypes && !Array.isArray(options.questionTypes)) {
      return next(createError('Question types must be an array', 400));
    }
    
    if (options.questionTypes) {
      const validTypes = ['multiple_choice', 'fill_blank', 'short_answer', 'essay'];
      const invalidTypes = options.questionTypes.filter((type: string) => !validTypes.includes(type));
      
      if (invalidTypes.length > 0) {
        return next(createError(`Invalid question types: ${invalidTypes.join(', ')}`, 400));
      }
    }
  }
  
  // Validate priority if provided
  if (req.body.priority !== undefined) {
    const priority = parseInt(req.body.priority, 10);
    if (isNaN(priority) || priority < 1 || priority > 10) {
      return next(createError('Priority must be between 1 and 10', 400));
    }
  }
  
  next();
};