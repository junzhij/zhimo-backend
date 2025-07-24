// Migration: Create users table
import { Migration } from './index';
import { PoolConnection } from 'mysql2/promise';

const migration: Migration = {
  id: '006',
  name: 'Create users table',
  
  async up(connection: PoolConnection): Promise<void> {
    const query = `
      CREATE TABLE users (
        id CHAR(36) PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        role VARCHAR(50) DEFAULT 'user',
        is_active BOOLEAN DEFAULT true,
        email_verified BOOLEAN DEFAULT false,
        last_login TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        INDEX idx_email (email),
        INDEX idx_role (role),
        INDEX idx_is_active (is_active),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `;
    
    await connection.execute(query);
  },
  
  async down(connection: PoolConnection): Promise<void> {
    await connection.execute('DROP TABLE IF EXISTS users');
  }
};

export default migration;