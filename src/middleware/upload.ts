import multer from 'multer';
import { Request } from 'express';

// Configure multer for memory storage (files will be stored in memory as Buffer)
const storage = multer.memoryStorage();

// File filter function to validate file types
const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Allowed MIME types
  const allowedMimeTypes = [
    // PDF files
    'application/pdf',
    
    // Word documents
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    
    // PowerPoint files
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    
    // Images
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/bmp',
    'image/tiff',
    'image/webp',
    
    // Additional formats
    'text/plain',
    'application/rtf',
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type '${file.mimetype}' is not supported. Supported types: ${allowedMimeTypes.join(', ')}`));
  }
};

// Configure multer
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
    files: 1, // Only allow single file upload
  },
});

// Middleware for single file upload
export const uploadSingle = upload.single('document');

// Error handling middleware for multer errors
export const handleUploadError = (error: any, _req: Request, res: any, next: any) => {
  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({
          error: 'File too large',
          message: 'File size exceeds the maximum allowed size of 100MB',
        });
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          error: 'Too many files',
          message: 'Only one file can be uploaded at a time',
        });
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          error: 'Unexpected field',
          message: 'Unexpected file field. Use "document" as the field name',
        });
      default:
        return res.status(400).json({
          error: 'Upload error',
          message: error.message,
        });
    }
  }

  if (error) {
    return res.status(400).json({
      error: 'Upload error',
      message: error.message,
    });
  }

  next();
};