// Migration: Create review_notebooks table
import { Migration } from './index';
import { PoolConnection } from 'mysql2/promise';

const migration: Migration = {
  id: '003',
  name: 'Create review_notebooks table',
  
  async up(connection: PoolConnection): Promise<void> {
    const query = `
      CREATE TABLE review_notebooks (
        id CHAR(36) PRIMARY KEY,
        user_id CHAR(36) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        template_type VARCHAR(50) DEFAULT 'default',
        is_public BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        INDEX idx_user_id (user_id),
        INDEX idx_title (title),
        INDEX idx_created_at (created_at),
        INDEX idx_user_public (user_id, is_public)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `;
    
    await connection.execute(query);
  },
  
  async down(connection: PoolConnection): Promise<void> {
    await connection.execute('DROP TABLE IF EXISTS review_notebooks');
  }
};

export default migration;