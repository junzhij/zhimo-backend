// Main application entry point
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { config } from './config/config';
import { Logger } from './utils/logger';
import { DatabaseManager } from './database';
import { errorHandler } from './middleware/errorHandler';

// Load environment variables
dotenv.config();

const app = express();

// Security middleware
app.use(helmet());
app.use(cors());

// Logging middleware
app.use(morgan('combined'));

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check endpoint
app.get('/health', async (_req, res) => {
  try {
    const dbHealth = await DatabaseManager.healthCheck();
    const allHealthy = Object.values(dbHealth).every(status => status);
    
    res.status(allHealthy ? 200 : 503).json({ 
      status: allHealthy ? 'OK' : 'DEGRADED',
      timestamp: new Date().toISOString(),
      service: 'zhimo-backend',
      version: '1.0.0',
      databases: dbHealth
    });
  } catch (error) {
    Logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      service: 'zhimo-backend',
      version: '1.0.0',
      error: 'Health check failed'
    });
  }
});

// Import routes
import documentRoutes from './routes/documents';
import annotationRoutes from './routes/annotations';
import notebookRoutes from './routes/notebooks';
import knowledgeElementRoutes from './routes/knowledgeElements';
import authRoutes from './routes/auth';

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/annotations', annotationRoutes);
app.use('/api/notebooks', notebookRoutes);
app.use('/api/knowledge-elements', knowledgeElementRoutes);

// Catch-all for unimplemented API routes
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Global error handler
app.use(errorHandler);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = config.port || 3000;

// Initialize databases and start server
async function startServer() {
  try {
    // Initialize database connections
    await DatabaseManager.initializeAll();
    
    // Start the server
    app.listen(PORT, () => {
      Logger.info(`ZhiMo Backend Server running on port ${PORT}`);
      Logger.info(`Environment: ${config.nodeEnv}`);
    });
  } catch (error) {
    Logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  Logger.info('SIGTERM received, shutting down gracefully');
  await DatabaseManager.closeAll();
  process.exit(0);
});

process.on('SIGINT', async () => {
  Logger.info('SIGINT received, shutting down gracefully');
  await DatabaseManager.closeAll();
  process.exit(0);
});

// Start the application
startServer();

export default app;