import { S3Service } from '../s3Service';

// Mock AWS SDK
jest.mock('aws-sdk', () => ({
  S3: jest.fn().mockImplementation(() => ({
    upload: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        Key: 'test-key',
        Location: 'https://test-bucket.s3.amazonaws.com/test-key',
        Bucket: 'test-bucket',
        ETag: '"test-etag"',
      }),
    }),
    deleteObject: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({}),
    }),
    getSignedUrlPromise: jest.fn().mockResolvedValue('https://signed-url.com'),
    headObject: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        ContentLength: 1024,
        ContentType: 'application/pdf',
      }),
    }),
  })),
  config: {
    update: jest.fn(),
  },
}));

describe('S3Service', () => {
  let s3Service: S3Service;

  beforeEach(() => {
    s3Service = new S3Service();
  });

  describe('uploadFile', () => {
    it('should upload a valid PDF file successfully', async () => {
      const mockBuffer = Buffer.from('mock pdf content');
      const result = await s3Service.uploadFile({
        userId: 'test-user-id',
        originalName: 'test.pdf',
        fileBuffer: mockBuffer,
        mimeType: 'application/pdf',
      });

      expect(result).toEqual({
        key: 'test-key',
        location: 'https://test-bucket.s3.amazonaws.com/test-key',
        bucket: 'test-bucket',
        etag: '"test-etag"',
      });
    });

    it('should upload Word documents successfully', async () => {
      const mockBuffer = Buffer.from('mock word content');
      
      // Test .doc file
      await expect(s3Service.uploadFile({
        userId: 'test-user-id',
        originalName: 'document.doc',
        fileBuffer: mockBuffer,
        mimeType: 'application/msword',
      })).resolves.toBeDefined();

      // Test .docx file
      await expect(s3Service.uploadFile({
        userId: 'test-user-id',
        originalName: 'document.docx',
        fileBuffer: mockBuffer,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })).resolves.toBeDefined();
    });

    it('should upload PowerPoint files successfully', async () => {
      const mockBuffer = Buffer.from('mock ppt content');
      
      // Test .ppt file
      await expect(s3Service.uploadFile({
        userId: 'test-user-id',
        originalName: 'presentation.ppt',
        fileBuffer: mockBuffer,
        mimeType: 'application/vnd.ms-powerpoint',
      })).resolves.toBeDefined();

      // Test .pptx file
      await expect(s3Service.uploadFile({
        userId: 'test-user-id',
        originalName: 'presentation.pptx',
        fileBuffer: mockBuffer,
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      })).resolves.toBeDefined();
    });

    it('should upload image files successfully', async () => {
      const mockBuffer = Buffer.from('mock image content');
      
      const imageFormats = [
        { ext: 'jpg', mime: 'image/jpeg' },
        { ext: 'jpeg', mime: 'image/jpeg' },
        { ext: 'png', mime: 'image/png' },
        { ext: 'gif', mime: 'image/gif' },
        { ext: 'bmp', mime: 'image/bmp' },
        { ext: 'tiff', mime: 'image/tiff' },
        { ext: 'webp', mime: 'image/webp' },
      ];

      for (const format of imageFormats) {
        await expect(s3Service.uploadFile({
          userId: 'test-user-id',
          originalName: `image.${format.ext}`,
          fileBuffer: mockBuffer,
          mimeType: format.mime,
        })).resolves.toBeDefined();
      }
    });

    it('should reject files that are too large', async () => {
      const largeBuffer = Buffer.alloc(101 * 1024 * 1024); // 101MB
      
      await expect(s3Service.uploadFile({
        userId: 'test-user-id',
        originalName: 'large.pdf',
        fileBuffer: largeBuffer,
        mimeType: 'application/pdf',
      })).rejects.toThrow('File size exceeds maximum allowed size');
    });

    it('should reject unsupported file types', async () => {
      const mockBuffer = Buffer.from('mock content');
      
      await expect(s3Service.uploadFile({
        userId: 'test-user-id',
        originalName: 'test.exe',
        fileBuffer: mockBuffer,
        mimeType: 'application/x-executable',
      })).rejects.toThrow('File type \'application/x-executable\' is not supported');
    });

    it('should reject files with mismatched extension and MIME type', async () => {
      const mockBuffer = Buffer.from('mock content');
      
      await expect(s3Service.uploadFile({
        userId: 'test-user-id',
        originalName: 'test.pdf',
        fileBuffer: mockBuffer,
        mimeType: 'image/jpeg',
      })).rejects.toThrow('File extension \'.pdf\' does not match MIME type \'image/jpeg\'');
    });
  });

  describe('deleteFile', () => {
    it('should delete a file successfully', async () => {
      await expect(s3Service.deleteFile('test-key')).resolves.not.toThrow();
    });
  });

  describe('getSignedUrl', () => {
    it('should generate a signed URL', async () => {
      const url = await s3Service.getSignedUrl('test-key');
      expect(url).toBe('https://signed-url.com');
    });
  });

  describe('fileExists', () => {
    it('should return true for existing files', async () => {
      const exists = await s3Service.fileExists('test-key');
      expect(exists).toBe(true);
    });
  });
});