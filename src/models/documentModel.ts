import { mysqlConnection } from '../database/mysql';
import { Document } from '../types';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';

export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface DocumentMetadata {
  mimeType?: string;
  s3Bucket?: string;
  s3ETag?: string;
  uploadLocation?: string;
  processingSteps?: {
    ingestion?: { status: ProcessingStatus; timestamp?: Date; error?: string };
    analysis?: { status: ProcessingStatus; timestamp?: Date; error?: string };
    extraction?: { status: ProcessingStatus; timestamp?: Date; error?: string };
    pedagogy?: { status: ProcessingStatus; timestamp?: Date; error?: string };
  };
  extractedContent?: {
    textLength?: number;
    pageCount?: number;
    language?: string;
    encoding?: string;
  };
  processingMetrics?: {
    startTime?: Date;
    endTime?: Date;
    duration?: number;
    agentsUsed?: string[];
  };
  [key: string]: any;
}

export interface CreateDocumentData {
  userId: string;
  originalName: string;
  fileType: string;
  fileSize: number;
  s3Path: string;
  metadata?: DocumentMetadata;
}

export interface UpdateDocumentData {
  processingStatus?: ProcessingStatus;
  processedTimestamp?: Date;
  metadata?: DocumentMetadata;
}

export class DocumentModel {
  /**
   * Create a new document record
   */
  async create(data: CreateDocumentData): Promise<Document> {
    const documentId = uuidv4();
    const now = new Date();

    const insertQuery = `
      INSERT INTO documents (
        id, user_id, original_name, file_type, file_size, s3_path, 
        processing_status, upload_timestamp, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const metadata = data.metadata || {};
    
    await mysqlConnection.executeQuery(insertQuery, [
      documentId,
      data.userId,
      data.originalName,
      data.fileType,
      data.fileSize,
      data.s3Path,
      'pending',
      now,
      JSON.stringify(metadata),
      now,
      now
    ]);

    return {
      id: documentId,
      user_id: data.userId,
      original_name: data.originalName,
      file_type: data.fileType,
      file_size: data.fileSize,
      s3_path: data.s3Path,
      processing_status: 'pending',
      upload_timestamp: now,
      metadata
    };
  }

  /**
   * Find document by ID and user ID
   */
  async findByIdAndUser(documentId: string, userId: string): Promise<Document | null> {
    const selectQuery = `
      SELECT id, user_id, original_name, file_type, file_size, s3_path, 
             processing_status, upload_timestamp, processed_timestamp, metadata
      FROM documents 
      WHERE id = ? AND user_id = ?
    `;

    const results = await mysqlConnection.executeQuery<RowDataPacket[]>(selectQuery, [documentId, userId]);

    if (!results || results.length === 0) {
      return null;
    }

    const row = results[0];
    return {
      id: row.id,
      user_id: row.user_id,
      original_name: row.original_name,
      file_type: row.file_type,
      file_size: row.file_size,
      s3_path: row.s3_path,
      processing_status: row.processing_status,
      upload_timestamp: row.upload_timestamp,
      processed_timestamp: row.processed_timestamp,
      metadata: row.metadata ? JSON.parse(row.metadata) : null
    };
  }

  /**
   * Find document by ID (without user restriction - for internal use)
   */
  async findById(documentId: string): Promise<Document | null> {
    const selectQuery = `
      SELECT id, user_id, original_name, file_type, file_size, s3_path, 
             processing_status, upload_timestamp, processed_timestamp, metadata
      FROM documents 
      WHERE id = ?
    `;

    const results = await mysqlConnection.executeQuery<RowDataPacket[]>(selectQuery, [documentId]);

    if (!results || results.length === 0) {
      return null;
    }

    const row = results[0];
    return {
      id: row.id,
      user_id: row.user_id,
      original_name: row.original_name,
      file_type: row.file_type,
      file_size: row.file_size,
      s3_path: row.s3_path,
      processing_status: row.processing_status,
      upload_timestamp: row.upload_timestamp,
      processed_timestamp: row.processed_timestamp,
      metadata: row.metadata ? JSON.parse(row.metadata) : null
    };
  }

  /**
   * Update document processing status
   */
  async updateStatus(documentId: string, status: ProcessingStatus, processedTimestamp?: Date): Promise<boolean> {
    const updateQuery = `
      UPDATE documents 
      SET processing_status = ?, processed_timestamp = ?, updated_at = NOW()
      WHERE id = ?
    `;

    const timestamp = status === 'completed' || status === 'failed' 
      ? (processedTimestamp || new Date()) 
      : null;

    const result = await mysqlConnection.executeQuery<ResultSetHeader>(updateQuery, [
      status,
      timestamp,
      documentId
    ]);

    return result.affectedRows > 0;
  }

  /**
   * Update document metadata
   */
  async updateMetadata(documentId: string, metadata: DocumentMetadata): Promise<boolean> {
    const updateQuery = `
      UPDATE documents 
      SET metadata = ?, updated_at = NOW()
      WHERE id = ?
    `;

    const result = await mysqlConnection.executeQuery<ResultSetHeader>(updateQuery, [
      JSON.stringify(metadata),
      documentId
    ]);

    return result.affectedRows > 0;
  }

  /**
   * Update document status and metadata together
   */
  async updateStatusAndMetadata(
    documentId: string, 
    data: UpdateDocumentData
  ): Promise<boolean> {
    return await mysqlConnection.executeTransaction(async (connection) => {
      let updateQuery = 'UPDATE documents SET updated_at = NOW()';
      const params: any[] = [];

      if (data.processingStatus !== undefined) {
        updateQuery += ', processing_status = ?';
        params.push(data.processingStatus);
      }

      if (data.processedTimestamp !== undefined) {
        updateQuery += ', processed_timestamp = ?';
        params.push(data.processedTimestamp);
      }

      if (data.metadata !== undefined) {
        updateQuery += ', metadata = ?';
        params.push(JSON.stringify(data.metadata));
      }

      updateQuery += ' WHERE id = ?';
      params.push(documentId);

      const [result] = await connection.execute(updateQuery, params) as [ResultSetHeader, any];
      return result.affectedRows > 0;
    });
  }

  /**
   * Add processing step to metadata
   */
  async addProcessingStep(
    documentId: string, 
    stepName: string, 
    status: ProcessingStatus, 
    error?: string
  ): Promise<boolean> {
    const document = await this.findById(documentId);
    if (!document) {
      return false;
    }

    const metadata = document.metadata || {};
    if (!metadata.processingSteps) {
      metadata.processingSteps = {};
    }

    metadata.processingSteps[stepName] = {
      status,
      timestamp: new Date(),
      ...(error && { error })
    };

    return await this.updateMetadata(documentId, metadata);
  }

  /**
   * Get documents by processing status
   */
  async findByStatus(status: ProcessingStatus, limit?: number): Promise<Document[]> {
    let selectQuery = `
      SELECT id, user_id, original_name, file_type, file_size, s3_path, 
             processing_status, upload_timestamp, processed_timestamp, metadata
      FROM documents 
      WHERE processing_status = ?
      ORDER BY upload_timestamp ASC
    `;

    const params: any[] = [status];

    if (limit) {
      selectQuery += ' LIMIT ?';
      params.push(limit);
    }

    const results = await mysqlConnection.executeQuery<RowDataPacket[]>(selectQuery, params);

    return results.map(row => ({
      id: row.id,
      user_id: row.user_id,
      original_name: row.original_name,
      file_type: row.file_type,
      file_size: row.file_size,
      s3_path: row.s3_path,
      processing_status: row.processing_status,
      upload_timestamp: row.upload_timestamp,
      processed_timestamp: row.processed_timestamp,
      metadata: row.metadata ? JSON.parse(row.metadata) : null
    }));
  }

  /**
   * Get documents by user with optional status filter
   */
  async findByUser(
    userId: string, 
    status?: ProcessingStatus, 
    limit?: number, 
    offset?: number
  ): Promise<{ documents: Document[]; total: number }> {
    let whereClause = 'WHERE user_id = ?';
    const params: any[] = [userId];

    if (status) {
      whereClause += ' AND processing_status = ?';
      params.push(status);
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM documents ${whereClause}`;
    const countResults = await mysqlConnection.executeQuery<RowDataPacket[]>(countQuery, [...params]);
    const total = countResults[0].total;

    // Get documents
    let selectQuery = `
      SELECT id, user_id, original_name, file_type, file_size, s3_path, 
             processing_status, upload_timestamp, processed_timestamp, metadata
      FROM documents 
      ${whereClause}
      ORDER BY upload_timestamp DESC
    `;

    if (limit) {
      selectQuery += ' LIMIT ?';
      params.push(limit);
    }

    if (offset) {
      selectQuery += ' OFFSET ?';
      params.push(offset);
    }

    const results = await mysqlConnection.executeQuery<RowDataPacket[]>(selectQuery, params);

    const documents = results.map(row => ({
      id: row.id,
      user_id: row.user_id,
      original_name: row.original_name,
      file_type: row.file_type,
      file_size: row.file_size,
      s3_path: row.s3_path,
      processing_status: row.processing_status,
      upload_timestamp: row.upload_timestamp,
      processed_timestamp: row.processed_timestamp,
      metadata: row.metadata ? JSON.parse(row.metadata) : null
    }));

    return { documents, total };
  }

  /**
   * Delete document by ID and user ID
   */
  async deleteByIdAndUser(documentId: string, userId: string): Promise<boolean> {
    const deleteQuery = 'DELETE FROM documents WHERE id = ? AND user_id = ?';
    const result = await mysqlConnection.executeQuery<ResultSetHeader>(deleteQuery, [documentId, userId]);
    return result.affectedRows > 0;
  }

  /**
   * Get processing statistics
   */
  async getProcessingStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    total: number;
  }> {
    const statsQuery = `
      SELECT 
        processing_status,
        COUNT(*) as count
      FROM documents 
      GROUP BY processing_status
    `;

    const results = await mysqlConnection.executeQuery<RowDataPacket[]>(statsQuery);

    const stats = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      total: 0
    };

    results.forEach(row => {
      const status = row.processing_status as ProcessingStatus;
      const count = row.count;
      stats[status] = count;
      stats.total += count;
    });

    return stats;
  }
}

export const documentModel = new DocumentModel();