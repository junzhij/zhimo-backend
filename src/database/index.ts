// Database initialization and connection management
import { mysqlConnection } from './mysql';
import { mongoConnection } from './mongodb';
import { redisConnection } from './redis';
import { migrationRunner } from './migrations';
import { Logger } from '../utils/logger';

export class DatabaseManager {
  static async initializeAll(): Promise<void> {
    try {
      Logger.info('Initializing database connections...');
      
      // Test MySQL connection
      const mysqlHealthy = await mysqlConnection.testConnection();
      if (mysqlHealthy) {
        Logger.info('MySQL connection established successfully');
        
        // Run database migrations
        Logger.info('Running database migrations...');
        await migrationRunner.runMigrations();
        Logger.info('Database migrations completed');
      } else {
        Logger.error('MySQL connection failed');
      }

      // Initialize MongoDB connection
      await mongoConnection.connect();
      const mongoHealthy = await mongoConnection.testConnection();
      if (mongoHealthy) {
        Logger.info('MongoDB connection established successfully');
      } else {
        Logger.error('MongoDB connection failed');
      }

      // Initialize Redis connection
      await redisConnection.connect();
      const redisHealthy = await redisConnection.testConnection();
      if (redisHealthy) {
        Logger.info('Redis connection established successfully');
      } else {
        Logger.error('Redis connection failed');
      }

      Logger.info('Database initialization completed');
    } catch (error) {
      Logger.error('Database initialization failed:', error);
      throw error;
    }
  }

  static async closeAll(): Promise<void> {
    try {
      Logger.info('Closing database connections...');
      
      await Promise.all([
        mysqlConnection.close(),
        mongoConnection.close(),
        redisConnection.close()
      ]);
      
      Logger.info('All database connections closed');
    } catch (error) {
      Logger.error('Error closing database connections:', error);
      throw error;
    }
  }

  static async healthCheck(): Promise<{
    mysql: boolean;
    mongodb: boolean;
    redis: boolean;
  }> {
    const [mysql, mongodb, redis] = await Promise.all([
      mysqlConnection.testConnection(),
      mongoConnection.testConnection(),
      redisConnection.testConnection()
    ]);

    return { mysql, mongodb, redis };
  }
}

// Export individual connections for use in other modules
export { mysqlConnection, mongoConnection, redisConnection, migrationRunner };