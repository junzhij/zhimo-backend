// Error handling middleware
import { Request, Response, NextFunction } from 'express';
import { Logger } from '../utils/logger';
import { config } from '../config/config';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export const errorHandler = (
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';
  
  Logger.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    statusCode
  });

  res.status(statusCode).json({
    error: true,
    message: config.nodeEnv === 'development' ? message : 'Something went wrong',
    ...(config.nodeEnv === 'development' && { stack: err.stack })
  });
};

export const createError = (message: string, statusCode: number = 500): AppError => {
  const error: AppError = new Error(message);
  error.statusCode = statusCode;
  error.isOperational = true;
  return error;
};

export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};