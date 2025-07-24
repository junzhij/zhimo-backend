// Migration: Create notebook_composition table
import { Migration } from './index';
import { PoolConnection } from 'mysql2/promise';

const migration: Migration = {
  id: '004',
  name: 'Create notebook_composition table',
  
  async up(connection: PoolConnection): Promise<void> {
    const query = `
      CREATE TABLE notebook_composition (
        id CHAR(36) PRIMARY KEY,
        notebook_id CHAR(36) NOT NULL,
        element_type VARCHAR(50) NOT NULL,
        element_id VARCHAR(255) NOT NULL,
        order_index INTEGER NOT NULL,
        section_title VARCHAR(255),
        custom_content TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        INDEX idx_notebook_order (notebook_id, order_index),
        INDEX idx_element_type (element_type),
        INDEX idx_element_id (element_id),
        INDEX idx_notebook_id (notebook_id),
        
        FOREIGN KEY (notebook_id) REFERENCES review_notebooks(id) ON DELETE CASCADE,
        UNIQUE KEY unique_notebook_order (notebook_id, order_index)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `;
    
    await connection.execute(query);
  },
  
  async down(connection: PoolConnection): Promise<void> {
    await connection.execute('DROP TABLE IF EXISTS notebook_composition');
  }
};

export default migration;