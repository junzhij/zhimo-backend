// MongoDB connection and configuration
import { MongoClient, Db, Collection, MongoClientOptions } from 'mongodb';
import { config } from '../config/config';

export interface KnowledgeElement {
  _id?: string;
  document_id: string;
  agent_type: 'analysis' | 'extraction' | 'pedagogy';
  element_type: 'summary' | 'definition' | 'formula' | 'question' | 'entity' | 'topic' | 'flashcard';
  content: {
    title: string;
    body: string;
    metadata?: Record<string, any>;
  };
  source_location: {
    section?: string;
    page?: number;
    position?: Record<string, any>;
  };
  created_at: Date;
  updated_at: Date;
  tags: string[];
  confidence_score?: number;
  user_id: string;
}

class MongoDBConnection {
  private client: MongoClient;
  private db: Db | null = null;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 1000;

  constructor() {
    const options: MongoClientOptions = {
      ...config.mongodb.options,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4, // Use IPv4, skip trying IPv6
      retryWrites: true,
      retryReads: true,
    };

    this.client = new MongoClient(config.mongodb.uri, options);
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('open', () => {
      console.log('MongoDB: Connection opened');
      this.isConnected = true;
      this.reconnectAttempts = 0;
    });

    this.client.on('close', () => {
      console.log('MongoDB: Connection closed');
      this.isConnected = false;
    });

    this.client.on('error', (error) => {
      console.error('MongoDB: Connection error:', error);
      this.isConnected = false;
      this.handleConnectionLoss();
    });

    this.client.on('timeout', () => {
      console.error('MongoDB: Connection timeout');
      this.isConnected = false;
    });
  }

  private async handleConnectionLoss(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('MongoDB: Maximum reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`MongoDB: Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms`);
    
    setTimeout(async () => {
      try {
        await this.connect();
        console.log('MongoDB: Reconnection successful');
      } catch (error) {
        console.error('MongoDB: Reconnection failed:', error);
        this.handleConnectionLoss();
      }
    }, delay);
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
      this.db = this.client.db();
      this.isConnected = true;
      console.log('Connected to MongoDB');
      
      // Setup collections and indexes
      await this.setupCollections();
    } catch (error) {
      console.error('MongoDB connection failed:', error);
      this.isConnected = false;
      throw error;
    }
  }

  private async setupCollections(): Promise<void> {
    if (!this.db) return;

    try {
      // Create knowledge_elements collection with schema validation
      const knowledgeElementsCollection = this.db.collection('knowledge_elements');
      
      // Create indexes for efficient querying
      await knowledgeElementsCollection.createIndexes([
        { key: { document_id: 1 } },
        { key: { user_id: 1 } },
        { key: { agent_type: 1 } },
        { key: { element_type: 1 } },
        { key: { created_at: -1 } },
        { key: { tags: 1 } },
        { key: { 'content.title': 'text', 'content.body': 'text' } }, // Text search
        { key: { document_id: 1, agent_type: 1 } },
        { key: { user_id: 1, element_type: 1 } },
        { key: { document_id: 1, element_type: 1 } },
        { key: { confidence_score: -1 } },
      ]);

      console.log('MongoDB: Collections and indexes created successfully');
    } catch (error) {
      console.error('MongoDB: Error setting up collections:', error);
      throw error;
    }
  }

  getDb(): Db {
    if (!this.db) {
      throw new Error('MongoDB not connected. Call connect() first.');
    }
    return this.db;
  }

  getKnowledgeElementsCollection(): Collection<KnowledgeElement> {
    return this.getDb().collection<KnowledgeElement>('knowledge_elements');
  }

  async testConnection(): Promise<boolean> {
    try {
      if (!this.client) return false;
      await this.client.db().admin().ping();
      this.isConnected = true;
      return true;
    } catch (error) {
      console.error('MongoDB connection test failed:', error);
      this.isConnected = false;
      return false;
    }
  }

  isHealthy(): boolean {
    return this.isConnected;
  }

  async close(): Promise<void> {
    try {
      await this.client.close();
      this.isConnected = false;
      console.log('MongoDB connection closed');
    } catch (error) {
      console.error('Error closing MongoDB connection:', error);
    }
  }

  // Helper methods for knowledge elements operations
  async insertKnowledgeElement(element: Omit<KnowledgeElement, '_id' | 'created_at' | 'updated_at'>): Promise<string> {
    const collection = this.getKnowledgeElementsCollection();
    const now = new Date();
    
    const result = await collection.insertOne({
      ...element,
      created_at: now,
      updated_at: now,
    });
    
    return result.insertedId.toString();
  }

  async findKnowledgeElements(filter: Partial<KnowledgeElement>, options?: {
    limit?: number;
    skip?: number;
    sort?: Record<string, 1 | -1>;
  }): Promise<KnowledgeElement[]> {
    const collection = this.getKnowledgeElementsCollection();
    
    let query = collection.find(filter);
    
    if (options?.sort) {
      query = query.sort(options.sort);
    }
    
    if (options?.skip) {
      query = query.skip(options.skip);
    }
    
    if (options?.limit) {
      query = query.limit(options.limit);
    }
    
    return await query.toArray();
  }

  async searchKnowledgeElements(searchText: string, filter?: Partial<KnowledgeElement>): Promise<KnowledgeElement[]> {
    const collection = this.getKnowledgeElementsCollection();
    
    const searchFilter = {
      $text: { $search: searchText },
      ...filter,
    };
    
    return await collection.find(searchFilter)
      .sort({ score: { $meta: 'textScore' } })
      .toArray();
  }
}

export const mongoConnection = new MongoDBConnection();
export default mongoConnection;