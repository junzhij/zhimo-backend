// Task Distribution and Monitoring System
import { agentCommunication, TaskDefinition, TaskResult, AgentType } from './communication';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';

export interface TaskQueue {
  id: string;
  name: string;
  agentType: AgentType;
  priority: number;
  maxConcurrency: number;
  currentTasks: number;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
}

export interface TaskDependency {
  taskId: string;
  dependsOn: string[];
  status: 'waiting' | 'ready' | 'processing' | 'completed' | 'failed';
}

export interface TaskMetrics {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  averageExecutionTime: number;
  throughput: number; // tasks per minute
  errorRate: number;
}

export class TaskDistributionSystem extends EventEmitter {
  private taskQueues: Map<string, TaskQueue> = new Map();
  private taskDependencies: Map<string, TaskDependency> = new Map();
  private taskMetrics: Map<AgentType, TaskMetrics> = new Map();
  private pendingTasks: Map<string, TaskDefinition> = new Map();
  private processingTasks: Map<string, { task: TaskDefinition; startTime: number; agentId: string }> = new Map();
  private completedTasks: Map<string, TaskResult> = new Map();
  private taskTimeouts: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    super();
    this.initializeQueues();
    this.setupEventHandlers();
  }

  private initializeQueues(): void {
    const agentTypes: AgentType[] = ['ingestion', 'analysis', 'extraction', 'pedagogy', 'synthesis'];
    
    agentTypes.forEach(agentType => {
      const queue: TaskQueue = {
        id: uuidv4(),
        name: `${agentType}-queue`,
        agentType,
        priority: this.getDefaultPriority(agentType),
        maxConcurrency: this.getMaxConcurrency(agentType),
        currentTasks: 0,
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
      };

      this.taskQueues.set(agentType, queue);
      
      // Initialize metrics
      this.taskMetrics.set(agentType, {
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        averageExecutionTime: 0,
        throughput: 0,
        errorRate: 0,
      });
    });
  }

  private getDefaultPriority(agentType: AgentType): number {
    const priorities: Record<AgentType, number> = {
      orchestrator: 0,
      ingestion: 1,
      analysis: 2,
      extraction: 3,
      pedagogy: 4,
      synthesis: 5,
    };
    return priorities[agentType] || 5;
  }

  private getMaxConcurrency(agentType: AgentType): number {
    const concurrency: Record<AgentType, number> = {
      orchestrator: 1,
      ingestion: 3,
      analysis: 5,
      extraction: 4,
      pedagogy: 3,
      synthesis: 2,
    };
    return concurrency[agentType] || 2;
  }

  private setupEventHandlers(): void {
    agentCommunication.on('taskCompleted', (result: TaskResult) => {
      this.handleTaskCompletion(result);
    });

    agentCommunication.on('taskProgress', (progress: any) => {
      this.handleTaskProgress(progress);
    });

    agentCommunication.on('agentStatusChanged', (status: any) => {
      this.handleAgentStatusChange(status);
    });
  }

  // Task Submission and Queuing
  async submitTask(task: Omit<TaskDefinition, 'id'>): Promise<string> {
    const taskId = uuidv4();
    const fullTask: TaskDefinition = {
      ...task,
      id: taskId,
    };

    // Add to pending tasks
    this.pendingTasks.set(taskId, fullTask);

    // Update queue metrics
    const queue = this.taskQueues.get(task.agentType);
    if (queue) {
      queue.totalTasks++;
    }

    // Handle dependencies
    if (task.dependencies && task.dependencies.length > 0) {
      await this.addTaskDependency(taskId, task.dependencies);
    } else {
      // No dependencies, can be processed immediately
      await this.processTask(fullTask);
    }

    console.log(`Task ${taskId} submitted for ${task.agentType} agent`);
    return taskId;
  }

  async submitBatchTasks(tasks: Array<Omit<TaskDefinition, 'id'>>): Promise<string[]> {
    const taskIds: string[] = [];
    
    for (const task of tasks) {
      const taskId = await this.submitTask(task);
      taskIds.push(taskId);
    }

    return taskIds;
  }

  private async addTaskDependency(taskId: string, dependencies: string[]): Promise<void> {
    const dependency: TaskDependency = {
      taskId,
      dependsOn: dependencies,
      status: 'waiting',
    };

    this.taskDependencies.set(taskId, dependency);

    // Check if dependencies are already completed
    await this.checkDependencies(taskId);
  }

  private async checkDependencies(taskId: string): Promise<void> {
    const dependency = this.taskDependencies.get(taskId);
    if (!dependency) return;

    const allCompleted = dependency.dependsOn.every(depId => 
      this.completedTasks.has(depId) && 
      this.completedTasks.get(depId)?.status === 'success'
    );

    if (allCompleted) {
      dependency.status = 'ready';
      const task = this.pendingTasks.get(taskId);
      if (task) {
        await this.processTask(task);
      }
    }
  }

  private async processTask(task: TaskDefinition): Promise<void> {
    const queue = this.taskQueues.get(task.agentType);
    if (!queue) {
      throw new Error(`Queue not found for agent type: ${task.agentType}`);
    }

    // Check concurrency limits
    if (queue.currentTasks >= queue.maxConcurrency) {
      console.log(`Queue ${queue.name} at max concurrency, task ${task.id} will wait`);
      return;
    }

    try {
      // Distribute task to agent
      const agentId = await agentCommunication.distributeTask(task);
      
      // Move from pending to processing
      this.pendingTasks.delete(task.id);
      this.processingTasks.set(task.id, {
        task,
        startTime: Date.now(),
        agentId,
      });

      // Update queue metrics
      queue.currentTasks++;

      // Set timeout if specified
      if (task.timeout) {
        const timeout = setTimeout(() => {
          this.handleTaskTimeout(task.id);
        }, task.timeout);
        
        this.taskTimeouts.set(task.id, timeout);
      }

      // Update dependency status
      const dependency = this.taskDependencies.get(task.id);
      if (dependency) {
        dependency.status = 'processing';
      }

      this.emit('taskStarted', { taskId: task.id, agentId, agentType: task.agentType });

    } catch (error) {
      console.error(`Failed to process task ${task.id}:`, error);
      await this.handleTaskFailure(task.id, error as Error);
    }
  }

  // Task Completion and Error Handling
  private async handleTaskCompletion(result: TaskResult): Promise<void> {
    const processingTask = this.processingTasks.get(result.taskId);
    if (!processingTask) {
      console.warn(`Completed task ${result.taskId} not found in processing tasks`);
      return;
    }

    // Clear timeout
    const timeout = this.taskTimeouts.get(result.taskId);
    if (timeout) {
      clearTimeout(timeout);
      this.taskTimeouts.delete(result.taskId);
    }

    // Move to completed tasks
    this.processingTasks.delete(result.taskId);
    this.completedTasks.set(result.taskId, result);

    // Update queue metrics
    const queue = this.taskQueues.get(processingTask.task.agentType);
    if (queue) {
      queue.currentTasks--;
      if (result.status === 'success') {
        queue.completedTasks++;
      } else {
        queue.failedTasks++;
      }
    }

    // Update task metrics
    await this.updateTaskMetrics(processingTask.task.agentType, result);

    // Update dependency status
    const dependency = this.taskDependencies.get(result.taskId);
    if (dependency) {
      dependency.status = result.status === 'success' ? 'completed' : 'failed';
    }

    // Check for dependent tasks that can now be processed
    await this.processDependentTasks(result.taskId);

    // Try to process next pending task for this agent type
    await this.processNextPendingTask(processingTask.task.agentType);

    this.emit('taskCompleted', result);
  }

  private async handleTaskTimeout(taskId: string): Promise<void> {
    const processingTask = this.processingTasks.get(taskId);
    if (!processingTask) return;

    console.warn(`Task ${taskId} timed out`);

    // Cancel the task
    await agentCommunication.cancelTask(taskId);

    // Create timeout result
    const result: TaskResult = {
      taskId,
      agentId: processingTask.agentId,
      status: 'timeout',
      error: 'Task execution timed out',
      executionTime: Date.now() - processingTask.startTime,
    };

    await this.handleTaskCompletion(result);
  }

  private async handleTaskFailure(taskId: string, error: Error): Promise<void> {
    const task = this.pendingTasks.get(taskId) || this.processingTasks.get(taskId)?.task;
    if (!task) return;

    const result: TaskResult = {
      taskId,
      agentId: 'unknown',
      status: 'error',
      error: error.message,
      executionTime: 0,
    };

    // Check retry policy
    const retryPolicy = task.retryPolicy;
    const currentRetryCount = task.payload?.retryCount || 0;
    
    if (retryPolicy && currentRetryCount < retryPolicy.maxRetries && this.isRetryableError(error)) {
      // Retry the task
      const retryCount = currentRetryCount + 1;
      const delay = retryPolicy.initialDelay * Math.pow(retryPolicy.backoffMultiplier, retryCount - 1);

      console.log(`Retrying task ${taskId} (attempt ${retryCount}/${retryPolicy.maxRetries}) after ${delay}ms`);

      // Log retry attempt
      this.emit('taskRetry', {
        taskId,
        retryCount,
        maxRetries: retryPolicy.maxRetries,
        delay,
        error: error.message,
      });

      setTimeout(async () => {
        const retryTask = {
          ...task,
          payload: {
            ...task.payload,
            retryCount,
            originalError: error.message,
          },
        };
        await this.processTask(retryTask);
      }, delay);

      return;
    }

    // No more retries or non-retryable error, mark as failed
    console.error(`Task ${taskId} failed permanently after ${currentRetryCount} retries: ${error.message}`);
    
    // Create system alert for task failure
    try {
      const { errorNotificationService } = await import('../../services/errorNotificationService');
      await errorNotificationService.notifySystemIssue(
        `${task.agentType}-agent`,
        'medium',
        `Task failed permanently: ${error.message}`,
        {
          taskId,
          taskType: task.type,
          agentType: task.agentType,
          retryCount: currentRetryCount,
          error: error.message,
          stack: error.stack,
        }
      );
    } catch (notificationError) {
      console.error('Failed to create system alert for task failure:', notificationError);
    }

    await this.handleTaskCompletion(result);
  }

  private isRetryableError(error: Error): boolean {
    const retryablePatterns = [
      /timeout/i,
      /connection/i,
      /network/i,
      /temporary/i,
      /rate limit/i,
      /service unavailable/i,
      /internal server error/i,
      /502/i,
      /503/i,
      /504/i,
    ];

    const nonRetryablePatterns = [
      /authentication/i,
      /authorization/i,
      /forbidden/i,
      /not found/i,
      /bad request/i,
      /invalid/i,
      /malformed/i,
    ];

    // Check non-retryable patterns first
    if (nonRetryablePatterns.some(pattern => pattern.test(error.message))) {
      return false;
    }

    // Check retryable patterns
    return retryablePatterns.some(pattern => pattern.test(error.message));
  }

  private handleTaskProgress(progress: any): void {
    this.emit('taskProgress', progress);
  }

  private handleAgentStatusChange(status: any): void {
    // If agent becomes available, try to process pending tasks
    if (status.status === 'active') {
      const agentType = this.getAgentTypeById(status.agentId);
      if (agentType) {
        this.processNextPendingTask(agentType);
      }
    }
  }

  private getAgentTypeById(agentId: string): AgentType | null {
    const agents = agentCommunication.getRegisteredAgents();
    const agent = agents.find(a => a.agentId === agentId);
    return agent?.agentType || null;
  }

  private async processDependentTasks(completedTaskId: string): Promise<void> {
    for (const [taskId, dependency] of this.taskDependencies.entries()) {
      if (dependency.dependsOn.includes(completedTaskId)) {
        await this.checkDependencies(taskId);
      }
    }
  }

  private async processNextPendingTask(agentType: AgentType): Promise<void> {
    const queue = this.taskQueues.get(agentType);
    if (!queue || queue.currentTasks >= queue.maxConcurrency) {
      return;
    }

    // Check for queue backlog and alert if necessary
    const pendingTasksForAgent = Array.from(this.pendingTasks.values())
      .filter(task => task.agentType === agentType);
    
    if (pendingTasksForAgent.length > queue.maxConcurrency * 3) {
      try {
        const { errorNotificationService } = await import('../../services/errorNotificationService');
        await errorNotificationService.notifyQueueBacklog(
          agentType,
          pendingTasksForAgent.length,
          queue.maxConcurrency * 2
        );
      } catch (error) {
        console.error('Failed to create queue backlog alert:', error);
      }
    }

    // Find next ready task for this agent type
    for (const [taskId, task] of this.pendingTasks.entries()) {
      if (task.agentType === agentType) {
        const dependency = this.taskDependencies.get(taskId);
        if (!dependency || dependency.status === 'ready') {
          await this.processTask(task);
          break;
        }
      }
    }
  }

  private async updateTaskMetrics(agentType: AgentType, result: TaskResult): Promise<void> {
    const metrics = this.taskMetrics.get(agentType);
    if (!metrics) return;

    metrics.totalTasks++;
    
    if (result.status === 'success') {
      metrics.completedTasks++;
    } else {
      metrics.failedTasks++;
    }

    // Update average execution time
    const totalExecutionTime = metrics.averageExecutionTime * (metrics.totalTasks - 1) + result.executionTime;
    metrics.averageExecutionTime = totalExecutionTime / metrics.totalTasks;

    // Update error rate
    metrics.errorRate = metrics.failedTasks / metrics.totalTasks;

    // Calculate throughput (tasks per minute)
    // This is a simplified calculation - in production, you'd want a sliding window
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const recentTasks = Array.from(this.completedTasks.values()).filter(
      task => task.executionTime > oneMinuteAgo
    );
    metrics.throughput = recentTasks.length;
  }

  // Public API Methods
  getTaskStatus(taskId: string): {
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'timeout';
    task?: TaskDefinition;
    result?: TaskResult;
    progress?: any;
  } {
    if (this.completedTasks.has(taskId)) {
      const result = this.completedTasks.get(taskId)!;
      return {
        status: result.status === 'success' ? 'completed' : 
                result.status === 'timeout' ? 'timeout' : 'failed',
        result,
      };
    }

    if (this.processingTasks.has(taskId)) {
      const processingTask = this.processingTasks.get(taskId)!;
      return {
        status: 'processing',
        task: processingTask.task,
      };
    }

    if (this.pendingTasks.has(taskId)) {
      const task = this.pendingTasks.get(taskId)!;
      return {
        status: 'pending',
        task,
      };
    }

    throw new Error(`Task ${taskId} not found`);
  }

  getQueueStatus(agentType?: AgentType): TaskQueue[] {
    if (agentType) {
      const queue = this.taskQueues.get(agentType);
      return queue ? [queue] : [];
    }
    return Array.from(this.taskQueues.values());
  }

  getTaskMetrics(agentType?: AgentType): TaskMetrics[] {
    if (agentType) {
      const metrics = this.taskMetrics.get(agentType);
      return metrics ? [metrics] : [];
    }
    return Array.from(this.taskMetrics.values());
  }

  async cancelTask(taskId: string): Promise<void> {
    // Remove from pending tasks
    if (this.pendingTasks.has(taskId)) {
      this.pendingTasks.delete(taskId);
      console.log(`Pending task ${taskId} cancelled`);
      return;
    }

    // Cancel processing task
    if (this.processingTasks.has(taskId)) {
      await agentCommunication.cancelTask(taskId);
      
      const processingTask = this.processingTasks.get(taskId)!;
      this.processingTasks.delete(taskId);

      // Update queue metrics
      const queue = this.taskQueues.get(processingTask.task.agentType);
      if (queue) {
        queue.currentTasks--;
      }

      // Clear timeout
      const timeout = this.taskTimeouts.get(taskId);
      if (timeout) {
        clearTimeout(timeout);
        this.taskTimeouts.delete(taskId);
      }

      console.log(`Processing task ${taskId} cancelled`);
      return;
    }

    throw new Error(`Task ${taskId} not found or already completed`);
  }

  async shutdown(): Promise<void> {
    // Clear all timeouts
    for (const timeout of this.taskTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.taskTimeouts.clear();

    // Cancel all processing tasks
    const processingTaskIds = Array.from(this.processingTasks.keys());
    for (const taskId of processingTaskIds) {
      try {
        await this.cancelTask(taskId);
      } catch (error) {
        console.error(`Error cancelling task ${taskId} during shutdown:`, error);
      }
    }

    console.log('Task Distribution System shut down');
  }
}

export const taskDistribution = new TaskDistributionSystem();