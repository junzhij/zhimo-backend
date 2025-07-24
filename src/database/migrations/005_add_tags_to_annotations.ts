// Migration: Add tags column to annotations table
import { Migration } from './index';
import { PoolConnection } from 'mysql2/promise';

const migration: Migration = {
  id: '005',
  name: 'Add tags column to annotations table',
  
  async up(connection: PoolConnection): Promise<void> {
    const query = `
      ALTER TABLE annotations 
      ADD COLUMN tags JSON DEFAULT NULL,
      ADD INDEX idx_tags ((CAST(tags AS CHAR(255) ARRAY)))
    `;
    
    await connection.execute(query);
  },
  
  async down(connection: PoolConnection): Promise<void> {
    await connection.execute('ALTER TABLE annotations DROP COLUMN tags');
  }
};

export default migration;