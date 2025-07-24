// Agent Communication Framework
import { redisConnection, AgentMessage } from '../../database/redis';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

export type AgentType = 'orchestrator' | 'ingestion' | 'analysis' | 'extraction' | 'pedagogy' | 'synthesis';

export interface AgentRegistration {
  agentId: string;
  agentType: AgentType;
  capabilities: string[];
  status: 'active' | 'inactive' | 'busy' | 'error';
  lastHeartbeat: number;
  metadata?: any;
}

export interface TaskDefinition {
  id: string;
  type: string;
  agentType: AgentType;
  payload: any;
  priority?: number;
  dependencies?: string[];
  timeout?: number;
  retryPolicy?: {
    maxRetries: number;
    backoffMultiplier: number;
    initialDelay: number;
  };
}

export interface TaskResult {
  taskId: string;
  agentId: string;
  status: 'success' | 'error' | 'timeout';
  result?: any;
  error?: string;
  executionTime: number;
}

export class AgentCommunicationFramework extends EventEmitter {
  private registeredAgents: Map<string, AgentRegistration> = new Map();
  private activeTasks: Map<string, TaskDefinition> = new Map();
  private taskResults: Map<string, TaskResult> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds
  private readonly AGENT_TIMEOUT = 90000; // 90 seconds

  constructor() {
    super();
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Subscribe to agent status updates
    redisConnection.subscribeToChannel('agentStatus', (message) => {
      this.handleAgentStatusUpdate(message);
    });

    // Subscribe to task progress updates
    redisConnection.subscribeToChannel('taskProgress', (message) => {
      this.handleTaskProgressUpdate(message);
    });

    // Subscribe to system events
    redisConnection.subscribeToChannel('systemEvents', (message) => {
      this.handleSystemEvent(message);
    });
  }

  async initialize(): Promise<void> {
    try {
      // Ensure Redis connection is established
      if (!redisConnection.isHealthy()) {
        await redisConnection.connect();
      }

      // Start heartbeat monitoring
      this.startHeartbeatMonitoring();

      // Clean up stale agent registrations
      await this.cleanupStaleAgents();

      console.log('Agent Communication Framework initialized');
    } catch (error) {
      console.error('Failed to initialize Agent Communication Framework:', error);
      throw error;
    }
  }

  // Agent Registration and Discovery
  async registerAgent(registration: Omit<AgentRegistration, 'lastHeartbeat'>): Promise<void> {
    const fullRegistration: AgentRegistration = {
      ...registration,
      lastHeartbeat: Date.now(),
    };

    // Store in memory
    this.registeredAgents.set(registration.agentId, fullRegistration);

    // Store in Redis for persistence
    await redisConnection.set(
      `agent:${registration.agentId}`,
      fullRegistration,
      { ttl: 300, prefix: 'registry' }
    );

    // Publish agent registration event
    await redisConnection.publishMessage('systemEvents', {
      type: 'agent_registered',
      agentId: registration.agentId,
      agentType: registration.agentType,
      timestamp: Date.now(),
    });

    console.log(`Agent registered: ${registration.agentId} (${registration.agentType})`);
  }

  async unregisterAgent(agentId: string): Promise<void> {
    const agent = this.registeredAgents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Remove from memory
    this.registeredAgents.delete(agentId);

    // Remove from Redis
    await redisConnection.del(`agent:${agentId}`, 'registry');

    // Publish agent unregistration event
    await redisConnection.publishMessage('systemEvents', {
      type: 'agent_unregistered',
      agentId,
      agentType: agent.agentType,
      timestamp: Date.now(),
    });

    console.log(`Agent unregistered: ${agentId}`);
  }

  async updateAgentStatus(agentId: string, status: AgentRegistration['status'], metadata?: any): Promise<void> {
    const agent = this.registeredAgents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    agent.status = status;
    agent.lastHeartbeat = Date.now();
    if (metadata) {
      agent.metadata = { ...agent.metadata, ...metadata };
    }

    // Update in Redis
    await redisConnection.set(
      `agent:${agentId}`,
      agent,
      { ttl: 300, prefix: 'registry' }
    );

    // Publish status update
    await redisConnection.publishMessage('agentStatus', {
      agentId,
      status,
      metadata,
      timestamp: Date.now(),
    });
  }

  getRegisteredAgents(agentType?: AgentType): AgentRegistration[] {
    const agents = Array.from(this.registeredAgents.values());
    return agentType ? agents.filter(agent => agent.agentType === agentType) : agents;
  }

  getAvailableAgents(agentType: AgentType): AgentRegistration[] {
    return this.getRegisteredAgents(agentType).filter(agent => 
      agent.status === 'active' && 
      Date.now() - agent.lastHeartbeat < this.AGENT_TIMEOUT
    );
  }

  // Task Distribution and Monitoring
  async distributeTask(task: TaskDefinition): Promise<string> {
    // Find available agents for the task
    const availableAgents = this.getAvailableAgents(task.agentType);
    
    if (availableAgents.length === 0) {
      throw new Error(`No available agents for type: ${task.agentType}`);
    }

    // Select agent (simple round-robin for now)
    const selectedAgent = availableAgents[0];

    // Create agent message
    const message: AgentMessage = {
      id: task.id,
      type: 'task',
      agentType: task.agentType,
      payload: {
        taskId: task.id,
        taskType: task.type,
        data: task.payload,
        timeout: task.timeout || 300000, // 5 minutes default
        retryPolicy: task.retryPolicy,
      },
      timestamp: Date.now(),
      priority: task.priority,
      retryCount: 0,
      maxRetries: task.retryPolicy?.maxRetries || 3,
    };

    // Store task for monitoring
    this.activeTasks.set(task.id, task);

    // Enqueue message
    await redisConnection.enqueueMessage(task.agentType, message);

    // Update agent status to busy
    await this.updateAgentStatus(selectedAgent.agentId, 'busy', {
      currentTask: task.id,
      taskStartTime: Date.now(),
    });

    console.log(`Task ${task.id} distributed to agent ${selectedAgent.agentId}`);
    return selectedAgent.agentId;
  }

  async getTaskStatus(taskId: string): Promise<{
    task: TaskDefinition | null;
    result: TaskResult | null;
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'timeout';
  }> {
    const task = this.activeTasks.get(taskId) || null;
    const result = this.taskResults.get(taskId) || null;

    let status: 'pending' | 'processing' | 'completed' | 'failed' | 'timeout' = 'pending';

    if (result) {
      switch (result.status) {
        case 'success':
          status = 'completed';
          break;
        case 'error':
          status = 'failed';
          break;
        case 'timeout':
          status = 'timeout';
          break;
      }
    } else if (task) {
      // Check if task is being processed
      const processingAgents = this.getRegisteredAgents().filter(agent => 
        agent.status === 'busy' && 
        agent.metadata?.currentTask === taskId
      );
      status = processingAgents.length > 0 ? 'processing' : 'pending';
    }

    return { task, result, status };
  }

  async cancelTask(taskId: string): Promise<void> {
    const task = this.activeTasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    // Find agent processing the task
    const processingAgent = this.getRegisteredAgents().find(agent => 
      agent.metadata?.currentTask === taskId
    );

    if (processingAgent) {
      // Send cancellation message
      const cancelMessage: AgentMessage = {
        id: uuidv4(),
        type: 'task',
        agentType: processingAgent.agentType,
        payload: {
          action: 'cancel',
          taskId,
        },
        timestamp: Date.now(),
      };

      await redisConnection.enqueueMessage(processingAgent.agentType, cancelMessage);
    }

    // Remove from active tasks
    this.activeTasks.delete(taskId);

    console.log(`Task ${taskId} cancelled`);
  }

  // Event Handlers
  private handleAgentStatusUpdate(message: any): void {
    const { agentId, status, metadata, timestamp } = message;
    
    const agent = this.registeredAgents.get(agentId);
    if (agent) {
      agent.status = status;
      agent.lastHeartbeat = timestamp;
      if (metadata) {
        agent.metadata = { ...agent.metadata, ...metadata };
      }
    }

    this.emit('agentStatusChanged', { agentId, status, metadata });
  }

  private handleTaskProgressUpdate(message: any): void {
    const { taskId, agentId, progress, result, error } = message;

    if (result) {
      // Task completed
      const taskResult: TaskResult = {
        taskId,
        agentId,
        status: error ? 'error' : 'success',
        result: result,
        error: error,
        executionTime: Date.now() - (this.activeTasks.get(taskId)?.payload?.startTime || Date.now()),
      };

      this.taskResults.set(taskId, taskResult);
      this.activeTasks.delete(taskId);

      // Update agent status back to active
      this.updateAgentStatus(agentId, 'active', {
        currentTask: null,
        lastCompletedTask: taskId,
      });

      this.emit('taskCompleted', taskResult);
    } else if (progress) {
      // Task progress update
      this.emit('taskProgress', { taskId, agentId, progress });
    }
  }

  private handleSystemEvent(message: any): void {
    this.emit('systemEvent', message);
  }

  // Heartbeat and Health Monitoring
  private startHeartbeatMonitoring(): void {
    this.heartbeatInterval = setInterval(async () => {
      await this.checkAgentHealth();
    }, this.HEARTBEAT_INTERVAL);
  }

  private async checkAgentHealth(): Promise<void> {
    const now = Date.now();
    const staleAgents: string[] = [];

    for (const [agentId, agent] of this.registeredAgents.entries()) {
      if (now - agent.lastHeartbeat > this.AGENT_TIMEOUT) {
        staleAgents.push(agentId);
      }
    }

    // Remove stale agents
    for (const agentId of staleAgents) {
      console.warn(`Agent ${agentId} timed out, removing from registry`);
      await this.unregisterAgent(agentId);
    }
  }

  private async cleanupStaleAgents(): Promise<void> {
    // This would typically scan Redis for stale agent registrations
    // and clean them up on startup
    console.log('Cleaning up stale agent registrations...');
  }

  async shutdown(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Unregister all agents
    const agentIds = Array.from(this.registeredAgents.keys());
    for (const agentId of agentIds) {
      await this.unregisterAgent(agentId);
    }

    console.log('Agent Communication Framework shut down');
  }
}

export const agentCommunication = new AgentCommunicationFramework();