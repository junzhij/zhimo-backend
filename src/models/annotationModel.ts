import { mysqlConnection } from '../database/mysql';
import { Annotation } from '../types';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';

export type AnnotationType = 'highlight' | 'note' | 'bookmark';

export interface CreateAnnotationData {
  userId: string;
  documentId: string;
  annotationType: AnnotationType;
  content: string;
  positionData: any;
  color?: string;
  tags?: string[];
}

export interface UpdateAnnotationData {
  content?: string;
  positionData?: any;
  color?: string;
  tags?: string[];
}

export interface AnnotationSearchOptions {
  content?: string;
  annotationType?: AnnotationType;
  documentId?: string;
  startDate?: Date;
  endDate?: Date;
  tags?: string[];
  limit?: number;
  offset?: number;
}

export class AnnotationModel {
  /**
   * Helper method to map database row to Annotation object
   */
  private mapRowToAnnotation(row: any): Annotation {
    return {
      id: row.id,
      user_id: row.user_id,
      document_id: row.document_id,
      annotation_type: row.annotation_type,
      content: row.content,
      position_data: row.position_data ? JSON.parse(row.position_data) : null,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  /**
   * Create a new annotation
   */
  async create(data: CreateAnnotationData): Promise<Annotation> {
    const annotationId = uuidv4();
    const now = new Date();

    const insertQuery = `
      INSERT INTO annotations (
        id, user_id, document_id, annotation_type, content, 
        position_data, color, tags, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await mysqlConnection.executeQuery(insertQuery, [
      annotationId,
      data.userId,
      data.documentId,
      data.annotationType,
      data.content,
      JSON.stringify(data.positionData),
      data.color || '#ffff00',
      data.tags ? JSON.stringify(data.tags) : null,
      now,
      now
    ]);

    return {
      id: annotationId,
      user_id: data.userId,
      document_id: data.documentId,
      annotation_type: data.annotationType,
      content: data.content,
      position_data: data.positionData,
      created_at: now,
      updated_at: now
    };
  }

  /**
   * Find annotation by ID and user ID
   */
  async findByIdAndUser(annotationId: string, userId: string): Promise<Annotation | null> {
    const selectQuery = `
      SELECT id, user_id, document_id, annotation_type, content, 
             position_data, color, tags, created_at, updated_at
      FROM annotations 
      WHERE id = ? AND user_id = ?
    `;

    const results = await mysqlConnection.executeQuery<RowDataPacket[]>(selectQuery, [annotationId, userId]);

    if (!results || results.length === 0) {
      return null;
    }

    return this.mapRowToAnnotation(results[0]);
  }

  /**
   * Find annotations by document ID and user ID
   */
  async findByDocumentAndUser(
    documentId: string, 
    userId: string, 
    annotationType?: AnnotationType
  ): Promise<Annotation[]> {
    let selectQuery = `
      SELECT id, user_id, document_id, annotation_type, content, 
             position_data, color, tags, created_at, updated_at
      FROM annotations 
      WHERE document_id = ? AND user_id = ?
    `;

    const params: any[] = [documentId, userId];

    if (annotationType) {
      selectQuery += ' AND annotation_type = ?';
      params.push(annotationType);
    }

    selectQuery += ' ORDER BY created_at ASC';

    const results = await mysqlConnection.executeQuery<RowDataPacket[]>(selectQuery, params);

    return results.map(row => this.mapRowToAnnotation(row));
  }

  /**
   * Find annotations by user with optional filters
   */
  async findByUser(
    userId: string, 
    options: AnnotationSearchOptions = {}
  ): Promise<{ annotations: Annotation[]; total: number }> {
    let whereClause = 'WHERE user_id = ?';
    const params: any[] = [userId];

    // Build where clause based on search options
    if (options.documentId) {
      whereClause += ' AND document_id = ?';
      params.push(options.documentId);
    }

    if (options.annotationType) {
      whereClause += ' AND annotation_type = ?';
      params.push(options.annotationType);
    }

    if (options.content) {
      whereClause += ' AND content LIKE ?';
      params.push(`%${options.content}%`);
    }

    if (options.startDate) {
      whereClause += ' AND created_at >= ?';
      params.push(options.startDate);
    }

    if (options.endDate) {
      whereClause += ' AND created_at <= ?';
      params.push(options.endDate);
    }

    if (options.tags && options.tags.length > 0) {
      // Use JSON_OVERLAPS to check if any of the provided tags exist in the annotation tags
      whereClause += ' AND JSON_OVERLAPS(tags, ?)';
      params.push(JSON.stringify(options.tags));
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM annotations ${whereClause}`;
    const countResults = await mysqlConnection.executeQuery<RowDataPacket[]>(countQuery, [...params]);
    const total = countResults[0].total;

    // Get annotations
    let selectQuery = `
      SELECT id, user_id, document_id, annotation_type, content, 
             position_data, color, tags, created_at, updated_at
      FROM annotations 
      ${whereClause}
      ORDER BY created_at DESC
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

    const annotations = results.map(row => this.mapRowToAnnotation(row));

    return { annotations, total };
  }

  /**
   * Update annotation
   */
  async update(annotationId: string, userId: string, data: UpdateAnnotationData): Promise<boolean> {
    const updateFields: string[] = [];
    const params: any[] = [];

    if (data.content !== undefined) {
      updateFields.push('content = ?');
      params.push(data.content);
    }

    if (data.positionData !== undefined) {
      updateFields.push('position_data = ?');
      params.push(JSON.stringify(data.positionData));
    }

    if (data.color !== undefined) {
      updateFields.push('color = ?');
      params.push(data.color);
    }

    if (data.tags !== undefined) {
      updateFields.push('tags = ?');
      params.push(data.tags ? JSON.stringify(data.tags) : null);
    }

    if (updateFields.length === 0) {
      return false;
    }

    updateFields.push('updated_at = NOW()');

    const updateQuery = `
      UPDATE annotations 
      SET ${updateFields.join(', ')}
      WHERE id = ? AND user_id = ?
    `;

    params.push(annotationId, userId);

    const result = await mysqlConnection.executeQuery<ResultSetHeader>(updateQuery, params);
    return result.affectedRows > 0;
  }

  /**
   * Delete annotation by ID and user ID
   */
  async deleteByIdAndUser(annotationId: string, userId: string): Promise<boolean> {
    const deleteQuery = 'DELETE FROM annotations WHERE id = ? AND user_id = ?';
    const result = await mysqlConnection.executeQuery<ResultSetHeader>(deleteQuery, [annotationId, userId]);
    return result.affectedRows > 0;
  }

  /**
   * Delete all annotations for a document by user
   */
  async deleteByDocumentAndUser(documentId: string, userId: string): Promise<number> {
    const deleteQuery = 'DELETE FROM annotations WHERE document_id = ? AND user_id = ?';
    const result = await mysqlConnection.executeQuery<ResultSetHeader>(deleteQuery, [documentId, userId]);
    return result.affectedRows;
  }

  /**
   * Get annotation statistics for a user
   */
  async getStatsByUser(userId: string): Promise<{
    total: number;
    byType: Record<AnnotationType, number>;
    byDocument: Array<{ documentId: string; count: number }>;
  }> {
    // Get total count and count by type
    const typeStatsQuery = `
      SELECT 
        annotation_type,
        COUNT(*) as count
      FROM annotations 
      WHERE user_id = ?
      GROUP BY annotation_type
    `;

    const typeResults = await mysqlConnection.executeQuery<RowDataPacket[]>(typeStatsQuery, [userId]);

    const byType: Record<AnnotationType, number> = {
      highlight: 0,
      note: 0,
      bookmark: 0
    };

    let total = 0;
    typeResults.forEach(row => {
      const type = row.annotation_type as AnnotationType;
      const count = row.count;
      byType[type] = count;
      total += count;
    });

    // Get count by document
    const documentStatsQuery = `
      SELECT 
        document_id,
        COUNT(*) as count
      FROM annotations 
      WHERE user_id = ?
      GROUP BY document_id
      ORDER BY count DESC
      LIMIT 10
    `;

    const documentResults = await mysqlConnection.executeQuery<RowDataPacket[]>(documentStatsQuery, [userId]);

    const byDocument = documentResults.map(row => ({
      documentId: row.document_id,
      count: row.count
    }));

    return { total, byType, byDocument };
  }

  /**
   * Search annotations by content with full-text search capabilities
   */
  async searchByContent(
    userId: string, 
    searchTerm: string, 
    options: {
      documentId?: string;
      annotationType?: AnnotationType;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ annotations: Annotation[]; total: number }> {
    let whereClause = 'WHERE user_id = ? AND content LIKE ?';
    const params: any[] = [userId, `%${searchTerm}%`];

    if (options.documentId) {
      whereClause += ' AND document_id = ?';
      params.push(options.documentId);
    }

    if (options.annotationType) {
      whereClause += ' AND annotation_type = ?';
      params.push(options.annotationType);
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM annotations ${whereClause}`;
    const countResults = await mysqlConnection.executeQuery<RowDataPacket[]>(countQuery, [...params]);
    const total = countResults[0].total;

    // Get annotations with relevance scoring
    let selectQuery = `
      SELECT id, user_id, document_id, annotation_type, content, 
             position_data, color, tags, created_at, updated_at,
             CASE 
               WHEN content LIKE ? THEN 3
               WHEN content LIKE ? THEN 2
               ELSE 1
             END as relevance_score
      FROM annotations 
      ${whereClause}
      ORDER BY relevance_score DESC, created_at DESC
    `;

    // Add relevance parameters (exact match gets higher score)
    const searchParams = [`%${searchTerm}%`, `${searchTerm}%`, ...params];

    if (options.limit) {
      selectQuery += ' LIMIT ?';
      searchParams.push(options.limit);
    }

    if (options.offset) {
      selectQuery += ' OFFSET ?';
      searchParams.push(options.offset);
    }

    const results = await mysqlConnection.executeQuery<RowDataPacket[]>(selectQuery, searchParams);

    const annotations = results.map(row => this.mapRowToAnnotation(row));

    return { annotations, total };
  }

  /**
   * Get recent annotations for a user
   */
  async getRecentByUser(userId: string, limit: number = 10): Promise<Annotation[]> {
    const selectQuery = `
      SELECT id, user_id, document_id, annotation_type, content, 
             position_data, color, tags, created_at, updated_at
      FROM annotations 
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `;

    const results = await mysqlConnection.executeQuery<RowDataPacket[]>(selectQuery, [userId, limit]);

    return results.map(row => this.mapRowToAnnotation(row));
  }

  /**
   * Get all unique tags used by a user
   */
  async getTagsByUser(userId: string): Promise<string[]> {
    const query = `
      SELECT DISTINCT JSON_UNQUOTE(JSON_EXTRACT(tags, CONCAT('$[', idx.idx, ']'))) as tag
      FROM annotations
      CROSS JOIN (
        SELECT 0 as idx UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 
        UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9
      ) idx
      WHERE user_id = ? 
        AND tags IS NOT NULL 
        AND JSON_LENGTH(tags) > idx.idx
        AND JSON_UNQUOTE(JSON_EXTRACT(tags, CONCAT('$[', idx.idx, ']'))) IS NOT NULL
      ORDER BY tag
    `;

    const results = await mysqlConnection.executeQuery<RowDataPacket[]>(query, [userId]);
    return results.map(row => row.tag).filter(tag => tag && tag.trim() !== '');
  }

  /**
   * Get annotations by specific tags
   */
  async findByTags(
    userId: string, 
    tags: string[], 
    options: {
      matchAll?: boolean; // true = AND logic, false = OR logic
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ annotations: Annotation[]; total: number }> {
    const matchAll = options.matchAll || false;
    
    let whereClause = 'WHERE user_id = ?';
    const params: any[] = [userId];

    if (tags.length > 0) {
      if (matchAll) {
        // All tags must be present (AND logic)
        tags.forEach(tag => {
          whereClause += ' AND JSON_CONTAINS(tags, ?)';
          params.push(JSON.stringify(tag));
        });
      } else {
        // Any tag can be present (OR logic)
        whereClause += ' AND JSON_OVERLAPS(tags, ?)';
        params.push(JSON.stringify(tags));
      }
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM annotations ${whereClause}`;
    const countResults = await mysqlConnection.executeQuery<RowDataPacket[]>(countQuery, [...params]);
    const total = countResults[0].total;

    // Get annotations
    let selectQuery = `
      SELECT id, user_id, document_id, annotation_type, content, 
             position_data, color, tags, created_at, updated_at
      FROM annotations 
      ${whereClause}
      ORDER BY created_at DESC
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
    const annotations = results.map(row => this.mapRowToAnnotation(row));

    return { annotations, total };
  }

  /**
   * Get tag usage statistics for a user
   */
  async getTagStats(userId: string): Promise<Array<{ tag: string; count: number }>> {
    const query = `
      SELECT 
        JSON_UNQUOTE(JSON_EXTRACT(tags, CONCAT('$[', idx.idx, ']'))) as tag,
        COUNT(*) as count
      FROM annotations
      CROSS JOIN (
        SELECT 0 as idx UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 
        UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9
      ) idx
      WHERE user_id = ? 
        AND tags IS NOT NULL 
        AND JSON_LENGTH(tags) > idx.idx
        AND JSON_UNQUOTE(JSON_EXTRACT(tags, CONCAT('$[', idx.idx, ']'))) IS NOT NULL
      GROUP BY tag
      ORDER BY count DESC, tag ASC
    `;

    const results = await mysqlConnection.executeQuery<RowDataPacket[]>(query, [userId]);
    return results
      .map(row => ({ tag: row.tag, count: row.count }))
      .filter(item => item.tag && item.tag.trim() !== '');
  }
}

export const annotationModel = new AnnotationModel();