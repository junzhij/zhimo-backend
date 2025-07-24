// Migration: Create annotations table
import { Migration } from './index';
import { PoolConnection } from 'mysql2/promise';

const migration: Migration = {
  id: '002',
  name: 'Create annotations table',
  
  async up(connection: PoolConnection): Promise<void> {
    const query = `
      CREATE TABLE annotations (
        id CHAR(36) PRIMARY KEY,
        user_id CHAR(36) NOT NULL,
        document_id CHAR(36) NOT NULL,
        annotation_type VARCHAR(50) NOT NULL DEFAULT 'highlight',
        content TEXT,
        position_data JSON NOT NULL,
        color VARCHAR(7) DEFAULT '#ffff00',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        INDEX idx_user_document (user_id, document_id),
        INDEX idx_document_id (document_id),
        INDEX idx_annotation_type (annotation_type),
        INDEX idx_user_id (user_id),
        INDEX idx_created_at (created_at),
        
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `;
    
    await connection.execute(query);
  },
  
  async down(connection: PoolConnection): Promise<void> {
    await connection.execute('DROP TABLE IF EXISTS annotations');
  }
};

export default migration;