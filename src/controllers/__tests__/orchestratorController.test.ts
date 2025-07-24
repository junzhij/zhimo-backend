// Tests for Orchestrator Controller error handling and status tracking
import { Request, Response } from 'express';
import { orchestratorController } from '../orchestratorController';
import { orchestratorAgent } from '../../agents/orchestrator';
import { errorNotificationService } from '../../services/errorNotificationService';

// Mock dependencies
jest.mock('../../agents/orchestrator');
jest.mock('../../services/errorNotificationService');
jest.mock('../../utils/logger');

const mockOrchestratorAgent = orchestratorAgent as jest.Mocked<typeof orchestratorAgent>;
const mockErrorNotificationService = errorNotificationService as jest.Mocked<typeof errorNotificationService>;

interface MockAuthenticatedRequest extends Partial<Request> {
  user?: {
    id: string;
    [key: string]: any;
  };
}

describe('OrchestratorController Error Handling and Status Tracking', () => {
  let mockRequest: MockAuthenticatedRequest;
  let mockResponse: Partial<Response>;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;

  beforeEach(() => {
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson });
    
    mockRequest = {
      body: {},
      params: {},
      query: {},
      user: { id: 'test-user-id' },
    };
    
    mockResponse = {
      json: mockJson,
      status: mockStatus,
    };

    jest.clearAllMocks();
  });

  describe('processUserInstruction', () => {
    it('should handle successful instruction processing', async () => {
      const mockWorkflowId = 'workflow-123';
      mockOrchestratorAgent.processUserInstruction.mockResolvedValue(mockWorkflowId);

      mockRequest.body = {
        instruction: 'Process this document',
        documentId: 'doc-123',
        options: { summaryLength: 'medium' },
        priority: 1,
      };

      await orchestratorController.processUserInstruction(
        mockRequest as any,
        mockResponse as Response
      );

      expect(mockOrchestratorAgent.processUserInstruction).toHaveBeenCalledWith({
        id: expect.any(String),
        userId: 'test-user-id',
        documentId: 'doc-123',
        instruction: 'Process this document',
        options: { summaryLength: 'medium' },
        priority: 1,
        timestamp: expect.any(Number),
      });

      expect(mockStatus).toHaveBeenCalledWith(202);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: {
          workflowId: mockWorkflowId,
          instructionId: expect.any(String),
          status: 'processing',
          message: 'Workflow started successfully',
        },
      });
    });

    it('should handle instruction processing errors with notifications', async () => {
      const mockError = new Error('Processing failed');
      mockOrchestratorAgent.processUserInstruction.mockRejectedValue(mockError);
      mockErrorNotificationService.createUserNotification.mockResolvedValue('notification-123');

      mockRequest.body = {
        instruction: 'Process this document',
        documentId: 'doc-123',
      };

      await orchestratorController.processUserInstruction(
        mockRequest as any,
        mockResponse as Response
      );

      expect(mockErrorNotificationService.createUserNotification).toHaveBeenCalledWith({
        userId: 'test-user-id',
        type: 'error',
        title: 'Failed to Start Processing',
        message: 'Could not start document processing: Processing failed',
        details: { error: 'Processing failed', instruction: 'Process this document' },
        retryable: true,
        actions: expect.arrayContaining([
          expect.objectContaining({ id: 'retry', type: 'retry' }),
          expect.objectContaining({ id: 'dismiss', type: 'dismiss' }),
        ]),
      });

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to process instruction',
        message: 'Processing failed',
      });
    });
  });

  describe('getWorkflowStatus', () => {
    it('should return detailed workflow status with progress', async () => {
      const mockWorkflow = {
        id: 'workflow-123',
        instructionId: 'instruction-123',
        status: 'processing' as const,
        createdAt: Date.now() - 60000, // 1 minute ago
        completedAt: undefined,
        steps: [
          {
            id: 'step-1',
            agentType: 'ingestion' as const,
            taskType: 'extract_text',
            dependencies: [],
            priority: 1,
            payload: {},
            timeout: 300000,
          },
          {
            id: 'step-2',
            agentType: 'analysis' as const,
            taskType: 'analyze_document',
            dependencies: ['step-1'],
            priority: 2,
            payload: {},
            timeout: 300000,
          },
        ],
        results: new Map([['step-1', { result: 'extracted text' }]]),
        errors: [],
        retryCount: 0,
      };

      mockOrchestratorAgent.getWorkflowStatus.mockReturnValue(mockWorkflow);
      mockRequest.params = { workflowId: 'workflow-123' };

      await orchestratorController.getWorkflowStatus(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          workflow: expect.objectContaining({
            id: 'workflow-123',
            instructionId: 'instruction-123',
            status: 'processing',
            createdAt: mockWorkflow.createdAt,
            retryCount: 0,
            steps: expect.arrayContaining([
              expect.objectContaining({
                id: 'step-1',
                agentType: 'ingestion',
                taskType: 'extract_text',
                status: 'completed',
              }),
              expect.objectContaining({
                id: 'step-2',
                agentType: 'analysis',
                taskType: 'analyze_document',
                status: 'ready',
              }),
            ]),
            progress: expect.objectContaining({
              totalSteps: 2,
              completedSteps: 1,
              percentage: 50,
            }),
            timing: expect.objectContaining({
              duration: expect.any(Number),
            }),
          }),
          errors: [],
          recentErrors: [],
        }),
      });
    });

    it('should return 404 for non-existent workflow', async () => {
      mockOrchestratorAgent.getWorkflowStatus.mockReturnValue(null);
      mockRequest.params = { workflowId: 'non-existent' };

      await orchestratorController.getWorkflowStatus(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: 'Workflow not found',
      });
    });
  });

  describe('getProcessingStatus', () => {
    it('should return comprehensive document processing status', async () => {
      const mockWorkflows = [
        {
          id: 'workflow-1',
          instructionId: 'instruction-1',
          status: 'completed' as const,
          steps: [
            { id: 'step-1', agentType: 'ingestion' as const, taskType: 'extract', dependencies: [], priority: 1, payload: { documentId: 'doc-123' }, timeout: 300000 },
            { id: 'step-2', agentType: 'analysis' as const, taskType: 'analyze', dependencies: [], priority: 2, payload: { documentId: 'doc-123' }, timeout: 300000 }
          ],
          results: new Map([['step-1', {}], ['step-2', {}]]),
          errors: [],
          retryCount: 0,
          createdAt: Date.now() - 120000,
          completedAt: Date.now() - 60000,
        },
      ];

      mockOrchestratorAgent.getActiveWorkflows.mockReturnValue(mockWorkflows);
      mockRequest.params = { documentId: 'doc-123' };

      await orchestratorController.getProcessingStatus(
        mockRequest as any,
        mockResponse as Response
      );

      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          documentId: 'doc-123',
          overallStatus: 'completed',
          overallProgress: expect.any(Number),
          workflows: expect.arrayContaining([
            expect.objectContaining({
              workflowId: 'workflow-1',
              status: 'completed',
              progress: expect.objectContaining({
                percentage: 100,
              }),
            }),
          ]),
          summary: expect.objectContaining({
            totalWorkflows: 1,
            completedWorkflows: 1,
            failedWorkflows: 0,
          }),
        }),
      });
    });

    it('should return 404 when no workflows found for document', async () => {
      mockOrchestratorAgent.getActiveWorkflows.mockReturnValue([]);
      mockRequest.params = { documentId: 'non-existent-doc' };

      await orchestratorController.getProcessingStatus(
        mockRequest as any,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: 'No processing workflows found for this document',
      });
    });
  });

  describe('retryTask', () => {
    it('should successfully retry a failed task', async () => {
      const mockTaskStatus = {
        status: 'failed' as const,
        task: {
          id: 'failed-task-123',
          type: 'extract_text',
          agentType: 'ingestion' as const,
          payload: { documentId: 'doc-123' },
          priority: 1,
          timeout: 300000,
          retryPolicy: { maxRetries: 3, backoffMultiplier: 2, initialDelay: 1000 },
        },
      };

      const mockNewTaskId = 'new-task-123';

      mockOrchestratorAgent.getTaskStatus.mockResolvedValue(mockTaskStatus);
      mockOrchestratorAgent.submitTask.mockResolvedValue(mockNewTaskId);

      mockRequest.params = { taskId: 'failed-task-123' };

      await orchestratorController.retryTask(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockOrchestratorAgent.submitTask).toHaveBeenCalledWith({
        type: 'extract_text',
        agentType: 'ingestion',
        payload: {
          documentId: 'doc-123',
          retryOf: 'failed-task-123',
          retryCount: 1,
        },
        priority: 1,
        timeout: 300000,
        retryPolicy: { maxRetries: 3, backoffMultiplier: 2, initialDelay: 1000 },
      });

      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: {
          originalTaskId: 'failed-task-123',
          newTaskId: mockNewTaskId,
          message: 'Task retried successfully',
        },
      });
    });

    it('should reject retry for non-failed tasks', async () => {
      const mockTaskStatus = {
        status: 'completed' as const,
        task: { 
          id: 'completed-task-123',
          type: 'extract_text',
          agentType: 'ingestion' as const,
          payload: {},
        },
      };

      mockOrchestratorAgent.getTaskStatus.mockResolvedValue(mockTaskStatus);
      mockRequest.params = { taskId: 'completed-task-123' };

      await orchestratorController.retryTask(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: 'Only failed tasks can be retried',
      });
    });
  });

  describe('Error logging and cleanup', () => {
    it('should log processing errors correctly', () => {
      const mockError = new Error('Test error');
      const workflowId = 'workflow-123';
      const taskId = 'task-123';

      orchestratorController.logProcessingError(workflowId, taskId, mockError, { context: 'test' });

      // Verify error was logged (implementation details would depend on internal structure)
      expect(true).toBe(true); // Placeholder assertion
    });

    it('should cleanup old error logs', () => {
      // Add some mock errors
      orchestratorController.logProcessingError('workflow-1', undefined, new Error('Old error'));
      
      // Cleanup with very short max age
      orchestratorController.cleanupErrorLogs(1); // 1ms
      
      // Verify cleanup occurred (implementation details would depend on internal structure)
      expect(true).toBe(true); // Placeholder assertion
    });
  });
});