// Migration: Create documents table
import { Migration } from './index';
import { PoolConnection } from 'mysql2/promise';

const migration: Migration = {
  id: '001',
  name: 'Create documents table',
  
  async up(connection: PoolConnection): Promise<void> {
    const query = `
      CREATE TABLE documents (
        id CHAR(36) PRIMARY KEY,
        user_id CHAR(36) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        file_type VARCHAR(50) NOT NULL,
        file_size BIGINT NOT NULL DEFAULT 0,
        s3_path VARCHAR(500) NOT NULL,
        processing_status VARCHAR(50) DEFAULT 'pending',
        upload_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed_timestamp TIMESTAMP NULL,
        metadata JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        INDEX idx_user_id (user_id),
        INDEX idx_processing_status (processing_status),
        INDEX idx_file_type (file_type),
        INDEX idx_upload_timestamp (upload_timestamp),
        INDEX idx_user_status (user_id, processing_status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `;
    
    await connection.execute(query);
  },
  
  async down(connection: PoolConnection): Promise<void> {
    await connection.execute('DROP TABLE IF EXISTS documents');
  }
};

export default migration;