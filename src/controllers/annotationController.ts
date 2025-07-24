import { Request, Response } from 'express';
import { annotationModel, AnnotationType, CreateAnnotationData, UpdateAnnotationData } from '../models/annotationModel';
import { documentModel } from '../models/documentModel';
import { User } from '../models/userModel';

// Use the global Request interface extension that includes User
interface AuthenticatedRequest extends Request {
  user?: User;
}

export class AnnotationController {
  /**
   * Create a new annotation
   */
  async createAnnotation(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User ID is required'
        });
        return;
      }

      const { documentId, annotationType, content, positionData, color, tags } = req.body;

      // Validate required fields
      if (!documentId || !annotationType || !content || !positionData) {
        res.status(400).json({
          error: 'Missing required fields',
          message: 'documentId, annotationType, content, and positionData are required'
        });
        return;
      }

      // Validate annotation type
      const validTypes: AnnotationType[] = ['highlight', 'note', 'bookmark'];
      if (!validTypes.includes(annotationType)) {
        res.status(400).json({
          error: 'Invalid annotation type',
          message: 'annotationType must be one of: highlight, note, bookmark'
        });
        return;
      }

      // Verify document exists and user has access
      const document = await documentModel.findByIdAndUser(documentId, userId);
      if (!document) {
        res.status(404).json({
          error: 'Document not found',
          message: 'The specified document does not exist or you do not have access to it'
        });
        return;
      }

      // Validate tags if provided
      if (tags && (!Array.isArray(tags) || !tags.every(tag => typeof tag === 'string'))) {
        res.status(400).json({
          error: 'Invalid tags format',
          message: 'Tags must be an array of strings'
        });
        return;
      }

      // Create annotation
      const annotationData: CreateAnnotationData = {
        userId,
        documentId,
        annotationType,
        content,
        positionData,
        color,
        tags
      };

      const annotation = await annotationModel.create(annotationData);

      res.status(201).json({
        success: true,
        message: 'Annotation created successfully',
        data: annotation
      });

    } catch (error) {
      console.error('Create annotation error:', error);
      
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to create annotation'
      });
    }
  }

  /**
   * Get annotation by ID
   */
  async getAnnotation(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const { id } = req.params;

      if (!userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User ID is required'
        });
        return;
      }

      const annotation = await annotationModel.findByIdAndUser(id, userId);

      if (!annotation) {
        res.status(404).json({
          error: 'Annotation not found',
          message: 'The requested annotation does not exist or you do not have access to it'
        });
        return;
      }

      res.json({
        success: true,
        data: annotation
      });

    } catch (error) {
      console.error('Get annotation error:', error);
      
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve annotation'
      });
    }
  }

  /**
   * Get annotations for a document
   */
  async getDocumentAnnotations(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const { documentId } = req.params;
      const annotationType = req.query.type as AnnotationType;

      if (!userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User ID is required'
        });
        return;
      }

      // Verify document exists and user has access
      const document = await documentModel.findByIdAndUser(documentId, userId);
      if (!document) {
        res.status(404).json({
          error: 'Document not found',
          message: 'The specified document does not exist or you do not have access to it'
        });
        return;
      }

      // Validate annotation type if provided
      if (annotationType) {
        const validTypes: AnnotationType[] = ['highlight', 'note', 'bookmark'];
        if (!validTypes.includes(annotationType)) {
          res.status(400).json({
            error: 'Invalid annotation type',
            message: 'type must be one of: highlight, note, bookmark'
          });
          return;
        }
      }

      const annotations = await annotationModel.findByDocumentAndUser(
        documentId, 
        userId, 
        annotationType
      );

      res.json({
        success: true,
        data: {
          documentId,
          annotations,
          total: annotations.length
        }
      });

    } catch (error) {
      console.error('Get document annotations error:', error);
      
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve document annotations'
      });
    }
  }

  /**
   * Get user's annotations with filtering and pagination
   */
  async getUserAnnotations(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User ID is required'
        });
        return;
      }

      // Parse query parameters
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const documentId = req.query.documentId as string;
      const annotationType = req.query.type as AnnotationType;
      const content = req.query.content as string;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

      // Validate pagination parameters
      if (page < 1 || limit < 1 || limit > 100) {
        res.status(400).json({
          error: 'Invalid pagination parameters',
          message: 'Page must be >= 1 and limit must be between 1 and 100'
        });
        return;
      }

      // Validate annotation type if provided
      if (annotationType) {
        const validTypes: AnnotationType[] = ['highlight', 'note', 'bookmark'];
        if (!validTypes.includes(annotationType)) {
          res.status(400).json({
            error: 'Invalid annotation type',
            message: 'type must be one of: highlight, note, bookmark'
          });
          return;
        }
      }

      const offset = (page - 1) * limit;

      const { annotations, total } = await annotationModel.findByUser(userId, {
        documentId,
        annotationType,
        content,
        startDate,
        endDate,
        limit,
        offset
      });

      res.json({
        success: true,
        data: {
          annotations,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            hasNext: page * limit < total,
            hasPrev: page > 1
          }
        }
      });

    } catch (error) {
      console.error('Get user annotations error:', error);
      
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve user annotations'
      });
    }
  }

  /**
   * Update annotation
   */
  async updateAnnotation(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const { id } = req.params;
      const { content, positionData, color, tags } = req.body;

      if (!userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User ID is required'
        });
        return;
      }

      // Verify annotation exists and user has access
      const existingAnnotation = await annotationModel.findByIdAndUser(id, userId);
      if (!existingAnnotation) {
        res.status(404).json({
          error: 'Annotation not found',
          message: 'The requested annotation does not exist or you do not have access to it'
        });
        return;
      }

      // Validate tags if provided
      if (tags && (!Array.isArray(tags) || !tags.every(tag => typeof tag === 'string'))) {
        res.status(400).json({
          error: 'Invalid tags format',
          message: 'Tags must be an array of strings'
        });
        return;
      }

      // Prepare update data
      const updateData: UpdateAnnotationData = {};
      if (content !== undefined) updateData.content = content;
      if (positionData !== undefined) updateData.positionData = positionData;
      if (color !== undefined) updateData.color = color;
      if (tags !== undefined) updateData.tags = tags;

      if (Object.keys(updateData).length === 0) {
        res.status(400).json({
          error: 'No update data provided',
          message: 'At least one field (content, positionData, color, tags) must be provided'
        });
        return;
      }

      const updated = await annotationModel.update(id, userId, updateData);

      if (!updated) {
        res.status(500).json({
          error: 'Internal server error',
          message: 'Failed to update annotation'
        });
        return;
      }

      // Get updated annotation
      const updatedAnnotation = await annotationModel.findByIdAndUser(id, userId);

      res.json({
        success: true,
        message: 'Annotation updated successfully',
        data: updatedAnnotation
      });

    } catch (error) {
      console.error('Update annotation error:', error);
      
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to update annotation'
      });
    }
  }

  /**
   * Delete annotation
   */
  async deleteAnnotation(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const { id } = req.params;

      if (!userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User ID is required'
        });
        return;
      }

      // Verify annotation exists and user has access
      const annotation = await annotationModel.findByIdAndUser(id, userId);
      if (!annotation) {
        res.status(404).json({
          error: 'Annotation not found',
          message: 'The requested annotation does not exist or you do not have access to it'
        });
        return;
      }

      const deleted = await annotationModel.deleteByIdAndUser(id, userId);

      if (!deleted) {
        res.status(500).json({
          error: 'Internal server error',
          message: 'Failed to delete annotation'
        });
        return;
      }

      res.json({
        success: true,
        message: 'Annotation deleted successfully'
      });

    } catch (error) {
      console.error('Delete annotation error:', error);
      
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to delete annotation'
      });
    }
  }

  /**
   * Search annotations by content
   */
  async searchAnnotations(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User ID is required'
        });
        return;
      }

      const { q: searchTerm } = req.query;
      
      if (!searchTerm || typeof searchTerm !== 'string') {
        res.status(400).json({
          error: 'Missing search term',
          message: 'Query parameter "q" is required'
        });
        return;
      }

      // Parse additional query parameters
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const documentId = req.query.documentId as string;
      const annotationType = req.query.type as AnnotationType;

      // Validate pagination parameters
      if (page < 1 || limit < 1 || limit > 100) {
        res.status(400).json({
          error: 'Invalid pagination parameters',
          message: 'Page must be >= 1 and limit must be between 1 and 100'
        });
        return;
      }

      // Validate annotation type if provided
      if (annotationType) {
        const validTypes: AnnotationType[] = ['highlight', 'note', 'bookmark'];
        if (!validTypes.includes(annotationType)) {
          res.status(400).json({
            error: 'Invalid annotation type',
            message: 'type must be one of: highlight, note, bookmark'
          });
          return;
        }
      }

      const offset = (page - 1) * limit;

      const { annotations, total } = await annotationModel.searchByContent(
        userId, 
        searchTerm, 
        {
          documentId,
          annotationType,
          limit,
          offset
        }
      );

      res.json({
        success: true,
        data: {
          searchTerm,
          annotations,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            hasNext: page * limit < total,
            hasPrev: page > 1
          }
        }
      });

    } catch (error) {
      console.error('Search annotations error:', error);
      
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to search annotations'
      });
    }
  }

  /**
   * Get annotation statistics for user
   */
  async getAnnotationStats(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User ID is required'
        });
        return;
      }

      const stats = await annotationModel.getStatsByUser(userId);

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      console.error('Get annotation stats error:', error);
      
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve annotation statistics'
      });
    }
  }

  /**
   * Get recent annotations for user
   */
  async getRecentAnnotations(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User ID is required'
        });
        return;
      }

      const limit = parseInt(req.query.limit as string) || 10;

      if (limit < 1 || limit > 50) {
        res.status(400).json({
          error: 'Invalid limit parameter',
          message: 'Limit must be between 1 and 50'
        });
        return;
      }

      const annotations = await annotationModel.getRecentByUser(userId, limit);

      res.json({
        success: true,
        data: {
          annotations,
          total: annotations.length
        }
      });

    } catch (error) {
      console.error('Get recent annotations error:', error);
      
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve recent annotations'
      });
    }
  }

  /**
   * Delete all annotations for a document
   */
  async deleteDocumentAnnotations(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const { documentId } = req.params;

      if (!userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User ID is required'
        });
        return;
      }

      // Verify document exists and user has access
      const document = await documentModel.findByIdAndUser(documentId, userId);
      if (!document) {
        res.status(404).json({
          error: 'Document not found',
          message: 'The specified document does not exist or you do not have access to it'
        });
        return;
      }

      const deletedCount = await annotationModel.deleteByDocumentAndUser(documentId, userId);

      res.json({
        success: true,
        message: `${deletedCount} annotations deleted successfully`,
        data: {
          documentId,
          deletedCount
        }
      });

    } catch (error) {
      console.error('Delete document annotations error:', error);
      
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to delete document annotations'
      });
    }
  }
  /**
   * Get all tags used by user
   */
  async getUserTags(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User ID is required'
        });
        return;
      }

      const tags = await annotationModel.getTagsByUser(userId);

      res.json({
        success: true,
        data: {
          tags,
          total: tags.length
        }
      });

    } catch (error) {
      console.error('Get user tags error:', error);
      
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve user tags'
      });
    }
  }

  /**
   * Get annotations by tags
   */
  async getAnnotationsByTags(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User ID is required'
        });
        return;
      }

      const { tags } = req.body;
      
      if (!tags || !Array.isArray(tags) || tags.length === 0) {
        res.status(400).json({
          error: 'Invalid tags',
          message: 'Tags must be a non-empty array of strings'
        });
        return;
      }

      if (!tags.every(tag => typeof tag === 'string')) {
        res.status(400).json({
          error: 'Invalid tags format',
          message: 'All tags must be strings'
        });
        return;
      }

      // Parse query parameters
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const matchAll = req.query.matchAll === 'true';

      // Validate pagination parameters
      if (page < 1 || limit < 1 || limit > 100) {
        res.status(400).json({
          error: 'Invalid pagination parameters',
          message: 'Page must be >= 1 and limit must be between 1 and 100'
        });
        return;
      }

      const offset = (page - 1) * limit;

      const { annotations, total } = await annotationModel.findByTags(userId, tags, {
        matchAll,
        limit,
        offset
      });

      res.json({
        success: true,
        data: {
          tags,
          matchAll,
          annotations,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            hasNext: page * limit < total,
            hasPrev: page > 1
          }
        }
      });

    } catch (error) {
      console.error('Get annotations by tags error:', error);
      
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve annotations by tags'
      });
    }
  }

  /**
   * Get tag usage statistics
   */
  async getTagStats(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User ID is required'
        });
        return;
      }

      const tagStats = await annotationModel.getTagStats(userId);

      res.json({
        success: true,
        data: {
          tagStats,
          total: tagStats.length
        }
      });

    } catch (error) {
      console.error('Get tag stats error:', error);
      
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve tag statistics'
      });
    }
  }}

export const annotationController = new AnnotationController();