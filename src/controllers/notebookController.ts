import { Request, Response } from 'express';
import { notebookModel, CreateNotebookData, UpdateNotebookData, NotebookCompositionItem } from '../models/notebookModel';
import { annotationModel } from '../models/annotationModel';
import { mongoConnection } from '../database/mongodb';
import { KnowledgeElement } from '../types';

// Extend Request interface to include user property
declare global {
  namespace Express {
    interface Request {
      user?: { id: string };
    }
  }
}

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
        const { ObjectId } = await import('mongodb');
        let query: any;
        
        // Try to create ObjectId, if it fails, use string query
        try {
          query = { _id: new ObjectId(elementId) };
        } catch {
          query = { _id: elementId };
        }
        
        const knowledgeElement = await db.collection('knowledge_elements').findOne(query);
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

  /**
   * Compile notebook content using synthesis agent
   */
  async compileNotebook(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { formatStyle, includeSourceReferences } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      // Dynamic import to avoid circular dependency
      const { synthesisAgent } = await import('../agents/synthesis');

      const compiledContent = await synthesisAgent.compileNotebook(id, userId, {
        formatStyle,
        includeSourceReferences
      });

      if (!compiledContent) {
        res.status(404).json({ error: 'Notebook not found' });
        return;
      }

      res.json({
        success: true,
        data: compiledContent
      });
    } catch (error) {
      console.error('Error compiling notebook:', error);
      res.status(500).json({ error: 'Failed to compile notebook' });
    }
  }

  /**
   * Generate formatted text from notebook
   */
  async generateFormattedText(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { formatStyle } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      // Dynamic import to avoid circular dependency
      const { synthesisAgent } = await import('../agents/synthesis');

      const compiledContent = await synthesisAgent.compileNotebook(id, userId, {
        formatStyle
      });

      if (!compiledContent) {
        res.status(404).json({ error: 'Notebook not found' });
        return;
      }

      const formattedText = synthesisAgent.generateFormattedText(compiledContent, {
        formatStyle
      });

      res.json({
        success: true,
        data: {
          formattedText,
          metadata: compiledContent.metadata
        }
      });
    } catch (error) {
      console.error('Error generating formatted text:', error);
      res.status(500).json({ error: 'Failed to generate formatted text' });
    }
  }

  /**
   * Get compilation statistics for notebook
   */
  async getCompilationStats(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      // Dynamic import to avoid circular dependency
      const { synthesisAgent } = await import('../agents/synthesis');

      const stats = await synthesisAgent.getCompilationStats(id, userId);

      if (!stats) {
        res.status(404).json({ error: 'Notebook not found' });
        return;
      }

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error getting compilation stats:', error);
      res.status(500).json({ error: 'Failed to get compilation statistics' });
    }
  }

  /**
   * Export notebook to PDF
   */
  async exportToPDF(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const {
        // Compilation options
        formatStyle = 'structured',
        includeSourceReferences = true,
        includeMetadata = true,
        
        // PDF options
        template = 'academic',
        pageSize = 'A4',
        orientation = 'portrait',
        includeTableOfContents = true,
        includePageNumbers = true,
        fontSize = 'medium',
        headerText,
        footerText,
        margins = {
          top: '1in',
          right: '1in',
          bottom: '1in',
          left: '1in'
        }
      } = req.body;

      // Validate template option
      const validTemplates = ['academic', 'modern', 'minimal', 'report'];
      if (!validTemplates.includes(template)) {
        res.status(400).json({ 
          error: `Invalid template. Must be one of: ${validTemplates.join(', ')}` 
        });
        return;
      }

      // Validate page size
      const validPageSizes = ['A4', 'Letter', 'Legal'];
      if (!validPageSizes.includes(pageSize)) {
        res.status(400).json({ 
          error: `Invalid page size. Must be one of: ${validPageSizes.join(', ')}` 
        });
        return;
      }

      // Validate orientation
      const validOrientations = ['portrait', 'landscape'];
      if (!validOrientations.includes(orientation)) {
        res.status(400).json({ 
          error: `Invalid orientation. Must be one of: ${validOrientations.join(', ')}` 
        });
        return;
      }

      // Validate font size
      const validFontSizes = ['small', 'medium', 'large'];
      if (!validFontSizes.includes(fontSize)) {
        res.status(400).json({ 
          error: `Invalid font size. Must be one of: ${validFontSizes.join(', ')}` 
        });
        return;
      }

      // Dynamic import to avoid circular dependency
      const { synthesisAgent } = await import('../agents/synthesis');

      const pdfResult = await synthesisAgent.exportToPDF(
        id,
        userId,
        {
          formatStyle,
          includeSourceReferences,
          includeMetadata,
          sectionSeparator: '\n\n---\n\n'
        },
        {
          template,
          pageSize,
          orientation,
          includeTableOfContents,
          includePageNumbers,
          fontSize,
          headerText,
          footerText,
          margins
        }
      );

      if (!pdfResult) {
        res.status(404).json({ error: 'Notebook not found or failed to generate PDF' });
        return;
      }

      // Set response headers for PDF download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${pdfResult.filename}"`);
      res.setHeader('Content-Length', pdfResult.buffer.length);

      // Send the PDF buffer
      res.send(pdfResult.buffer);

    } catch (error) {
      console.error('Error exporting notebook to PDF:', error);
      res.status(500).json({ error: 'Failed to export notebook to PDF' });
    }
  }
}

export const notebookController = new NotebookController();