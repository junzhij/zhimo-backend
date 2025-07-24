import { Request, Response } from 'express';
import { orchestratorAgent } from '../agents/orchestrator';
import { UserInstruction } from '../agents/orchestrator/workflowManager';
import { TaskDefinition } from '../agents/orchestrator/communication';
import { Logger } from '../utils/logger';
import { errorNotificationService } from '../services/errorNotificationService';
import { v4 as uuidv4 } from 'uuid';

// Extend Request interface to include user
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    [key: string]: any;
  };
}

export interface ProcessingError {
  id: string;
  workflowId?: string;
  taskId?: string;
  error: string;
  timestamp: number;
  context?: any;
  retryCount?: number;
}

class OrchestratorController {
  private errorLogs: Map<string, ProcessingError[]> = new Map();
  private maxErrorLogs = 100; // Maximum error logs per workflow/task

  // Workflow Management Methods

  async processUserInstruction(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.user?.id || 'anonymous'; // Assuming auth middleware sets req.user
    
    try {
      const { instruction, documentId, options, priority } = req.body;

      const userInstruction: UserInstruction = {
        id: uuidv4(),
        userId,
        documentId,
        instruction,
        options,
        priority,
        timestamp: Date.now(),
      };

      Logger.info('Processing user instruction', {
        instructionId: userInstruction.id,
        userId,
        documentId,
        instruction: instruction.substring(0, 100), // Log first 100 chars
      });

      const workflowId = await orchestratorAgent.processUserInstruction(userInstruction);

      res.status(202).json({
        success: true,
        data: {
          workflowId,
          instructionId: userInstruction.id,
          status: 'processing',
          message: 'Workflow started successfully',
        },
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('Failed to process user instruction', { error: errorMessage });
      this.logError(undefined, undefined, error as Error);
      
      // Notify user of the error
      try {
        await errorNotificationService.createUserNotification({
          userId: userId,
          type: 'error',
          title: 'Failed to Start Processing',
          message: `Could not start document processing: ${errorMessage}`,
          details: { error: errorMessage, instruction: req.body.instruction?.substring(0, 100) },
          retryable: true,
          actions: [
            {
              id: 'retry',
              label: 'Try Again',
              type: 'retry',
            },
            {
              id: 'dismiss',
              label: 'Dismiss',
              type: 'dismiss',
            },
          ],
        });
      } catch (notificationError) {
        Logger.error('Failed to create error notification', { error: notificationError });
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to process instruction',
        message: errorMessage,
      });
    }
  }

  async getWorkflowStatus(req: Request, res: Response): Promise<void> {
    try {
      const { workflowId } = req.params;
      
      const workflow = orchestratorAgent.getWorkflowStatus(workflowId);
      
      if (!workflow) {
        res.status(404).json({
          success: false,
          error: 'Workflow not found',
        });
        return;
      }

      // Get error logs for this workflow
      const errors = this.errorLogs.get(workflowId) || [];

      // Calculate detailed progress
      const stepStatuses = await Promise.all(
        workflow.steps.map(async (step) => {
          try {
            // Check if step has been executed by looking for results
            const hasResult = workflow.results.has(step.id);
            const stepErrors = errors.filter(e => e.taskId === step.id);
            
            let status = 'pending';
            if (hasResult) {
              status = 'completed';
            } else if (stepErrors.length > 0) {
              status = 'failed';
            } else {
              // Check if dependencies are met
              const dependenciesMet = step.dependencies.every(depId => 
                workflow.results.has(depId)
              );
              if (dependenciesMet && step.dependencies.length > 0) {
                status = 'ready';
              } else if (step.dependencies.length === 0) {
                status = 'ready';
              }
            }

            return {
              id: step.id,
              agentType: step.agentType,
              taskType: step.taskType,
              dependencies: step.dependencies,
              priority: step.priority,
              status,
              errors: stepErrors.length,
              result: workflow.results.get(step.id) ? 'available' : null,
            };
          } catch (stepError) {
            return {
              id: step.id,
              agentType: step.agentType,
              taskType: step.taskType,
              dependencies: step.dependencies,
              priority: step.priority,
              status: 'error',
              errors: 1,
              result: null,
            };
          }
        })
      );

      const completedSteps = stepStatuses.filter(s => s.status === 'completed').length;
      const failedSteps = stepStatuses.filter(s => s.status === 'failed').length;
      const processingSteps = stepStatuses.filter(s => s.status === 'processing').length;
      const pendingSteps = stepStatuses.filter(s => s.status === 'pending').length;

      res.json({
        success: true,
        data: {
          workflow: {
            id: workflow.id,
            instructionId: workflow.instructionId,
            status: workflow.status,
            createdAt: workflow.createdAt,
            completedAt: workflow.completedAt,
            retryCount: workflow.retryCount,
            steps: stepStatuses,
            progress: {
              totalSteps: workflow.steps.length,
              completedSteps,
              failedSteps,
              processingSteps,
              pendingSteps,
              percentage: Math.round((completedSteps / workflow.steps.length) * 100),
            },
            timing: {
              duration: workflow.completedAt ? 
                workflow.completedAt - workflow.createdAt : 
                Date.now() - workflow.createdAt,
              estimatedCompletion: this.estimateCompletionTime(workflow, completedSteps),
            },
          },
          errors: errors.slice(-5), // Return last 5 errors
          recentErrors: errors.filter(e => Date.now() - e.timestamp < 300000), // Last 5 minutes
        },
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('Failed to get workflow status', { workflowId: req.params.workflowId, error: errorMessage });
      
      res.status(500).json({
        success: false,
        error: 'Failed to get workflow status',
        message: errorMessage,
      });
    }
  }

  private estimateCompletionTime(workflow: any, completedSteps: number): number | null {
    if (workflow.status === 'completed') return 0;
    if (completedSteps === 0) return null;

    const elapsed = Date.now() - workflow.createdAt;
    const avgTimePerStep = elapsed / completedSteps;
    const remainingSteps = workflow.steps.length - completedSteps;
    
    return Math.round(avgTimePerStep * remainingSteps);
  }

  async cancelWorkflow(req: Request, res: Response): Promise<void> {
    try {
      const { workflowId } = req.params;
      
      await orchestratorAgent.cancelWorkflow(workflowId);
      
      Logger.info('Workflow cancelled', { workflowId });
      
      res.json({
        success: true,
        message: 'Workflow cancelled successfully',
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('Failed to cancel workflow', { workflowId: req.params.workflowId, error: errorMessage });
      
      res.status(500).json({
        success: false,
        error: 'Failed to cancel workflow',
        message: errorMessage,
      });
    }
  }

  async listWorkflows(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id || 'anonymous';
      const activeWorkflows = orchestratorAgent.getActiveWorkflows();
      
      // Filter workflows by user (in a real implementation, you'd store userId in workflow)
      const userWorkflows = activeWorkflows.map(workflow => ({
        id: workflow.id,
        instructionId: workflow.instructionId,
        status: workflow.status,
        createdAt: workflow.createdAt,
        completedAt: workflow.completedAt,
        stepsCount: workflow.steps.length,
        completedSteps: workflow.results.size,
      }));

      res.json({
        success: true,
        data: {
          workflows: userWorkflows,
          total: userWorkflows.length,
        },
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('Failed to list workflows', { error: errorMessage });
      
      res.status(500).json({
        success: false,
        error: 'Failed to list workflows',
        message: errorMessage,
      });
    }
  }

  // Task Management Methods

  async submitTask(req: Request, res: Response): Promise<void> {
    try {
      const { type, agentType, payload, priority, timeout, retryPolicy } = req.body;
      
      const taskDefinition: Omit<TaskDefinition, 'id'> = {
        type,
        agentType,
        payload,
        priority,
        timeout,
        retryPolicy,
      };

      const taskId = await orchestratorAgent.submitTask(taskDefinition);
      
      Logger.info('Task submitted', { taskId, type, agentType });
      
      res.status(202).json({
        success: true,
        data: {
          taskId,
          status: 'submitted',
          message: 'Task submitted successfully',
        },
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('Failed to submit task', { error: errorMessage });
      this.logError(undefined, undefined, error as Error);
      
      res.status(500).json({
        success: false,
        error: 'Failed to submit task',
        message: errorMessage,
      });
    }
  }

  async getTaskStatus(req: Request, res: Response): Promise<void> {
    try {
      const { taskId } = req.params;
      
      const taskStatus = await orchestratorAgent.getTaskStatus(taskId);
      
      // Get error logs for this task
      const errors = this.errorLogs.get(taskId) || [];

      res.json({
        success: true,
        data: {
          taskId,
          status: taskStatus.status,
          task: taskStatus.task,
          result: taskStatus.result,
          progress: taskStatus.progress,
          errors: errors.slice(-3), // Return last 3 errors
        },
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('Failed to get task status', { taskId: req.params.taskId, error: errorMessage });
      
      res.status(500).json({
        success: false,
        error: 'Failed to get task status',
        message: errorMessage,
      });
    }
  }

  async cancelTask(req: Request, res: Response): Promise<void> {
    try {
      const { taskId } = req.params;
      
      await orchestratorAgent.cancelTask(taskId);
      
      Logger.info('Task cancelled', { taskId });
      
      res.json({
        success: true,
        message: 'Task cancelled successfully',
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('Failed to cancel task', { taskId: req.params.taskId, error: errorMessage });
      
      res.status(500).json({
        success: false,
        error: 'Failed to cancel task',
        message: errorMessage,
      });
    }
  }

  // System Health and Monitoring Methods

  async getSystemHealth(req: Request, res: Response): Promise<void> {
    try {
      const health = await orchestratorAgent.getSystemHealth();
      
      res.json({
        success: true,
        data: health,
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('Failed to get system health', { error: errorMessage });
      
      res.status(500).json({
        success: false,
        error: 'Failed to get system health',
        message: errorMessage,
      });
    }
  }

  async getAgentStatus(req: Request, res: Response): Promise<void> {
    try {
      const { agentType } = req.query;
      
      const agents = await orchestratorAgent.getAgentHealth();
      const filteredAgents = agentType 
        ? agents.filter(agent => agent.agentType === agentType)
        : agents;

      res.json({
        success: true,
        data: {
          agents: filteredAgents,
          total: filteredAgents.length,
          healthy: filteredAgents.filter(agent => agent.isHealthy).length,
        },
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('Failed to get agent status', { error: errorMessage });
      
      res.status(500).json({
        success: false,
        error: 'Failed to get agent status',
        message: errorMessage,
      });
    }
  }

  async getQueueStatus(req: Request, res: Response): Promise<void> {
    try {
      const { agentType } = req.query;
      
      const queues = orchestratorAgent.getQueueStatus(agentType as any);
      
      res.json({
        success: true,
        data: {
          queues,
          total: queues.length,
        },
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('Failed to get queue status', { error: errorMessage });
      
      res.status(500).json({
        success: false,
        error: 'Failed to get queue status',
        message: errorMessage,
      });
    }
  }

  async getTaskMetrics(req: Request, res: Response): Promise<void> {
    try {
      const { agentType } = req.query;
      
      const metrics = orchestratorAgent.getTaskMetrics(agentType as any);
      
      res.json({
        success: true,
        data: {
          metrics,
          total: metrics.length,
        },
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('Failed to get task metrics', { error: errorMessage });
      
      res.status(500).json({
        success: false,
        error: 'Failed to get task metrics',
        message: errorMessage,
      });
    }
  }

  // Error Handling and Retry Methods

  async retryWorkflow(req: Request, res: Response): Promise<void> {
    try {
      const { workflowId } = req.params;
      
      // Get the original workflow
      const workflow = orchestratorAgent.getWorkflowStatus(workflowId);
      
      if (!workflow) {
        res.status(404).json({
          success: false,
          error: 'Workflow not found',
        });
        return;
      }

      if (workflow.status !== 'failed') {
        res.status(400).json({
          success: false,
          error: 'Only failed workflows can be retried',
        });
        return;
      }

      // For now, we'll need to recreate the workflow
      // In a full implementation, you'd store the original instruction
      Logger.info('Workflow retry requested', { workflowId });
      
      res.status(501).json({
        success: false,
        error: 'Workflow retry not yet implemented',
        message: 'Please resubmit the original instruction',
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('Failed to retry workflow', { workflowId: req.params.workflowId, error: errorMessage });
      
      res.status(500).json({
        success: false,
        error: 'Failed to retry workflow',
        message: errorMessage,
      });
    }
  }

  async retryTask(req: Request, res: Response): Promise<void> {
    try {
      const { taskId } = req.params;
      
      // Get the original task
      const taskStatus = await orchestratorAgent.getTaskStatus(taskId);
      
      if (taskStatus.status !== 'failed') {
        res.status(400).json({
          success: false,
          error: 'Only failed tasks can be retried',
        });
        return;
      }

      if (!taskStatus.task) {
        res.status(404).json({
          success: false,
          error: 'Task not found',
        });
        return;
      }

      // Resubmit the task
      const newTaskId = await orchestratorAgent.submitTask({
        type: taskStatus.task.type,
        agentType: taskStatus.task.agentType,
        payload: {
          ...taskStatus.task.payload,
          retryOf: taskId,
          retryCount: (taskStatus.task.payload?.retryCount || 0) + 1,
        },
        priority: taskStatus.task.priority,
        timeout: taskStatus.task.timeout,
        retryPolicy: taskStatus.task.retryPolicy,
      });

      Logger.info('Task retried', { originalTaskId: taskId, newTaskId });
      
      res.json({
        success: true,
        data: {
          originalTaskId: taskId,
          newTaskId,
          message: 'Task retried successfully',
        },
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('Failed to retry task', { taskId: req.params.taskId, error: errorMessage });
      this.logError(undefined, req.params.taskId, error as Error);
      
      res.status(500).json({
        success: false,
        error: 'Failed to retry task',
        message: errorMessage,
      });
    }
  }

  async getWorkflowErrors(req: Request, res: Response): Promise<void> {
    try {
      const { workflowId } = req.params;
      const { limit = 20, offset = 0 } = req.query;
      
      const errors = this.errorLogs.get(workflowId) || [];
      const paginatedErrors = errors
        .slice(Number(offset), Number(offset) + Number(limit))
        .map(error => ({
          id: error.id,
          error: error.error,
          timestamp: error.timestamp,
          context: error.context,
          retryCount: error.retryCount,
        }));

      res.json({
        success: true,
        data: {
          errors: paginatedErrors,
          total: errors.length,
          offset: Number(offset),
          limit: Number(limit),
        },
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('Failed to get workflow errors', { workflowId: req.params.workflowId, error: errorMessage });
      
      res.status(500).json({
        success: false,
        error: 'Failed to get workflow errors',
        message: errorMessage,
      });
    }
  }

  async getTaskErrors(req: Request, res: Response): Promise<void> {
    try {
      const { taskId } = req.params;
      const { limit = 20, offset = 0 } = req.query;
      
      const errors = this.errorLogs.get(taskId) || [];
      const paginatedErrors = errors
        .slice(Number(offset), Number(offset) + Number(limit))
        .map(error => ({
          id: error.id,
          error: error.error,
          timestamp: error.timestamp,
          context: error.context,
          retryCount: error.retryCount,
        }));

      res.json({
        success: true,
        data: {
          errors: paginatedErrors,
          total: errors.length,
          offset: Number(offset),
          limit: Number(limit),
        },
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('Failed to get task errors', { taskId: req.params.taskId, error: errorMessage });
      
      res.status(500).json({
        success: false,
        error: 'Failed to get task errors',
        message: errorMessage,
      });
    }
  }

  // Error Logging Helper Methods

  private logError(workflowId?: string, taskId?: string, error?: Error, context?: any): void {
    const errorLog: ProcessingError = {
      id: uuidv4(),
      workflowId,
      taskId,
      error: error?.message || 'Unknown error',
      timestamp: Date.now(),
      context,
    };

    const key = workflowId || taskId;
    if (key) {
      const existingErrors = this.errorLogs.get(key) || [];
      existingErrors.push(errorLog);
      
      // Keep only the most recent errors
      if (existingErrors.length > this.maxErrorLogs) {
        existingErrors.splice(0, existingErrors.length - this.maxErrorLogs);
      }
      
      this.errorLogs.set(key, existingErrors);
    }

    // Also log to the main logger
    Logger.error('Processing error logged', {
      errorId: errorLog.id,
      workflowId,
      taskId,
      error: error?.message,
      context,
    });
  }

  // Public method to log errors from other parts of the system
  public logProcessingError(workflowId?: string, taskId?: string, error?: Error, context?: any): void {
    this.logError(workflowId, taskId, error, context);
  }

  // Enhanced processing status endpoint
  async getProcessingStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id || 'anonymous';
      const { documentId } = req.params;

      // Get all workflows for this document
      const allWorkflows = orchestratorAgent.getActiveWorkflows();
      const documentWorkflows = allWorkflows.filter(workflow => {
        // For now, we'll match by document ID in the workflow steps
        // In a full implementation, you'd store document metadata in the workflow
        return workflow.steps.some(step => 
          step.payload?.documentId === documentId
        );
      });

      if (documentWorkflows.length === 0) {
        res.status(404).json({
          success: false,
          error: 'No processing workflows found for this document',
        });
        return;
      }

      // Get detailed status for each workflow
      const workflowStatuses = await Promise.all(
        documentWorkflows.map(async (workflow) => {
          const errors = this.errorLogs.get(workflow.id) || [];
          
          return {
            workflowId: workflow.id,
            status: workflow.status,
            instruction: 'Document processing workflow', // Simplified for now
            progress: {
              totalSteps: workflow.steps.length,
              completedSteps: workflow.results.size,
              failedSteps: errors.length,
              percentage: Math.round((workflow.results.size / workflow.steps.length) * 100),
            },
            timing: {
              startedAt: workflow.createdAt,
              completedAt: workflow.completedAt,
              duration: workflow.completedAt ? 
                workflow.completedAt - workflow.createdAt : 
                Date.now() - workflow.createdAt,
            },
            errors: errors.slice(-3),
            retryable: errors.some(e => this.isRetryableError(e.error)),
          };
        })
      );

      // Calculate overall document processing status
      const overallStatus = this.calculateOverallStatus(workflowStatuses);
      const totalProgress = workflowStatuses.reduce((sum, w) => sum + w.progress.percentage, 0) / workflowStatuses.length;

      res.json({
        success: true,
        data: {
          documentId,
          overallStatus,
          overallProgress: Math.round(totalProgress),
          workflows: workflowStatuses,
          summary: {
            totalWorkflows: workflowStatuses.length,
            completedWorkflows: workflowStatuses.filter(w => w.status === 'completed').length,
            failedWorkflows: workflowStatuses.filter(w => w.status === 'failed').length,
            processingWorkflows: workflowStatuses.filter(w => w.status === 'processing').length,
            totalErrors: workflowStatuses.reduce((sum, w) => sum + w.errors.length, 0),
            retryableErrors: workflowStatuses.reduce((sum, w) => sum + (w.retryable ? 1 : 0), 0),
          },
        },
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('Failed to get processing status', { 
        documentId: req.params.documentId, 
        error: errorMessage 
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to get processing status',
        message: errorMessage,
      });
    }
  }

  private calculateOverallStatus(workflowStatuses: any[]): string {
    if (workflowStatuses.every(w => w.status === 'completed')) {
      return 'completed';
    }
    if (workflowStatuses.some(w => w.status === 'failed')) {
      return 'failed';
    }
    if (workflowStatuses.some(w => w.status === 'processing')) {
      return 'processing';
    }
    return 'pending';
  }

  private isRetryableError(errorMessage: string): boolean {
    const retryablePatterns = [
      /timeout/i,
      /connection/i,
      /network/i,
      /temporary/i,
      /rate limit/i,
      /service unavailable/i,
      /internal server error/i,
    ];

    return retryablePatterns.some(pattern => pattern.test(errorMessage));
  }

  // Cleanup old error logs (should be called periodically)
  public cleanupErrorLogs(maxAge: number = 86400000): void { // 24 hours default
    const now = Date.now();
    
    for (const [key, errors] of this.errorLogs.entries()) {
      const filteredErrors = errors.filter(error => now - error.timestamp < maxAge);
      
      if (filteredErrors.length === 0) {
        this.errorLogs.delete(key);
      } else {
        this.errorLogs.set(key, filteredErrors);
      }
    }
  }
}

export const orchestratorController = new OrchestratorController();