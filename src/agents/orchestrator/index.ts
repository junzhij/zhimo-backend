// Orchestrator Agent - Coordinates all other agents
import { agentCommunication, AgentCommunicationFramework, TaskDefinition, AgentType } from './communication';
import { taskDistribution, TaskDistributionSystem } from './taskDistribution';
import { workflowManager, WorkflowManager, UserInstruction } from './workflowManager';
import { redisConnection } from '../../database/redis';
import { v4 as uuidv4 } from 'uuid';

export interface OrchestratorConfig {
  agentId?: string;
  maxConcurrentTasks?: number;
  defaultTimeout?: number;
  retryPolicy?: {
    maxRetries: number;
    backoffMultiplier: number;
    initialDelay: number;
  };
}

export class OrchestratorAgent {
  private agentId: string;
  private communication: AgentCommunicationFramework;
  private taskDistribution: TaskDistributionSystem;
  public workflowManager: WorkflowManager; // Made public for controller access
  private isInitialized: boolean = false;
  private config: Required<OrchestratorConfig>;

  constructor(config: OrchestratorConfig = {}) {
    this.agentId = config.agentId || `orchestrator-${uuidv4()}`;
    this.communication = agentCommunication;
    this.taskDistribution = taskDistribution;
    this.workflowManager = workflowManager;
    
    this.config = {
      agentId: this.agentId,
      maxConcurrentTasks: config.maxConcurrentTasks || 10,
      defaultTimeout: config.defaultTimeout || 300000, // 5 minutes
      retryPolicy: config.retryPolicy || {
        maxRetries: 3,
        backoffMultiplier: 2,
        initialDelay: 1000,
      },
    };
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Initialize communication framework
      await this.communication.initialize();

      // Register orchestrator as an agent
      await this.communication.registerAgent({
        agentId: this.agentId,
        agentType: 'orchestrator',
        capabilities: [
          'task_coordination',
          'workflow_management',
          'agent_monitoring',
          'error_handling',
        ],
        status: 'active',
        metadata: {
          maxConcurrentTasks: this.config.maxConcurrentTasks,
          version: '1.0.0',
        },
      });

      this.isInitialized = true;
      console.log(`Orchestrator Agent ${this.agentId} initialized successfully`);

    } catch (error) {
      console.error('Failed to initialize Orchestrator Agent:', error);
      throw error;
    }
  }

  // Agent Management Methods
  async getRegisteredAgents(agentType?: AgentType) {
    return this.communication.getRegisteredAgents(agentType);
  }

  async getAvailableAgents(agentType: AgentType) {
    return this.communication.getAvailableAgents(agentType);
  }

  async getAgentHealth() {
    const agents = this.communication.getRegisteredAgents();
    return agents.map(agent => ({
      agentId: agent.agentId,
      agentType: agent.agentType,
      status: agent.status,
      lastHeartbeat: agent.lastHeartbeat,
      isHealthy: Date.now() - agent.lastHeartbeat < 90000, // 90 seconds
      metadata: agent.metadata,
    }));
  }

  // Workflow Management Methods
  async processUserInstruction(instruction: UserInstruction): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('Orchestrator Agent not initialized');
    }

    return await this.workflowManager.processUserInstruction(instruction);
  }

  getWorkflowStatus(workflowId: string) {
    return this.workflowManager.getWorkflowStatus(workflowId);
  }

  async cancelWorkflow(workflowId: string): Promise<void> {
    await this.workflowManager.cancelWorkflow(workflowId);
  }

  getActiveWorkflows() {
    return this.workflowManager.getActiveWorkflows();
  }

  // Task Management Methods
  async submitTask(taskDefinition: Omit<TaskDefinition, 'id'>): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('Orchestrator Agent not initialized');
    }

    // Apply default configuration
    const task: Omit<TaskDefinition, 'id'> = {
      ...taskDefinition,
      timeout: taskDefinition.timeout || this.config.defaultTimeout,
      retryPolicy: taskDefinition.retryPolicy || this.config.retryPolicy,
    };

    return await this.taskDistribution.submitTask(task);
  }

  async submitBatchTasks(tasks: Array<Omit<TaskDefinition, 'id'>>): Promise<string[]> {
    if (!this.isInitialized) {
      throw new Error('Orchestrator Agent not initialized');
    }

    // Apply default configuration to all tasks
    const configuredTasks = tasks.map(task => ({
      ...task,
      timeout: task.timeout || this.config.defaultTimeout,
      retryPolicy: task.retryPolicy || this.config.retryPolicy,
    }));

    return await this.taskDistribution.submitBatchTasks(configuredTasks);
  }

  async getTaskStatus(taskId: string) {
    return this.taskDistribution.getTaskStatus(taskId);
  }

  async cancelTask(taskId: string): Promise<void> {
    await this.taskDistribution.cancelTask(taskId);
  }

  // Queue and Metrics Methods
  getQueueStatus(agentType?: AgentType) {
    return this.taskDistribution.getQueueStatus(agentType);
  }

  getTaskMetrics(agentType?: AgentType) {
    return this.taskDistribution.getTaskMetrics(agentType);
  }

  // System Health and Monitoring
  async getSystemHealth() {
    const agentHealth = await this.getAgentHealth();
    const queueStatus = this.getQueueStatus();
    const taskMetrics = this.getTaskMetrics();
    const activeWorkflows = this.getActiveWorkflows();

    return {
      orchestrator: {
        agentId: this.agentId,
        status: 'active',
        isInitialized: this.isInitialized,
      },
      agents: agentHealth,
      queues: queueStatus,
      metrics: taskMetrics,
      workflows: {
        active: activeWorkflows.length,
        processing: activeWorkflows.filter(w => w.status === 'processing').length,
        completed: activeWorkflows.filter(w => w.status === 'completed').length,
        failed: activeWorkflows.filter(w => w.status === 'failed').length,
      },
      redis: {
        isConnected: redisConnection.isHealthy(),
      },
    };
  }

  // Event Handling
  onTaskCompleted(callback: (result: any) => void) {
    this.taskDistribution.on('taskCompleted', callback);
  }

  onTaskProgress(callback: (progress: any) => void) {
    this.taskDistribution.on('taskProgress', callback);
  }

  onTaskStarted(callback: (task: any) => void) {
    this.taskDistribution.on('taskStarted', callback);
  }

  onAgentStatusChanged(callback: (status: any) => void) {
    this.communication.on('agentStatusChanged', callback);
  }

  onSystemEvent(callback: (event: any) => void) {
    this.communication.on('systemEvent', callback);
  }

  // Shutdown
  async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    try {
      // Shutdown task distribution
      await this.taskDistribution.shutdown();

      // Unregister orchestrator agent
      await this.communication.unregisterAgent(this.agentId);

      // Shutdown communication framework
      await this.communication.shutdown();

      this.isInitialized = false;
      console.log(`Orchestrator Agent ${this.agentId} shut down successfully`);

    } catch (error) {
      console.error('Error during Orchestrator Agent shutdown:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const orchestratorAgent = new OrchestratorAgent();