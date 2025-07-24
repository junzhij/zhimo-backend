import { mysqlConnection } from '../database/mysql';
import { ReviewNotebook, NotebookComposition } from '../types';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';

export interface CreateNotebookData {
  userId: string;
  title: string;
  description?: string;
  templateType?: string;
  isPublic?: boolean;
}

export interface UpdateNotebookData {
  title?: string;
  description?: string;
  templateType?: string;
  isPublic?: boolean;
}

export interface NotebookCompositionItem {
  elementType: 'knowledge_element' | 'annotation';
  elementId: string;
  orderIndex: number;
  sectionTitle?: string;
  customContent?: string;
}

export interface NotebookWithComposition extends ReviewNotebook {
  composition: NotebookComposition[];
}

export class NotebookModel {
  /**
   * Helper method to map database row to ReviewNotebook object
   */
  private mapRowToNotebook(row: any): ReviewNotebook {
    return {
      id: row.id,
      user_id: row.user_id,
      title: row.title,
      description: row.description,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  /**
   * Helper method to map database row to NotebookComposition object
   */
  private mapRowToComposition(row: any): NotebookComposition {
    return {
      id: row.id,
      notebook_id: row.notebook_id,
      element_type: row.element_type,
      element_id: row.element_id,
      order_index: row.order_index
    };
  }

  /**
   * Create a new notebook
   */
  async create(data: CreateNotebookData): Promise<ReviewNotebook> {
    const notebookId = uuidv4();
    const now = new Date();

    const insertQuery = `
      INSERT INTO review_notebooks (
        id, user_id, title, description, template_type, is_public, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await mysqlConnection.executeQuery(insertQuery, [
      notebookId,
      data.userId,
      data.title,
      data.description || null,
      data.templateType || 'default',
      data.isPublic || false,
      now,
      now
    ]);

    return {
      id: notebookId,
      user_id: data.userId,
      title: data.title,
      description: data.description,
      created_at: now,
      updated_at: now
    };
  }

  /**
   * Find notebook by ID and user ID
   */
  async findByIdAndUser(notebookId: string, userId: string): Promise<ReviewNotebook | null> {
    const selectQuery = `
      SELECT id, user_id, title, description, template_type, is_public, created_at, updated_at
      FROM review_notebooks 
      WHERE id = ? AND user_id = ?
    `;

    const results = await mysqlConnection.executeQuery<RowDataPacket[]>(selectQuery, [notebookId, userId]);

    if (!results || results.length === 0) {
      return null;
    }

    return this.mapRowToNotebook(results[0]);
  }

  /**
   * Find notebook by ID (without user restriction - for internal use)
   */
  async findById(notebookId: string): Promise<ReviewNotebook | null> {
    const selectQuery = `
      SELECT id, user_id, title, description, template_type, is_public, created_at, updated_at
      FROM review_notebooks 
      WHERE id = ?
    `;

    const results = await mysqlConnection.executeQuery<RowDataPacket[]>(selectQuery, [notebookId]);

    if (!results || results.length === 0) {
      return null;
    }

    return this.mapRowToNotebook(results[0]);
  }

  /**
   * Find notebooks by user with pagination
   */
  async findByUser(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      includePublic?: boolean;
    } = {}
  ): Promise<{ notebooks: ReviewNotebook[]; total: number }> {
    let whereClause = 'WHERE user_id = ?';
    const params: any[] = [userId];

    if (options.includePublic) {
      whereClause += ' OR is_public = TRUE';
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM review_notebooks ${whereClause}`;
    const countResults = await mysqlConnection.executeQuery<RowDataPacket[]>(countQuery, [...params]);
    const total = countResults[0].total;

    // Get notebooks
    let selectQuery = `
      SELECT id, user_id, title, description, template_type, is_public, created_at, updated_at
      FROM review_notebooks 
      ${whereClause}
      ORDER BY updated_at DESC
    `;

    if (options.limit) {
      selectQuery += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options.offset) {
      selectQuery += ' OFFSET ?';
      params.push(options.offset);
    }

    const results = await mysqlConnection.executeQuery<RowDataPacket[]>(selectQuery, params);
    const notebooks = results.map(row => this.mapRowToNotebook(row));

    return { notebooks, total };
  }

  /**
   * Update notebook
   */
  async update(notebookId: string, userId: string, data: UpdateNotebookData): Promise<boolean> {
    const updateFields: string[] = [];
    const params: any[] = [];

    if (data.title !== undefined) {
      updateFields.push('title = ?');
      params.push(data.title);
    }

    if (data.description !== undefined) {
      updateFields.push('description = ?');
      params.push(data.description);
    }

    if (data.templateType !== undefined) {
      updateFields.push('template_type = ?');
      params.push(data.templateType);
    }

    if (data.isPublic !== undefined) {
      updateFields.push('is_public = ?');
      params.push(data.isPublic);
    }

    if (updateFields.length === 0) {
      return false;
    }

    updateFields.push('updated_at = NOW()');

    const updateQuery = `
      UPDATE review_notebooks 
      SET ${updateFields.join(', ')}
      WHERE id = ? AND user_id = ?
    `;

    params.push(notebookId, userId);

    const result = await mysqlConnection.executeQuery<ResultSetHeader>(updateQuery, params);
    return result.affectedRows > 0;
  }

  /**
   * Delete notebook by ID and user ID
   */
  async deleteByIdAndUser(notebookId: string, userId: string): Promise<boolean> {
    return await mysqlConnection.executeTransaction(async (connection) => {
      // Delete composition items first (foreign key constraint)
      await connection.execute('DELETE FROM notebook_composition WHERE notebook_id = ?', [notebookId]);
      
      // Delete the notebook
      const [result] = await connection.execute(
        'DELETE FROM review_notebooks WHERE id = ? AND user_id = ?', 
        [notebookId, userId]
      ) as [ResultSetHeader, any];
      
      return result.affectedRows > 0;
    });
  }

  /**
   * Add element to notebook composition
   */
  async addCompositionItem(
    notebookId: string, 
    userId: string, 
    item: NotebookCompositionItem
  ): Promise<NotebookComposition | null> {
    // Verify notebook belongs to user
    const notebook = await this.findByIdAndUser(notebookId, userId);
    if (!notebook) {
      return null;
    }

    const compositionId = uuidv4();
    const now = new Date();

    const insertQuery = `
      INSERT INTO notebook_composition (
        id, notebook_id, element_type, element_id, order_index, 
        section_title, custom_content, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await mysqlConnection.executeQuery(insertQuery, [
      compositionId,
      notebookId,
      item.elementType,
      item.elementId,
      item.orderIndex,
      item.sectionTitle || null,
      item.customContent || null,
      now,
      now
    ]);

    return {
      id: compositionId,
      notebook_id: notebookId,
      element_type: item.elementType,
      element_id: item.elementId,
      order_index: item.orderIndex
    };
  }

  /**
   * Update composition item order
   */
  async updateCompositionOrder(
    notebookId: string,
    userId: string,
    items: Array<{ id: string; orderIndex: number }>
  ): Promise<boolean> {
    // Verify notebook belongs to user
    const notebook = await this.findByIdAndUser(notebookId, userId);
    if (!notebook) {
      return false;
    }

    return await mysqlConnection.executeTransaction(async (connection) => {
      for (const item of items) {
        await connection.execute(
          'UPDATE notebook_composition SET order_index = ?, updated_at = NOW() WHERE id = ? AND notebook_id = ?',
          [item.orderIndex, item.id, notebookId]
        );
      }
      return true;
    });
  }

  /**
   * Remove element from notebook composition
   */
  async removeCompositionItem(
    notebookId: string, 
    userId: string, 
    compositionId: string
  ): Promise<boolean> {
    // Verify notebook belongs to user
    const notebook = await this.findByIdAndUser(notebookId, userId);
    if (!notebook) {
      return false;
    }

    const deleteQuery = 'DELETE FROM notebook_composition WHERE id = ? AND notebook_id = ?';
    const result = await mysqlConnection.executeQuery<ResultSetHeader>(deleteQuery, [compositionId, notebookId]);
    return result.affectedRows > 0;
  }

  /**
   * Get notebook composition
   */
  async getComposition(notebookId: string, userId: string): Promise<NotebookComposition[]> {
    // Verify notebook belongs to user
    const notebook = await this.findByIdAndUser(notebookId, userId);
    if (!notebook) {
      return [];
    }

    const selectQuery = `
      SELECT id, notebook_id, element_type, element_id, order_index, 
             section_title, custom_content, created_at, updated_at
      FROM notebook_composition 
      WHERE notebook_id = ?
      ORDER BY order_index ASC
    `;

    const results = await mysqlConnection.executeQuery<RowDataPacket[]>(selectQuery, [notebookId]);
    return results.map(row => this.mapRowToComposition(row));
  }

  /**
   * Get notebook with its composition
   */
  async getNotebookWithComposition(notebookId: string, userId: string): Promise<NotebookWithComposition | null> {
    const notebook = await this.findByIdAndUser(notebookId, userId);
    if (!notebook) {
      return null;
    }

    const composition = await this.getComposition(notebookId, userId);

    return {
      ...notebook,
      composition
    };
  }

  /**
   * Search notebooks by title
   */
  async searchByTitle(
    userId: string,
    searchTerm: string,
    options: {
      limit?: number;
      offset?: number;
      includePublic?: boolean;
    } = {}
  ): Promise<{ notebooks: ReviewNotebook[]; total: number }> {
    let whereClause = 'WHERE (user_id = ? AND title LIKE ?)';
    const params: any[] = [userId, `%${searchTerm}%`];

    if (options.includePublic) {
      whereClause += ' OR (is_public = TRUE AND title LIKE ?)';
      params.push(`%${searchTerm}%`);
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM review_notebooks ${whereClause}`;
    const countResults = await mysqlConnection.executeQuery<RowDataPacket[]>(countQuery, [...params]);
    const total = countResults[0].total;

    // Get notebooks
    let selectQuery = `
      SELECT id, user_id, title, description, template_type, is_public, created_at, updated_at
      FROM review_notebooks 
      ${whereClause}
      ORDER BY 
        CASE WHEN user_id = ? THEN 0 ELSE 1 END,
        updated_at DESC
    `;

    params.push(userId); // For ordering user's notebooks first

    if (options.limit) {
      selectQuery += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options.offset) {
      selectQuery += ' OFFSET ?';
      params.push(options.offset);
    }

    const results = await mysqlConnection.executeQuery<RowDataPacket[]>(selectQuery, params);
    const notebooks = results.map(row => this.mapRowToNotebook(row));

    return { notebooks, total };
  }

  /**
   * Get notebook statistics for a user
   */
  async getStatsByUser(userId: string): Promise<{
    total: number;
    totalElements: number;
    averageElementsPerNotebook: number;
    recentActivity: Date | null;
  }> {
    const statsQuery = `
      SELECT 
        COUNT(DISTINCT rn.id) as total_notebooks,
        COUNT(nc.id) as total_elements,
        MAX(rn.updated_at) as recent_activity
      FROM review_notebooks rn
      LEFT JOIN notebook_composition nc ON rn.id = nc.notebook_id
      WHERE rn.user_id = ?
    `;

    const results = await mysqlConnection.executeQuery<RowDataPacket[]>(statsQuery, [userId]);
    const stats = results[0];

    const total = stats.total_notebooks || 0;
    const totalElements = stats.total_elements || 0;
    const averageElementsPerNotebook = total > 0 ? Math.round(totalElements / total * 100) / 100 : 0;

    return {
      total,
      totalElements,
      averageElementsPerNotebook,
      recentActivity: stats.recent_activity
    };
  }

  /**
   * Duplicate notebook (copy with new title)
   */
  async duplicate(
    notebookId: string, 
    userId: string, 
    newTitle: string
  ): Promise<ReviewNotebook | null> {
    const originalNotebook = await this.findByIdAndUser(notebookId, userId);
    if (!originalNotebook) {
      return null;
    }

    return await mysqlConnection.executeTransaction(async (connection) => {
      // Create new notebook
      const newNotebookId = uuidv4();
      const now = new Date();

      await connection.execute(`
        INSERT INTO review_notebooks (
          id, user_id, title, description, template_type, is_public, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        newNotebookId,
        userId,
        newTitle,
        originalNotebook.description,
        'default', // Reset template type
        false, // Reset public flag
        now,
        now
      ]);

      // Copy composition
      await connection.execute(`
        INSERT INTO notebook_composition (
          id, notebook_id, element_type, element_id, order_index, 
          section_title, custom_content, created_at, updated_at
        )
        SELECT 
          UUID(), ?, element_type, element_id, order_index,
          section_title, custom_content, ?, ?
        FROM notebook_composition 
        WHERE notebook_id = ?
      `, [newNotebookId, now, now, notebookId]);

      return {
        id: newNotebookId,
        user_id: userId,
        title: newTitle,
        description: originalNotebook.description,
        created_at: now,
        updated_at: now
      };
    });
  }
}

export const notebookModel = new NotebookModel();