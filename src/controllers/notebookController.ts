import { Request, Response } from 'express';
import { notebookModel, CreateNotebookData, UpdateNotebookData, NotebookCompositionItem } from '../models/notebookModel';
import { annotationModel } from '../models/annotationModel';
import { mongoConnection } from '../database/mongodb';
import { KnowledgeElement } from '../types';

export class NotebookController {
  /**
   * Create a new notebook
   */
  async createNotebook(req: Request, res: Response): Promise<void> {
    try {
      const { title, description, templateType, isPublic } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      if (!title || title.trim().length === 0) {
        res.status(400).json({ error: 'Title is required' });
        return;
      }

      const createData: CreateNotebookData = {
        userId,
        title: title.trim(),
        description: description?.trim(),
        templateType,
        isPublic: isPublic || false
      };

      const notebook = await notebookModel.create(createData);

      res.status(201).json({
        success: true,
        data: notebook
      });
    } catch (error) {
      console.error('Error creating notebook:', error);
      res.status(500).json({ error: 'Failed to create notebook' });
    }
  }

  /**
   * Get notebook by ID
   */
  async getNotebook(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const notebook = await notebookModel.findByIdAndUser(id, userId);

      if (!notebook) {
        res.status(404).json({ error: 'Notebook not found' });
        return;
      }

      res.json({
        success: true,
        data: notebook
      });
    } catch (error) {
      console.error('Error getting notebook:', error);
      res.status(500).json({ error: 'Failed to get notebook' });
    }
  }

  /**
   * Get notebook with composition
   */
  async getNotebookWithComposition(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const notebookWithComposition = await notebookModel.getNotebookWithComposition(id, userId);

      if (!notebookWithComposition) {
        res.status(404).json({ error: 'Notebook not found' });
        return;
      }

      res.json({
        success: true,
        data: notebookWithComposition
      });
    } catch (error) {
      console.error('Error getting notebook with composition:', error);
      res.status(500).json({ error: 'Failed to get notebook with composition' });
    }
  }

  /**
   * Get user's notebooks
   */
  async getUserNotebooks(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const { limit = 20, offset = 0, includePublic = false } = req.query;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const result = await notebookModel.findByUser(userId, {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        includePublic: includePublic === 'true'
      });

      res.json({
        success: true,
        data: result.notebooks,
        pagination: {
          total: result.total,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string)
        }
      });
    } catch (error) {
      console.error('Error getting user notebooks:', error);
      res.status(500).json({ error: 'Failed to get notebooks' });
    }
  }

  /**
   * Update notebook
   */
  async updateNotebook(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { title, description, templateType, isPublic } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const updateData: UpdateNotebookData = {};

      if (title !== undefined) {
        if (title.trim().length === 0) {
          res.status(400).json({ error: 'Title cannot be empty' });
          return;
        }
        updateData.title = title.trim();
      }

      if (description !== undefined) {
        updateData.description = description?.trim();
      }

      if (templateType !== undefined) {
        updateData.templateType = templateType;
      }

      if (isPublic !== undefined) {
        updateData.isPublic = isPublic;
      }

      const success = await notebookModel.update(id, userId, updateData);

      if (!success) {
        res.status(404).json({ error: 'Notebook not found or no changes made' });
        return;
      }

      const updatedNotebook = await notebookModel.findByIdAndUser(id, userId);

      res.json({
        success: true,
        data: updatedNotebook
      });
    } catch (error) {
      console.error('Error updating notebook:', error);
      res.status(500).json({ error: 'Failed to update notebook' });
    }
  }

  /**
   * Delete notebook
   */
  async deleteNotebook(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const success = await notebookModel.deleteByIdAndUser(id, userId);

      if (!success) {
        res.status(404).json({ error: 'Notebook not found' });
        return;
      }

      res.json({
        success: true,
        message: 'Notebook deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting notebook:', error);
      res.status(500).json({ error: 'Failed to delete notebook' });
    }
  }

  /**
   * Add element to notebook composition
   */
  async addCompositionItem(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { elementType, elementId, orderIndex, sectionTitle, customContent } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      if (!elementType || !elementId || orderIndex === undefined) {
        res.status(400).json({ error: 'elementType, elementId, and orderIndex are required' });
        return;
      }

      if (!['knowledge_element', 'annotation'].includes(elementType)) {
        res.status(400).json({ error: 'elementType must be either "knowledge_element" or "annotation"' });
        return;
      }

      // Verify element exists and belongs to user
      if (elementType === 'annotation') {
        const annotation = await annotationModel.findByIdAndUser(elementId, userId);
        if (!annotation) {
          res.status(404).json({ error: 'Annotation not found' });
          return;
        }
      } else if (elementType === 'knowledge_element') {
        // Verify knowledge element exists
        const db = mongoConnection.getDb();
        const knowledgeElement = await db.collection('knowledge_elements').findOne({ _id: elementId });
        if (!knowledgeElement) {
          res.status(404).json({ error: 'Knowledge element not found' });
          return;
        }
      }

      const item: NotebookCompositionItem = {
        elementType,
        elementId,
        orderIndex: parseInt(orderIndex),
        sectionTitle,
        customContent
      };

      const compositionItem = await notebookModel.addCompositionItem(id, userId, item);

      if (!compositionItem) {
        res.status(404).json({ error: 'Notebook not found' });
        return;
      }

      res.status(201).json({
        success: true,
        data: compositionItem
      });
    } catch (error) {
      console.error('Error adding composition item:', error);
      res.status(500).json({ error: 'Failed to add composition item' });
    }
  }

  /**
   * Update composition order
   */
  async updateCompositionOrder(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { items } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      if (!Array.isArray(items)) {
        res.status(400).json({ error: 'items must be an array' });
        return;
      }

      // Validate items structure
      for (const item of items) {
        if (!item.id || item.orderIndex === undefined) {
          res.status(400).json({ error: 'Each item must have id and orderIndex' });
          return;
        }
      }

      const success = await notebookModel.updateCompositionOrder(id, userId, items);

      if (!success) {
        res.status(404).json({ error: 'Notebook not found' });
        return;
      }

      res.json({
        success: true,
        message: 'Composition order updated successfully'
      });
    } catch (error) {
      console.error('Error updating composition order:', error);
      res.status(500).json({ error: 'Failed to update composition order' });
    }
  }

  /**
   * Remove composition item
   */
  async removeCompositionItem(req: Request, res: Response): Promise<void> {
    try {
      const { id, compositionId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const success = await notebookModel.removeCompositionItem(id, userId, compositionId);

      if (!success) {
        res.status(404).json({ error: 'Notebook or composition item not found' });
        return;
      }

      res.json({
        success: true,
        message: 'Composition item removed successfully'
      });
    } catch (error) {
      console.error('Error removing composition item:', error);
      res.status(500).json({ error: 'Failed to remove composition item' });
    }
  }

  /**
   * Get notebook composition
   */
  async getComposition(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const composition = await notebookModel.getComposition(id, userId);

      res.json({
        success: true,
        data: composition
      });
    } catch (error) {
      console.error('Error getting composition:', error);
      res.status(500).json({ error: 'Failed to get composition' });
    }
  }

  /**
   * Search notebooks
   */
  async searchNotebooks(req: Request, res: Response): Promise<void> {
    try {
      const { q: searchTerm, limit = 20, offset = 0, includePublic = false } = req.query;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      if (!searchTerm || typeof searchTerm !== 'string') {
        res.status(400).json({ error: 'Search term is required' });
        return;
      }

      const result = await notebookModel.searchByTitle(userId, searchTerm, {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        includePublic: includePublic === 'true'
      });

      res.json({
        success: true,
        data: result.notebooks,
        pagination: {
          total: result.total,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string)
        }
      });
    } catch (error) {
      console.error('Error searching notebooks:', error);
      res.status(500).json({ error: 'Failed to search notebooks' });
    }
  }

  /**
   * Get notebook statistics
   */
  async getNotebookStats(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const stats = await notebookModel.getStatsByUser(userId);

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error getting notebook stats:', error);
      res.status(500).json({ error: 'Failed to get notebook statistics' });
    }
  }

  /**
   * Duplicate notebook
   */
  async duplicateNotebook(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { title } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      if (!title || title.trim().length === 0) {
        res.status(400).json({ error: 'Title is required for duplicated notebook' });
        return;
      }

      const duplicatedNotebook = await notebookModel.duplicate(id, userId, title.trim());

      if (!duplicatedNotebook) {
        res.status(404).json({ error: 'Notebook not found' });
        return;
      }

      res.status(201).json({
        success: true,
        data: duplicatedNotebook
      });
    } catch (error) {
      console.error('Error duplicating notebook:', error);
      res.status(500).json({ error: 'Failed to duplicate notebook' });
    }
  }
}

export const notebookController = new NotebookController();