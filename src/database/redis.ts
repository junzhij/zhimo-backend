// Redis connection and configuration for caching and message queuing
import { createClient, RedisClientOptions } from 'redis';
import { config } from '../config/config';

type RedisClient = ReturnType<typeof createClient>;

export interface AgentMessage {
  id: string;
  type: 'task' | 'status' | 'result' | 'error';
  agentType: 'orchestrator' | 'ingestion' | 'analysis' | 'extraction' | 'pedagogy' | 'synthesis';
  payload: any;
  timestamp: number;
  priority?: number;
  retryCount?: number;
  maxRetries?: number;
}

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  prefix?: string;
}

class RedisConnection {
  private client: RedisClient;
  private subscriber: RedisClient;
  private publisher: RedisClient;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 1000;

  // Queue names for different agent types
  private readonly QUEUE_NAMES = {
    orchestrator: 'queue:orchestrator',
    ingestion: 'queue:ingestion',
    analysis: 'queue:analysis',
    extraction: 'queue:extraction',
    pedagogy: 'queue:pedagogy',
    synthesis: 'queue:synthesis',
    deadletter: 'queue:deadletter',
  };

  // Channel names for pub/sub
  private readonly CHANNELS = {
    agentStatus: 'channel:agent-status',
    taskProgress: 'channel:task-progress',
    systemEvents: 'channel:system-events',
  };

  constructor() {
    const clientOptions: RedisClientOptions = {
      socket: {
        host: config.redis.host,
        port: config.redis.port,
        reconnectStrategy: (retries) => {
          if (retries > this.maxReconnectAttempts) {
            return new Error('Max reconnection attempts reached');
          }
          return Math.min(retries * 50, 500);
        },
      },
      password: config.redis.password,
      database: config.redis.db,
    };

    this.client = createClient(clientOptions);
    this.subscriber = createClient(clientOptions);
    this.publisher = createClient(clientOptions);

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Main client events
    this.client.on('connect', () => {
      console.log('Redis: Main client connected');
      this.isConnected = true;
      this.reconnectAttempts = 0;
    });

    this.client.on('error', (err) => {
      console.error('Redis: Main client error:', err);
      this.isConnected = false;
    });

    this.client.on('end', () => {
      console.log('Redis: Main client connection ended');
      this.isConnected = false;
    });

    // Subscriber events
    this.subscriber.on('connect', () => {
      console.log('Redis: Subscriber connected');
    });

    this.subscriber.on('error', (err) => {
      console.error('Redis: Subscriber error:', err);
    });

    // Publisher events
    this.publisher.on('connect', () => {
      console.log('Redis: Publisher connected');
    });

    this.publisher.on('error', (err) => {
      console.error('Redis: Publisher error:', err);
    });
  }

  async connect(): Promise<void> {
    try {
      await Promise.all([
        this.client.connect(),
        this.subscriber.connect(),
        this.publisher.connect(),
      ]);

      this.isConnected = true;
      console.log('Connected to Redis (all clients)');
    } catch (error) {
      console.error('Redis connection failed:', error);
      this.isConnected = false;
      throw error;
    }
  }

  getClient(): RedisClient {
    return this.client;
  }

  getSubscriber(): RedisClient {
    return this.subscriber;
  }

  getPublisher(): RedisClient {
    return this.publisher;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.client.ping();
      this.isConnected = true;
      return true;
    } catch (error) {
      console.error('Redis connection test failed:', error);
      this.isConnected = false;
      return false;
    }
  }

  isHealthy(): boolean {
    return this.isConnected;
  }

  // Caching methods
  async set(key: string, value: any, options?: CacheOptions): Promise<void> {
    const serializedValue = JSON.stringify(value);
    const fullKey = options?.prefix ? `${options.prefix}:${key}` : key;

    if (options?.ttl) {
      await this.client.setEx(fullKey, options.ttl, serializedValue);
    } else {
      await this.client.set(fullKey, serializedValue);
    }
  }

  async get<T = any>(key: string, prefix?: string): Promise<T | null> {
    const fullKey = prefix ? `${prefix}:${key}` : key;
    const value = await this.client.get(fullKey);

    if (!value) return null;

    try {
      return JSON.parse(value.toString()) as T;
    } catch (error) {
      console.error('Error parsing cached value:', error);
      return null;
    }
  }

  async del(key: string, prefix?: string): Promise<void> {
    const fullKey = prefix ? `${prefix}:${key}` : key;
    await this.client.del(fullKey);
  }

  async exists(key: string, prefix?: string): Promise<boolean> {
    const fullKey = prefix ? `${prefix}:${key}` : key;
    const result = await this.client.exists(fullKey);
    return result === 1;
  }

  // Message queue methods
  async enqueueMessage(agentType: keyof typeof this.QUEUE_NAMES, message: AgentMessage): Promise<void> {
    const queueName = this.QUEUE_NAMES[agentType];
    const serializedMessage = JSON.stringify(message);

    // Use priority queue if priority is specified
    if (message.priority !== undefined) {
      await this.client.zAdd(queueName, {
        score: message.priority,
        value: serializedMessage,
      });
    } else {
      await this.client.lPush(queueName, serializedMessage);
    }
  }

  async dequeueMessage(agentType: keyof typeof this.QUEUE_NAMES, timeout: number = 10): Promise<AgentMessage | null> {
    const queueName = this.QUEUE_NAMES[agentType];

    try {
      // Try priority queue first
      const priorityResult = await this.client.zPopMax(queueName);
      if (priorityResult) {
        return JSON.parse(priorityResult.value.toString()) as AgentMessage;
      }

      // Fall back to regular queue with blocking pop
      const result = await this.client.blPop(queueName, timeout);
      if (result) {
        return JSON.parse(result.element.toString()) as AgentMessage;
      }

      return null;
    } catch (error) {
      console.error('Error dequeuing message:', error);
      return null;
    }
  }

  async getQueueLength(agentType: keyof typeof this.QUEUE_NAMES): Promise<number> {
    const queueName = this.QUEUE_NAMES[agentType];
    const [listLength, zsetLength] = await Promise.all([
      this.client.lLen(queueName),
      this.client.zCard(queueName),
    ]);
    return Number(listLength) + Number(zsetLength);
  }

  async moveToDeadLetter(message: AgentMessage): Promise<void> {
    const deadLetterMessage = {
      ...message,
      deadLetterTimestamp: Date.now(),
      originalQueue: message.agentType,
    };

    await this.client.lPush(this.QUEUE_NAMES.deadletter, JSON.stringify(deadLetterMessage));
  }

  // Pub/Sub methods
  async publishMessage(channel: keyof typeof this.CHANNELS, message: any): Promise<void> {
    const channelName = this.CHANNELS[channel];
    await this.publisher.publish(channelName, JSON.stringify(message));
  }

  async subscribeToChannel(channel: keyof typeof this.CHANNELS, callback: (message: any) => void): Promise<void> {
    const channelName = this.CHANNELS[channel];

    await this.subscriber.subscribe(channelName, (message) => {
      try {
        const parsedMessage = JSON.parse(message);
        callback(parsedMessage);
      } catch (error) {
        console.error('Error parsing subscribed message:', error);
      }
    });
  }

  async unsubscribeFromChannel(channel: keyof typeof this.CHANNELS): Promise<void> {
    const channelName = this.CHANNELS[channel];
    await this.subscriber.unsubscribe(channelName);
  }

  // Distributed locking
  async acquireLock(lockKey: string, ttl: number = 30): Promise<boolean> {
    const result = await this.client.set(`lock:${lockKey}`, '1', {
      NX: true,
      EX: ttl,
    });
    return result === 'OK';
  }

  async releaseLock(lockKey: string): Promise<void> {
    await this.client.del(`lock:${lockKey}`);
  }

  // Session management
  async setSession(sessionId: string, data: any, ttl: number = 3600): Promise<void> {
    await this.set(`session:${sessionId}`, data, { ttl });
  }

  async getSession<T = any>(sessionId: string): Promise<T | null> {
    return await this.get<T>(`session:${sessionId}`);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.del(`session:${sessionId}`);
  }

  async close(): Promise<void> {
    try {
      await Promise.all([
        this.client.quit(),
        this.subscriber.quit(),
        this.publisher.quit(),
      ]);

      this.isConnected = false;
      console.log('Redis connections closed');
    } catch (error) {
      console.error('Error closing Redis connections:', error);
    }
  }
}

export const redisConnection = new RedisConnection();
export default redisConnection;