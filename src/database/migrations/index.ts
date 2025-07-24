// Database migration system
import { mysqlConnection } from '../mysql';
import { PoolConnection } from 'mysql2/promise';

export interface Migration {
  id: string;
  name: string;
  up: (connection: PoolConnection) => Promise<void>;
  down: (connection: PoolConnection) => Promise<void>;
}

class MigrationRunner {
  private migrations: Migration[] = [];

  constructor() {
    this.loadMigrations();
  }

  private loadMigrations(): void {
    // Import all migration files
    this.migrations = [
      require('./001_create_documents_table').default,
      require('./002_create_annotations_table').default,
      require('./003_create_review_notebooks_table').default,
      require('./004_create_notebook_composition_table').default,
    ];
  }

  async createMigrationsTable(): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS migrations (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await mysqlConnection.executeQuery(query);
  }

  async getExecutedMigrations(): Promise<string[]> {
    try {
      const results = await mysqlConnection.executeQuery<any[]>(
        'SELECT id FROM migrations ORDER BY executed_at'
      );
      return results.map(row => row.id);
    } catch (error) {
      // If migrations table doesn't exist, return empty array
      return [];
    }
  }

  async runMigrations(): Promise<void> {
    await this.createMigrationsTable();
    const executedMigrations = await this.getExecutedMigrations();
    
    for (const migration of this.migrations) {
      if (!executedMigrations.includes(migration.id)) {
        console.log(`Running migration: ${migration.name}`);
        
        await mysqlConnection.executeTransaction(async (connection) => {
          await migration.up(connection);
          await connection.execute(
            'INSERT INTO migrations (id, name) VALUES (?, ?)',
            [migration.id, migration.name]
          );
        });
        
        console.log(`Migration completed: ${migration.name}`);
      }
    }
  }

  async rollbackMigration(migrationId: string): Promise<void> {
    const migration = this.migrations.find(m => m.id === migrationId);
    if (!migration) {
      throw new Error(`Migration ${migrationId} not found`);
    }

    console.log(`Rolling back migration: ${migration.name}`);
    
    await mysqlConnection.executeTransaction(async (connection) => {
      await migration.down(connection);
      await connection.execute('DELETE FROM migrations WHERE id = ?', [migrationId]);
    });
    
    console.log(`Migration rolled back: ${migration.name}`);
  }
}

export const migrationRunner = new MigrationRunner();