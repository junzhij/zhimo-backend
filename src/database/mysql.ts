// MySQL database connection and configuration
import mysql from 'mysql2/promise';
import { config } from '../config/config';

interface ConnectionOptions extends mysql.PoolOptions {
  acquireTimeout?: number;
  timeout?: number;
  reconnect?: boolean;
  idleTimeout?: number;
}

class MySQLConnection {
  private pool!: mysql.Pool;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 1000; // Start with 1 second

  constructor() {
    this.initializePool();
  }

  private initializePool(): void {
    const connectionOptions: ConnectionOptions = {
      host: config.mysql.host,
      port: config.mysql.port,
      user: config.mysql.user,
      password: config.mysql.password,
      database: config.mysql.database,
      connectionLimit: config.mysql.connectionLimit,
      queueLimit: 0,
      idleTimeout: 300000, // 5 minutes
      // Enable automatic reconnection
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    };

    this.pool = mysql.createPool(connectionOptions);
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.pool.on('connection', (connection) => {
      console.log('MySQL: New connection established as id ' + connection.threadId);
      this.isConnected = true;
      this.reconnectAttempts = 0;

      // Set up error handling for individual connections
      connection.on('error', (err) => {
        console.error('MySQL connection error:', err);
        this.isConnected = false;

        if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
          this.handleConnectionLoss();
        }
      });
    });
  }

  private async handleConnectionLoss(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('MySQL: Maximum reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff

    console.log(`MySQL: Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms`);

    setTimeout(async () => {
      try {
        await this.testConnection();
        console.log('MySQL: Reconnection successful');
        this.reconnectAttempts = 0;
      } catch (error) {
        console.error('MySQL: Reconnection failed:', error);
        this.handleConnectionLoss();
      }
    }, delay);
  }

  getPool(): mysql.Pool {
    return this.pool;
  }

  async getConnection(): Promise<mysql.PoolConnection> {
    try {
      const connection = await this.pool.getConnection();
      return connection;
    } catch (error) {
      console.error('Failed to get MySQL connection:', error);
      throw new Error('Database connection unavailable');
    }
  }

  async executeQuery<T = any>(query: string, params?: any[]): Promise<T> {
    const connection = await this.getConnection();
    try {
      const [results] = await connection.execute(query, params);
      return results as T;
    } catch (error) {
      console.error('MySQL query execution failed:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  async executeTransaction<T>(callback: (connection: mysql.PoolConnection) => Promise<T>): Promise<T> {
    const connection = await this.getConnection();
    try {
      await connection.beginTransaction();
      const result = await callback(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      console.error('MySQL transaction failed:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const connection = await this.pool.getConnection();
      await connection.ping();
      connection.release();
      this.isConnected = true;
      return true;
    } catch (error) {
      console.error('MySQL connection test failed:', error);
      this.isConnected = false;
      return false;
    }
  }

  isHealthy(): boolean {
    return this.isConnected;
  }

  async close(): Promise<void> {
    try {
      await this.pool.end();
      this.isConnected = false;
      console.log('MySQL connection pool closed');
    } catch (error) {
      console.error('Error closing MySQL connection pool:', error);
    }
  }
}

export const mysqlConnection = new MySQLConnection();
export default mysqlConnection;