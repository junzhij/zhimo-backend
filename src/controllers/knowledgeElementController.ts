import { Request, Response } from 'express';
import { mongoConnection, KnowledgeElement } from '../database/mongodb';
import { ObjectId } from 'mongodb';
import { Logger } from '../utils/logger';

export interface KnowledgeElementFilters {
  document_id?: string;
  agent_type?: 'analysis' | 'extraction' | 'pedagogy';
  element_type?: 'summary' | 'definition' | 'formula' | 'question' | 'entity' | 'topic' | 'flashcard' | 'concept' | 'theorem' | 'relationship';
  tags?: string[];
  created_after?: Date;
  created_before?: Date;
  confidence_score_min?: number;
  confidence_score_max?: number;
}

export interface KnowledgeElementSearchQuery {
  text: string;
  filters?: KnowledgeElementFilters;
  limit?: number;
  skip?: number;
}

class KnowledgeElementController {
  /**
   * GET /api/knowledge-elements
   * Get knowledge elements with filtering and pagination
   */
  async getKnowledgeElements(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      // Parse query parameters
      const {
        document_id,
        agent_type,
        element_type,
        tags,
        created_after,
        created_before,
        confidence_score_min,
        confidence_score_max,
        limit = 50,
        skip = 0,
        sort_by = 'created_at',
        sort_order = 'desc'
      } = req.query;

      // Build filter object
      const filter: any = {
        user_id: userId
      };

      if (document_id) {
        filter.document_id = document_id as string;
      }

      if (agent_type) {
        filter.agent_type = agent_type as KnowledgeElement['agent_type'];
      }

      if (element_type) {
        filter.element_type = element_type as KnowledgeElement['element_type'];
      }

      if (tags) {
        const tagArray = Array.isArray(tags) ? tags : [tags];
        filter.tags = { $in: tagArray };
      }

      // Date range filtering
      if (created_after || created_before) {
        filter.created_at = {};
        if (created_after) {
          filter.created_at.$gte = new Date(created_after as string);
        }
        if (created_before) {
          filter.created_at.$lte = new Date(created_before as string);
        }
      }

      // Confidence score filtering
      if (confidence_score_min !== undefined || confidence_score_max !== undefined) {
        filter.confidence_score = {};
        if (confidence_score_min !== undefined) {
          filter.confidence_score.$gte = parseFloat(confidence_score_min as string);
        }
        if (confidence_score_max !== undefined) {
          filter.confidence_score.$lte = parseFloat(confidence_score_max as string);
        }
      }

      // Build sort object
      const sortOrder = sort_order === 'asc' ? 1 : -1;
      const sort: Record<string, 1 | -1> = {};
      sort[sort_by as string] = sortOrder;

      // Query options
      const options = {
        limit: Math.min(parseInt(limit as string), 100), // Max 100 items per request
        skip: parseInt(skip as string),
        sort
      };

      const knowledgeElements = await mongoConnection.findKnowledgeElements(filter, options);

      // Get total count for pagination
      const totalCount = await mongoConnection.getKnowledgeElementsCollection()
        .countDocuments(filter);

      res.json({
        data: knowledgeElements,
        pagination: {
          total: totalCount,
          limit: options.limit,
          skip: options.skip,
          hasMore: options.skip + knowledgeElements.length < totalCount
        }
      });

    } catch (error) {
      Logger.error('Error getting knowledge elements:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * POST /api/knowledge-elements/search
   * Search knowledge elements by text content
   */
  async searchKnowledgeElements(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const { text, filters = {}, limit = 50, skip = 0 }: KnowledgeElementSearchQuery = req.body;

      if (!text || text.trim().length === 0) {
        res.status(400).json({ error: 'Search text is required' });
        return;
      }

      // Build search filter
      const searchFilter: any = {
        user_id: userId,
        ...filters
      };

      // Handle tags filter
      if (filters.tags && filters.tags.length > 0) {
        searchFilter.tags = { $in: filters.tags };
      }

      // Handle date range filters
      if (filters.created_after || filters.created_before) {
        searchFilter.created_at = {};
        if (filters.created_after) {
          searchFilter.created_at.$gte = filters.created_after;
        }
        if (filters.created_before) {
          searchFilter.created_at.$lte = filters.created_before;
        }
      }

      // Handle confidence score filters
      if (filters.confidence_score_min !== undefined || filters.confidence_score_max !== undefined) {
        searchFilter.confidence_score = {};
        if (filters.confidence_score_min !== undefined) {
          searchFilter.confidence_score.$gte = filters.confidence_score_min;
        }
        if (filters.confidence_score_max !== undefined) {
          searchFilter.confidence_score.$lte = filters.confidence_score_max;
        }
      }

      const results = await mongoConnection.searchKnowledgeElements(text, searchFilter);

      // Apply pagination to results
      const paginatedResults = results.slice(skip, skip + limit);

      res.json({
        data: paginatedResults,
        pagination: {
          total: results.length,
          limit,
          skip,
          hasMore: skip + paginatedResults.length < results.length
        },
        searchQuery: text
      });

    } catch (error) {
      Logger.error('Error searching knowledge elements:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * GET /api/knowledge-elements/:id
   * Get a specific knowledge element by ID
   */
  async getKnowledgeElement(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        res.status(400).json({ error: 'Invalid knowledge element ID' });
        return;
      }

      const collection = mongoConnection.getKnowledgeElementsCollection();
      const knowledgeElement = await collection.findOne({
        _id: new ObjectId(id) as any,
        user_id: userId
      });

      if (!knowledgeElement) {
        res.status(404).json({ error: 'Knowledge element not found' });
        return;
      }

      res.json(knowledgeElement);

    } catch (error) {
      Logger.error('Error getting knowledge element:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * POST /api/knowledge-elements
   * Create a new knowledge element
   */
  async createKnowledgeElement(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const {
        document_id,
        agent_type,
        element_type,
        content,
        source_location,
        tags = [],
        confidence_score
      } = req.body;

      // Validate required fields
      if (!document_id || !agent_type || !element_type || !content) {
        res.status(400).json({ 
          error: 'Missing required fields: document_id, agent_type, element_type, content' 
        });
        return;
      }

      // Validate content structure
      if (!content.title || !content.body) {
        res.status(400).json({ 
          error: 'Content must include title and body' 
        });
        return;
      }

      const knowledgeElementData: Omit<KnowledgeElement, '_id' | 'created_at' | 'updated_at'> = {
        document_id,
        agent_type,
        element_type,
        content,
        source_location: source_location || {},
        tags: Array.isArray(tags) ? tags : [],
        user_id: userId,
        ...(confidence_score !== undefined && { confidence_score })
      };

      const elementId = await mongoConnection.insertKnowledgeElement(knowledgeElementData);

      res.status(201).json({
        id: elementId,
        message: 'Knowledge element created successfully'
      });

    } catch (error) {
      Logger.error('Error creating knowledge element:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * PUT /api/knowledge-elements/:id
   * Update a knowledge element
   */
  async updateKnowledgeElement(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        res.status(400).json({ error: 'Invalid knowledge element ID' });
        return;
      }

      const {
        content,
        tags,
        confidence_score
      } = req.body;

      const updateData: Partial<KnowledgeElement> = {
        updated_at: new Date()
      };

      if (content) {
        if (!content.title || !content.body) {
          res.status(400).json({ 
            error: 'Content must include title and body' 
          });
          return;
        }
        updateData.content = content;
      }

      if (tags !== undefined) {
        updateData.tags = Array.isArray(tags) ? tags : [];
      }

      if (confidence_score !== undefined) {
        updateData.confidence_score = confidence_score;
      }

      const collection = mongoConnection.getKnowledgeElementsCollection();
      const result = await collection.updateOne(
        { _id: new ObjectId(id) as any, user_id: userId },
        { $set: updateData }
      );

      if (result.matchedCount === 0) {
        res.status(404).json({ error: 'Knowledge element not found' });
        return;
      }

      res.json({ message: 'Knowledge element updated successfully' });

    } catch (error) {
      Logger.error('Error updating knowledge element:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * DELETE /api/knowledge-elements/:id
   * Delete a knowledge element
   */
  async deleteKnowledgeElement(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        res.status(400).json({ error: 'Invalid knowledge element ID' });
        return;
      }

      const collection = mongoConnection.getKnowledgeElementsCollection();
      const result = await collection.deleteOne({
        _id: new ObjectId(id) as any,
        user_id: userId
      });

      if (result.deletedCount === 0) {
        res.status(404).json({ error: 'Knowledge element not found' });
        return;
      }

      res.json({ message: 'Knowledge element deleted successfully' });

    } catch (error) {
      Logger.error('Error deleting knowledge element:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * GET /api/knowledge-elements/stats
   * Get knowledge element statistics for the user
   */
  async getKnowledgeElementStats(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const collection = mongoConnection.getKnowledgeElementsCollection();

      // Get total count
      const totalCount = await collection.countDocuments({ user_id: userId });

      // Get counts by agent type
      const agentTypeStats = await collection.aggregate([
        { $match: { user_id: userId } },
        { $group: { _id: '$agent_type', count: { $sum: 1 } } }
      ]).toArray();

      // Get counts by element type
      const elementTypeStats = await collection.aggregate([
        { $match: { user_id: userId } },
        { $group: { _id: '$element_type', count: { $sum: 1 } } }
      ]).toArray();

      // Get recent activity (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const recentCount = await collection.countDocuments({
        user_id: userId,
        created_at: { $gte: sevenDaysAgo }
      });

      res.json({
        total: totalCount,
        recent: recentCount,
        byAgentType: agentTypeStats.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {} as Record<string, number>),
        byElementType: elementTypeStats.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {} as Record<string, number>)
      });

    } catch (error) {
      Logger.error('Error getting knowledge element stats:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

export const knowledgeElementController = new KnowledgeElementController();