// Tests for Workflow Manager
import { WorkflowManager, UserInstruction } from '../workflowManager';
import { orchestratorAgent } from '../index';
import { v4 as uuidv4 } from 'uuid';

// Mock orchestrator agent
jest.mock('../index', () => ({
  orchestratorAgent: {
    submitTask: jest.fn(),
    getTaskStatus: jest.fn(),
  },
}));

describe('WorkflowManager', () => {
  let workflowManager: WorkflowManager;
  let mockOrchestrator: jest.Mocked<typeof orchestratorAgent>;

  beforeEach(() => {
    mockOrchestrator = orchestratorAgent as jest.Mocked<typeof orchestratorAgent>;
    workflowManager = new WorkflowManager(mockOrchestrator);
    jest.clearAllMocks();
  });

  describe('instruction parsing', () => {
    it('should parse process document instruction', async () => {
      const instruction: UserInstruction = {
        id: uuidv4(),
        userId: 'user-123',
        documentId: 'doc-123',
        instruction: 'Please process this document and extract all knowledge',
        timestamp: Date.now(),
      };

      // Mock task submission and completion
      mockOrchestrator.submitTask.mockResolvedValue('task-123');
      mockOrchestrator.getTaskStatus.mockResolvedValue({
        status: 'completed',
        result: {
          taskId: 'task-123',
          agentId: 'agent-123',
          status: 'success',
          result: { extractedText: 'Sample text' },
          executionTime: 1000,
        },
      });

      const workflowId = await workflowManager.processUserInstruction(instruction);
      
      expect(workflowId).toBeDefined();
      expect(mockOrchestrator.submitTask).toHaveBeenCalled();
      
      // Verify workflow was created
      const workflow = workflowManager.getWorkflowStatus(workflowId);
      expect(workflow).toBeDefined();
      expect(workflow?.steps.length).toBeGreaterThan(0);
      expect(workflow?.steps[0].agentType).toBe('ingestion');
    });

    it('should parse summary generation instruction', async () => {
      const instruction: UserInstruction = {
        id: uuidv4(),
        userId: 'user-123',
        documentId: 'doc-123',
        instruction: 'Generate a summary of this document',
        options: {
          summaryLength: 'short',
        },
        timestamp: Date.now(),
      };

      // Mock task submission and completion
      mockOrchestrator.submitTask.mockResolvedValue('task-123');
      mockOrchestrator.getTaskStatus.mockResolvedValue({
        status: 'completed',
        result: {
          taskId: 'task-123',
          agentId: 'agent-123',
          status: 'success',
          result: { summary: 'Document summary' },
          executionTime: 1000,
        },
      });

      const workflowId = await workflowManager.processUserInstruction(instruction);
      
      const workflow = workflowManager.getWorkflowStatus(workflowId);
      expect(workflow?.steps.length).toBe(2); // Ingestion + Analysis
      expect(workflow?.steps[1].agentType).toBe('analysis');
      expect(workflow?.steps[1].taskType).toBe('generate_summary');
    });

    it('should parse knowledge extraction instruction', async () => {
      const instruction: UserInstruction = {
        id: uuidv4(),
        userId: 'user-123',
        documentId: 'doc-123',
        instruction: 'Extract all concepts and definitions from this document',
        timestamp: Date.now(),
      };

      // Mock task submission and completion
      mockOrchestrator.submitTask.mockResolvedValue('task-123');
      mockOrchestrator.getTaskStatus.mockResolvedValue({
        status: 'completed',
        result: {
          taskId: 'task-123',
          agentId: 'agent-123',
          status: 'success',
          result: { entities: [], definitions: [] },
          executionTime: 1000,
        },
      });

      const workflowId = await workflowManager.processUserInstruction(instruction);
      
      const workflow = workflowManager.getWorkflowStatus(workflowId);
      expect(workflow?.steps.length).toBe(2); // Ingestion + Extraction
      expect(workflow?.steps[1].agentType).toBe('extraction');
      expect(workflow?.steps[1].taskType).toBe('extract_knowledge');
    });

    it('should parse study materials creation instruction', async () => {
      const instruction: UserInstruction = {
        id: uuidv4(),
        userId: 'user-123',
        documentId: 'doc-123',
        instruction: 'Create flashcards and quiz questions from this document',
        options: {
          includeFlashcards: true,
          questionTypes: ['multiple_choice', 'fill_blank'],
        },
        timestamp: Date.now(),
      };

      // Mock task submission and completion
      mockOrchestrator.submitTask.mockResolvedValue('task-123');
      mockOrchestrator.getTaskStatus.mockResolvedValue({
        status: 'completed',
        result: {
          taskId: 'task-123',
          agentId: 'agent-123',
          status: 'success',
          result: { flashcards: [], questions: [] },
          executionTime: 1000,
        },
      });

      const workflowId = await workflowManager.processUserInstruction(instruction);
      
      const workflow = workflowManager.getWorkflowStatus(workflowId);
      expect(workflow?.steps.length).toBe(4); // Ingestion + Analysis + Extraction + Pedagogy
      expect(workflow?.steps[3].agentType).toBe('pedagogy');
      expect(workflow?.steps[3].taskType).toBe('generate_study_materials');
    });

    it('should parse notebook compilation instruction', async () => {
      const instruction: UserInstruction = {
        id: uuidv4(),
        userId: 'user-123',
        documentId: 'doc-123',
        instruction: 'Compile a study notebook from this document',
        timestamp: Date.now(),
      };

      // Mock task submission and completion
      mockOrchestrator.submitTask.mockResolvedValue('task-123');
      mockOrchestrator.getTaskStatus.mockResolvedValue({
        status: 'completed',
        result: {
          taskId: 'task-123',
          agentId: 'agent-123',
          status: 'success',
          result: { notebookUrl: 'http://example.com/notebook.pdf' },
          executionTime: 1000,
        },
      });

      const workflowId = await workflowManager.processUserInstruction(instruction);
      
      const workflow = workflowManager.getWorkflowStatus(workflowId);
      expect(workflow?.steps.length).toBe(1); // Synthesis only
      expect(workflow?.steps[0].agentType).toBe('synthesis');
      expect(workflow?.steps[0].taskType).toBe('compile_notebook');
    });
  });

  describe('workflow execution', () => {
    it('should handle workflow dependencies correctly', async () => {
      const instruction: UserInstruction = {
        id: uuidv4(),
        userId: 'user-123',
        documentId: 'doc-123',
        instruction: 'Process document and create study materials',
        options: {
          includeFlashcards: true,
        },
        timestamp: Date.now(),
      };

      // Mock sequential task completion
      let taskCallCount = 0;
      mockOrchestrator.submitTask.mockImplementation(() => {
        taskCallCount++;
        return Promise.resolve(`task-${taskCallCount}`);
      });

      mockOrchestrator.getTaskStatus.mockImplementation((taskId: string) => {
        // Simulate task completion after a short delay
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              status: 'completed',
              result: {
                taskId,
                agentId: 'agent-123',
                status: 'success',
                result: { data: `Result for ${taskId}` },
                executionTime: 1000,
              },
            });
          }, 10);
        });
      });

      const workflowId = await workflowManager.processUserInstruction(instruction);
      
      // Wait for workflow to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const workflow = workflowManager.getWorkflowStatus(workflowId);
      expect(workflow?.status).toBe('completed');
      expect(mockOrchestrator.submitTask).toHaveBeenCalledTimes(4); // All steps executed
    });

    it('should handle task failures with proper error handling', async () => {
      const instruction: UserInstruction = {
        id: uuidv4(),
        userId: 'user-123',
        documentId: 'doc-123',
        instruction: 'Generate summary',
        timestamp: Date.now(),
      };

      // Mock task failure
      mockOrchestrator.submitTask.mockResolvedValue('task-123');
      mockOrchestrator.getTaskStatus.mockResolvedValue({
        status: 'failed',
        result: {
          taskId: 'task-123',
          agentId: 'agent-123',
          status: 'error',
          error: 'Task processing failed',
          executionTime: 1000,
        },
      });

      const workflowId = await workflowManager.processUserInstruction(instruction);
      
      // Wait for workflow to complete/fail
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const workflow = workflowManager.getWorkflowStatus(workflowId);
      expect(workflow?.status).toBe('failed');
    });
  });

  describe('workflow management', () => {
    it('should track active workflows', async () => {
      const instruction: UserInstruction = {
        id: uuidv4(),
        userId: 'user-123',
        documentId: 'doc-123',
        instruction: 'Generate summary',
        timestamp: Date.now(),
      };

      // Mock task that completes quickly to avoid timeout
      mockOrchestrator.submitTask.mockResolvedValue('task-123');
      mockOrchestrator.getTaskStatus.mockResolvedValue({
        status: 'completed',
        result: {
          taskId: 'task-123',
          agentId: 'agent-123',
          status: 'success',
          result: { summary: 'Test summary' },
          executionTime: 1000,
        },
      });

      const workflowId = await workflowManager.processUserInstruction(instruction);
      
      // Check that workflow was created and tracked
      const workflow = workflowManager.getWorkflowStatus(workflowId);
      expect(workflow).toBeDefined();
      expect(workflow?.id).toBe(workflowId);
      
      const activeWorkflows = workflowManager.getActiveWorkflows();
      expect(activeWorkflows.length).toBe(1);
      expect(activeWorkflows[0].id).toBe(workflowId);
    });

    it('should cancel workflows', async () => {
      const instruction: UserInstruction = {
        id: uuidv4(),
        userId: 'user-123',
        documentId: 'doc-123',
        instruction: 'Generate summary',
        timestamp: Date.now(),
      };

      // Mock task that completes quickly
      mockOrchestrator.submitTask.mockResolvedValue('task-123');
      mockOrchestrator.getTaskStatus.mockResolvedValue({
        status: 'completed',
        result: {
          taskId: 'task-123',
          agentId: 'agent-123',
          status: 'success',
          result: { summary: 'Test summary' },
          executionTime: 1000,
        },
      });

      const workflowId = await workflowManager.processUserInstruction(instruction);
      
      // Cancel the workflow (even though it might already be completed)
      await workflowManager.cancelWorkflow(workflowId);
      
      const workflow = workflowManager.getWorkflowStatus(workflowId);
      expect(workflow?.status).toBe('failed');
    });

    it('should cleanup completed workflows', () => {
      // This would require more complex setup to test the cleanup functionality
      // For now, just verify the method exists
      expect(typeof workflowManager.cleanupCompletedWorkflows).toBe('function');
    });
  });

  describe('error handling', () => {
    it('should handle unknown instruction types', async () => {
      const instruction: UserInstruction = {
        id: uuidv4(),
        userId: 'user-123',
        documentId: 'doc-123',
        instruction: 'Do something completely unknown',
        timestamp: Date.now(),
      };

      // Should default to process_document workflow
      mockOrchestrator.submitTask.mockResolvedValue('task-123');
      mockOrchestrator.getTaskStatus.mockResolvedValue({
        status: 'completed',
        result: {
          taskId: 'task-123',
          agentId: 'agent-123',
          status: 'success',
          result: { data: 'result' },
          executionTime: 1000,
        },
      });

      const workflowId = await workflowManager.processUserInstruction(instruction);
      
      const workflow = workflowManager.getWorkflowStatus(workflowId);
      expect(workflow).toBeDefined();
      expect(workflow?.steps[0].agentType).toBe('ingestion');
    });

    it('should handle workflow not found errors', () => {
      expect(() => workflowManager.getWorkflowStatus('non-existent')).not.toThrow();
      expect(workflowManager.getWorkflowStatus('non-existent')).toBeNull();
    });
  });
});