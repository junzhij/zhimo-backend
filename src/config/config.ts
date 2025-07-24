// Configuration management for the application
export const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Database configurations
  mysql: {
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'zhimo',
    connectionLimit: parseInt(process.env.MYSQL_CONNECTION_LIMIT || '10'),
    acquireTimeout: parseInt(process.env.MYSQL_ACQUIRE_TIMEOUT || '60000'),
    timeout: parseInt(process.env.MYSQL_TIMEOUT || '60000'),
    reconnect: process.env.MYSQL_RECONNECT !== 'false',
    ssl: process.env.MYSQL_SSL === 'true' ? {
      rejectUnauthorized: process.env.MYSQL_SSL_REJECT_UNAUTHORIZED !== 'false'
    } : false,
  },
  
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/zhimo',
    options: {
      maxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE || '10'),
    },
  },
  
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0'),
  },
  
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    s3: {
      bucket: process.env.S3_BUCKET || 'zhimo-documents',
    },
  },
  
  // Agent configuration
  agents: {
    timeout: parseInt(process.env.AGENT_TIMEOUT || '30000'), // 30 seconds
    retryAttempts: parseInt(process.env.AGENT_RETRY_ATTEMPTS || '3'),
  },
};