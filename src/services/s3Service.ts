import AWS from 'aws-sdk';
import { config } from '../config/config';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

// Configure AWS SDK
AWS.config.update({
  region: config.aws.region,
  accessKeyId: config.aws.accessKeyId,
  secretAccessKey: config.aws.secretAccessKey,
});

const s3 = new AWS.S3();

export interface FileUploadOptions {
  userId: string;
  originalName: string;
  fileBuffer: Buffer;
  mimeType: string;
}

export interface UploadResult {
  key: string;
  location: string;
  bucket: string;
  etag: string;
}

export class S3Service {
  private readonly bucket: string;
  private readonly allowedMimeTypes: Set<string>;
  private readonly maxFileSize: number; // 100MB in bytes

  constructor() {
    this.bucket = config.aws.s3.bucket;
    this.maxFileSize = 100 * 1024 * 1024; // 100MB
    
    // Supported file formats as per requirements
    this.allowedMimeTypes = new Set([
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
      
      // Additional formats that might be useful
      'text/plain',
      'application/rtf',
    ]);
  }

  /**
   * Validates file before upload
   */
  private validateFile(fileBuffer: Buffer, mimeType: string, originalName: string): void {
    // Check file size
    if (fileBuffer.length > this.maxFileSize) {
      throw new Error(`File size exceeds maximum allowed size of ${this.maxFileSize / (1024 * 1024)}MB`);
    }

    // Check MIME type
    if (!this.allowedMimeTypes.has(mimeType)) {
      throw new Error(`File type '${mimeType}' is not supported. Supported types: ${Array.from(this.allowedMimeTypes).join(', ')}`);
    }

    // Check file extension matches MIME type
    const extension = path.extname(originalName).toLowerCase();
    const isValidExtension = this.isValidExtensionForMimeType(extension, mimeType);
    
    if (!isValidExtension) {
      throw new Error(`File extension '${extension}' does not match MIME type '${mimeType}'`);
    }
  }

  /**
   * Validates that file extension matches MIME type
   */
  private isValidExtensionForMimeType(extension: string, mimeType: string): boolean {
    const validCombinations: Record<string, string[]> = {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.ms-powerpoint': ['.ppt'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/gif': ['.gif'],
      'image/bmp': ['.bmp'],
      'image/tiff': ['.tiff', '.tif'],
      'image/webp': ['.webp'],
      'text/plain': ['.txt'],
      'application/rtf': ['.rtf'],
    };

    const validExtensions = validCombinations[mimeType];
    return validExtensions ? validExtensions.includes(extension) : false;
  }

  /**
   * Generates a unique S3 key for the file
   */
  private generateS3Key(userId: string, originalName: string): string {
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const fileId = uuidv4();
    const extension = path.extname(originalName);
    const sanitizedName = path.basename(originalName, extension)
      .replace(/[^a-zA-Z0-9-_]/g, '_')
      .substring(0, 50); // Limit length
    
    return `documents/${userId}/${timestamp}/${fileId}_${sanitizedName}${extension}`;
  }

  /**
   * Uploads a file to S3
   */
  async uploadFile(options: FileUploadOptions): Promise<UploadResult> {
    const { userId, originalName, fileBuffer, mimeType } = options;

    try {
      // Validate the file
      this.validateFile(fileBuffer, mimeType, originalName);

      // Generate unique S3 key
      const key = this.generateS3Key(userId, originalName);

      // Prepare upload parameters
      const uploadParams: AWS.S3.PutObjectRequest = {
        Bucket: this.bucket,
        Key: key,
        Body: fileBuffer,
        ContentType: mimeType,
        ContentDisposition: `attachment; filename="${originalName}"`,
        ServerSideEncryption: 'AES256',
        Metadata: {
          'original-name': originalName,
          'user-id': userId,
          'upload-timestamp': new Date().toISOString(),
        },
      };

      // Upload to S3
      const result = await s3.upload(uploadParams).promise();

      return {
        key: result.Key,
        location: result.Location,
        bucket: result.Bucket,
        etag: result.ETag,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`S3 upload failed: ${error.message}`);
      }
      throw new Error('S3 upload failed: Unknown error');
    }
  }

  /**
   * Deletes a file from S3
   */
  async deleteFile(key: string): Promise<void> {
    try {
      await s3.deleteObject({
        Bucket: this.bucket,
        Key: key,
      }).promise();
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`S3 delete failed: ${error.message}`);
      }
      throw new Error('S3 delete failed: Unknown error');
    }
  }

  /**
   * Gets a signed URL for downloading a file
   */
  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    try {
      const url = await s3.getSignedUrlPromise('getObject', {
        Bucket: this.bucket,
        Key: key,
        Expires: expiresIn,
      });
      return url;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to generate signed URL: ${error.message}`);
      }
      throw new Error('Failed to generate signed URL: Unknown error');
    }
  }

  /**
   * Checks if a file exists in S3
   */
  async fileExists(key: string): Promise<boolean> {
    try {
      await s3.headObject({
        Bucket: this.bucket,
        Key: key,
      }).promise();
      return true;
    } catch (error: any) {
      if (error && error.statusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Gets file metadata from S3
   */
  async getFileMetadata(key: string): Promise<AWS.S3.HeadObjectOutput> {
    try {
      const result = await s3.headObject({
        Bucket: this.bucket,
        Key: key,
      }).promise();
      return result;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to get file metadata: ${error.message}`);
      }
      throw new Error('Failed to get file metadata: Unknown error');
    }
  }
}

// Export singleton instance
export const s3Service = new S3Service();