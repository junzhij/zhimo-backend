# S3 Service

The S3 Service handles secure file uploads to Amazon S3 for the ZhiMo backend system.

## Features

- **Secure File Upload**: Files are uploaded to S3 with server-side encryption
- **File Validation**: Validates file types, sizes, and MIME types
- **Unique File Paths**: Generates unique S3 keys to prevent conflicts
- **Error Handling**: Comprehensive error handling for upload failures
- **Multiple Format Support**: Supports PDF, Word, PowerPoint, and image files

## Supported File Types

### Documents
- PDF (`.pdf`)
- Microsoft Word (`.doc`, `.docx`)
- Microsoft PowerPoint (`.ppt`, `.pptx`)
- Rich Text Format (`.rtf`)
- Plain Text (`.txt`)

### Images
- JPEG (`.jpg`, `.jpeg`)
- PNG (`.png`)
- GIF (`.gif`)
- BMP (`.bmp`)
- TIFF (`.tiff`, `.tif`)
- WebP (`.webp`)

## Configuration

The service requires the following environment variables:

```env
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
S3_BUCKET=your-bucket-name
```

## Usage

### Basic Upload

```typescript
import { s3Service } from './services/s3Service';

const result = await s3Service.uploadFile({
  userId: 'user-123',
  originalName: 'document.pdf',
  fileBuffer: fileBuffer,
  mimeType: 'application/pdf',
});

console.log('File uploaded to:', result.location);
```

### File Operations

```typescript
// Check if file exists
const exists = await s3Service.fileExists('path/to/file.pdf');

// Get signed download URL
const downloadUrl = await s3Service.getSignedUrl('path/to/file.pdf', 3600);

// Delete file
await s3Service.deleteFile('path/to/file.pdf');

// Get file metadata
const metadata = await s3Service.getFileMetadata('path/to/file.pdf');
```

## File Organization

Files are organized in S3 using the following structure:

```
documents/
├── {userId}/
│   ├── {date}/
│   │   ├── {uuid}_{sanitized_filename}.{ext}
│   │   └── ...
│   └── ...
└── ...
```

Example: `documents/user-123/2024-01-15/abc123_my_document.pdf`

## Security Features

- **Server-side encryption**: All files are encrypted at rest using AES-256
- **File validation**: Strict validation of file types and sizes
- **Unique paths**: UUID-based file naming prevents conflicts and guessing
- **Signed URLs**: Temporary access URLs with configurable expiration
- **Metadata preservation**: Original filename and upload metadata stored

## Error Handling

The service provides detailed error messages for common issues:

- File size exceeding 100MB limit
- Unsupported file types
- MIME type and extension mismatches
- S3 upload failures
- Network connectivity issues

## Limitations

- Maximum file size: 100MB
- Single file upload per request
- Files are stored in memory during upload (suitable for the 100MB limit)