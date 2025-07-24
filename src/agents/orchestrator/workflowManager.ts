// Workflow Management and Task Planning System
import { TaskDefinition, AgentType } from './communication';
import { Logger } from '../../utils/logger';
import { errorNotificationService } from '../../services/errorNotificationService';
import { v4 as uuidv4 } from 'uuid';

export interface UserInstruction {
  id: string;
  userId: string;
  documentId: string;
  instruction: string;
  priority?: number;
  options?: {
    summaryLength?: 'short' | 'medium' | 'long';
    questionTypes?: ('multiple_choice' | 'fill_blank' | 'short_answer' | 'essay')[];
    includeFlashcards?: boolean;
    includeQuestions?: boolean;
    extractFormulas?: boolean;
    generateNotebook?: boolean;
  };
  timestamp: number;
}

export interface WorkflowStep {
  id: string;
  agentType: AgentType;
  taskType: string;
  dependencies: string[];
  payload: any;
  priority: number;
  timeout?: number;
  retryPolicy?: {
    maxRetries: number;
    backoffMultiplier: number;
    initialDelay: number;
  };
}

export interface WorkflowPlan {
  id: string;
  instructionId: string;
  steps: WorkflowStep[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: number;
  completedAt?: number;
  results: Map<string, any>;
  errors: WorkflowError[];
  retryCount: number;
}

export interface WorkflowError {
  id: string;
  stepId?: string;
  taskId?: string;
  error: string;
  timestamp: number;
  context?: any;
  retryable: boolean;
}

export interface ProcessingContext {
  documentId: string;
  userId: string;
  instruction: UserInstruction;
  documentMetadata?: any;
  previousResults?: Map<string, any>;
}

export class WorkflowManager {
  private activeWorkflows: Map<string, WorkflowPlan> = new Map();
  private workflowInstructions: Map<string, UserInstruction> = new Map();
  private instructionParsers: Map<string, (instruction: UserInstruction) => WorkflowStep[]> = new Map();

  constructor() {
    this.initializeInstructionParsers();
  }

  private initializeInstructionParsers(): void {
    // Register different instruction parsers
    this.instructionParsers.set('process_document', this.parseProcessDocumentInstruction.bind(this));
    this.instructionParsers.set('generate_summary', this.parseGenerateSummaryInstruction.bind(this));
    this.instructionParsers.set('extract_knowledge', this.parseExtractKnowledgeInstruction.bind(this));
    this.instructionParsers.set('create_study_materials', this.parseCreateStudyMaterialsInstruction.bind(this));
    this.instructionParsers.set('compile_notebook', this.parseCompileNotebookInstruction.bind(this));
  }

  // Main workflow orchestration method
  async processUserInstruction(instruction: UserInstruction): Promise<string> {
    try {
      // Parse instruction and create workflow plan
      const workflowPlan = await this.createWorkflowPlan(instruction);
      
      // Store workflow plan and instruction
      this.activeWorkflows.set(workflowPlan.id, workflowPlan);
      this.workflowInstructions.set(workflowPlan.id, instruction);

      // Start workflow execution asynchronously
      this.executeWorkflow(workflowPlan.id).catch(error => {
        Logger.error('Workflow execution failed', { 
          workflowId: workflowPlan.id, 
          error: error.message 
        });
        this.handleWorkflowError(workflowPlan.id, error);
      });

      return workflowPlan.id;
    } catch (error) {
      Logger.error('Error processing user instruction:', { 
        instructionId: instruction.id, 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }

  private async createWorkflowPlan(instruction: UserInstruction): Promise<WorkflowPlan> {
    // Determine instruction type based on content analysis
    const instructionType = this.analyzeInstructionType(instruction);
    
    // Get appropriate parser
    const parser = this.instructionParsers.get(instructionType);
    if (!parser) {
      throw new Error(`No parser found for instruction type: ${instructionType}`);
    }

    // Generate workflow steps
    const steps = parser(instruction);

    const workflowPlan: WorkflowPlan = {
      id: uuidv4(),
      instructionId: instruction.id,
      steps,
      status: 'pending',
      createdAt: Date.now(),
      results: new Map(),
      errors: [],
      retryCount: 0,
    };

    return workflowPlan;
  }

  private analyzeInstructionType(instruction: UserInstruction): string {
    const text = instruction.instruction.toLowerCase();
    
    // Simple keyword-based analysis (in production, this would use NLP)
    if (text.includes('process') || text.includes('analyze')) {
      return 'process_document';
    } else if (text.includes('summary') || text.includes('summarize')) {
      return 'generate_summary';
    } else if (text.includes('extract') || text.includes('knowledge') || text.includes('concepts')) {
      return 'extract_knowledge';
    } else if (text.includes('flashcard') || text.includes('question') || text.includes('quiz')) {
      return 'create_study_materials';
    } else if (text.includes('notebook') || text.includes('compile') || text.includes('export')) {
      return 'compile_notebook';
    }
    
    // Default to full document processing
    return 'process_document';
  }

  // Instruction parsers for different workflow types
  private parseProcessDocumentInstruction(instruction: UserInstruction): WorkflowStep[] {
    const steps: WorkflowStep[] = [];
    
    // Step 1: Ingestion - Extract and standardize text
    steps.push({
      id: uuidv4(),
      agentType: 'ingestion',
      taskType: 'extract_text',
      dependencies: [],
      payload: {
        documentId: instruction.documentId,
        userId: instruction.userId,
        extractImages: true,
        preserveStructure: true,
      },
      priority: 1,
      timeout: 300000, // 5 minutes
    });

    // Step 2: Analysis - Generate summary and analyze structure
    const analysisStepId = uuidv4();
    steps.push({
      id: analysisStepId,
      agentType: 'analysis',
      taskType: 'analyze_document',
      dependencies: [steps[0].id],
      payload: {
        documentId: instruction.documentId,
        userId: instruction.userId,
        summaryLength: instruction.options?.summaryLength || 'medium',
        analyzeStructure: true,
        extractTopics: true,
      },
      priority: 2,
      timeout: 600000, // 10 minutes
    });

    // Step 3: Knowledge Extraction - Extract entities, definitions, formulas
    const extractionStepId = uuidv4();
    steps.push({
      id: extractionStepId,
      agentType: 'extraction',
      taskType: 'extract_knowledge',
      dependencies: [steps[0].id],
      payload: {
        documentId: instruction.documentId,
        userId: instruction.userId,
        extractEntities: true,
        extractDefinitions: true,
        extractFormulas: instruction.options?.extractFormulas !== false,
        extractRelationships: true,
      },
      priority: 2,
      timeout: 600000, // 10 minutes
    });

    // Step 4: Pedagogy - Generate study materials (if requested)
    if (instruction.options?.includeQuestions || instruction.options?.includeFlashcards) {
      steps.push({
        id: uuidv4(),
        agentType: 'pedagogy',
        taskType: 'generate_study_materials',
        dependencies: [analysisStepId, extractionStepId],
        payload: {
          documentId: instruction.documentId,
          userId: instruction.userId,
          questionTypes: instruction.options?.questionTypes || ['multiple_choice', 'short_answer'],
          includeFlashcards: instruction.options?.includeFlashcards || false,
          difficulty: 'medium',
        },
        priority: 3,
        timeout: 600000, // 10 minutes
      });
    }

    return steps;
  }

  private parseGenerateSummaryInstruction(instruction: UserInstruction): WorkflowStep[] {
    const steps: WorkflowStep[] = [];
    
    // Step 1: Ingestion (if not already processed)
    const ingestionStepId = uuidv4();
    steps.push({
      id: ingestionStepId,
      agentType: 'ingestion',
      taskType: 'extract_text',
      dependencies: [],
      payload: {
        documentId: instruction.documentId,
        userId: instruction.userId,
        quickMode: true, // Faster processing for summary-only requests
      },
      priority: 1,
      timeout: 180000, // 3 minutes
    });

    // Step 2: Analysis - Focus on summary generation
    steps.push({
      id: uuidv4(),
      agentType: 'analysis',
      taskType: 'generate_summary',
      dependencies: [ingestionStepId],
      payload: {
        documentId: instruction.documentId,
        userId: instruction.userId,
        summaryLength: instruction.options?.summaryLength || 'medium',
        summaryType: 'abstractive',
      },
      priority: 2,
      timeout: 300000, // 5 minutes
    });

    return steps;
  }

  private parseExtractKnowledgeInstruction(instruction: UserInstruction): WorkflowStep[] {
    const steps: WorkflowStep[] = [];
    
    // Step 1: Ingestion
    const ingestionStepId = uuidv4();
    steps.push({
      id: ingestionStepId,
      agentType: 'ingestion',
      taskType: 'extract_text',
      dependencies: [],
      payload: {
        documentId: instruction.documentId,
        userId: instruction.userId,
        preserveStructure: true,
      },
      priority: 1,
      timeout: 300000, // 5 minutes
    });

    // Step 2: Knowledge Extraction - Focus on specific extraction tasks
    steps.push({
      id: uuidv4(),
      agentType: 'extraction',
      taskType: 'extract_knowledge',
      dependencies: [ingestionStepId],
      payload: {
        documentId: instruction.documentId,
        userId: instruction.userId,
        extractEntities: true,
        extractDefinitions: true,
        extractFormulas: true,
        extractRelationships: true,
        detailedExtraction: true,
      },
      priority: 2,
      timeout: 600000, // 10 minutes
    });

    return steps;
  }

  private parseCreateStudyMaterialsInstruction(instruction: UserInstruction): WorkflowStep[] {
    const steps: WorkflowStep[] = [];
    
    // Step 1: Ingestion
    const ingestionStepId = uuidv4();
    steps.push({
      id: ingestionStepId,
      agentType: 'ingestion',
      taskType: 'extract_text',
      dependencies: [],
      payload: {
        documentId: instruction.documentId,
        userId: instruction.userId,
      },
      priority: 1,
      timeout: 300000, // 5 minutes
    });

    // Step 2: Analysis for context
    const analysisStepId = uuidv4();
    steps.push({
      id: analysisStepId,
      agentType: 'analysis',
      taskType: 'analyze_for_pedagogy',
      dependencies: [ingestionStepId],
      payload: {
        documentId: instruction.documentId,
        userId: instruction.userId,
        extractTopics: true,
        identifyKeyPoints: true,
      },
      priority: 2,
      timeout: 300000, // 5 minutes
    });

    // Step 3: Knowledge Extraction for definitions and concepts
    const extractionStepId = uuidv4();
    steps.push({
      id: extractionStepId,
      agentType: 'extraction',
      taskType: 'extract_for_pedagogy',
      dependencies: [ingestionStepId],
      payload: {
        documentId: instruction.documentId,
        userId: instruction.userId,
        extractDefinitions: true,
        extractConcepts: true,
      },
      priority: 2,
      timeout: 300000, // 5 minutes
    });

    // Step 4: Pedagogy - Generate study materials
    steps.push({
      id: uuidv4(),
      agentType: 'pedagogy',
      taskType: 'generate_study_materials',
      dependencies: [analysisStepId, extractionStepId],
      payload: {
        documentId: instruction.documentId,
        userId: instruction.userId,
        questionTypes: instruction.options?.questionTypes || ['multiple_choice', 'fill_blank', 'short_answer'],
        includeFlashcards: instruction.options?.includeFlashcards !== false,
        difficulty: 'medium',
        quantity: 'standard',
      },
      priority: 3,
      timeout: 600000, // 10 minutes
    });

    return steps;
  }

  private parseCompileNotebookInstruction(instruction: UserInstruction): WorkflowStep[] {
    const steps: WorkflowStep[] = [];
    
    // Step 1: Synthesis - Compile notebook from existing knowledge elements
    steps.push({
      id: uuidv4(),
      agentType: 'synthesis',
      taskType: 'compile_notebook',
      dependencies: [],
      payload: {
        documentId: instruction.documentId,
        userId: instruction.userId,
        includeAnnotations: true,
        format: 'pdf',
        template: 'academic',
      },
      priority: 1,
      timeout: 300000, // 5 minutes
    });

    return steps;
  }

  // Workflow execution methods
  private async executeWorkflow(workflowId: string): Promise<void> {
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    try {
      workflow.status = 'processing';
      
      // Execute steps based on dependencies
      await this.executeWorkflowSteps(workflow);
      
      workflow.status = 'completed';
      workflow.completedAt = Date.now();
      
      console.log(`Workflow ${workflowId} completed successfully`);
      
      // Notify user of successful completion
      try {
        const instruction = this.getWorkflowInstruction(workflowId);
        if (instruction) {
          await errorNotificationService.notifyProcessingComplete(
            instruction.userId,
            workflowId,
            {
              completedSteps: workflow.steps.length,
              totalSteps: workflow.steps.length,
              results: Array.from(workflow.results.keys()),
            }
          );
        }
      } catch (notificationError) {
        Logger.error('Failed to send completion notification', { 
          workflowId, 
          error: notificationError 
        });
      }
    } catch (error) {
      workflow.status = 'failed';
      console.error(`Workflow ${workflowId} failed:`, error);
      
      // Notify user of workflow failure
      try {
        const instruction = this.getWorkflowInstruction(workflowId);
        if (instruction) {
          await errorNotificationService.notifyProcessingError(
            instruction.userId,
            workflowId,
            error instanceof Error ? error : new Error(String(error)),
            this.isRetryableError(error instanceof Error ? error : new Error(String(error)))
          );
        }
      } catch (notificationError) {
        Logger.error('Failed to send failure notification', { 
          workflowId, 
          error: notificationError 
        });
      }
      
      throw error;
    }
  }

  private async executeWorkflowSteps(workflow: WorkflowPlan): Promise<void> {
    const completedSteps = new Set<string>();
    const stepResults = new Map<string, any>();
    
    // Continue until all steps are completed
    while (completedSteps.size < workflow.steps.length) {
      // Find steps that can be executed (dependencies satisfied)
      const readySteps = workflow.steps.filter(step => 
        !completedSteps.has(step.id) &&
        step.dependencies.every(depId => completedSteps.has(depId))
      );

      if (readySteps.length === 0) {
        throw new Error('Workflow deadlock: no steps can be executed');
      }

      // Execute ready steps in parallel
      const stepPromises = readySteps.map(async (step) => {
        try {
          // Prepare task payload with results from dependencies
          const taskPayload = {
            ...step.payload,
            dependencyResults: this.getDependencyResults(step, stepResults),
          };

          // Create task definition
          const taskDefinition: Omit<TaskDefinition, 'id'> = {
            type: step.taskType,
            agentType: step.agentType,
            payload: taskPayload,
            priority: step.priority,
            timeout: step.timeout,
            retryPolicy: step.retryPolicy,
          };

          // Submit task to orchestrator
          const { orchestratorAgent } = await import('./index');
          const taskId = await orchestratorAgent.submitTask(taskDefinition);
          
          // Wait for task completion
          const result = await this.waitForTaskCompletion(taskId);
          
          // Store result
          stepResults.set(step.id, result);
          completedSteps.add(step.id);
          
          console.log(`Workflow step ${step.id} (${step.taskType}) completed`);
          
          return result;
        } catch (error) {
          console.error(`Workflow step ${step.id} failed:`, error);
          throw error;
        }
      });

      // Wait for all ready steps to complete
      await Promise.all(stepPromises);
    }

    // Store final results in workflow
    workflow.results = stepResults;
  }

  private getDependencyResults(step: WorkflowStep, stepResults: Map<string, any>): any {
    const dependencyResults: any = {};
    
    for (const depId of step.dependencies) {
      const result = stepResults.get(depId);
      if (result) {
        dependencyResults[depId] = result;
      }
    }
    
    return dependencyResults;
  }

  // This method is replaced by the enhanced version below

  // Public API methods
  getWorkflowStatus(workflowId: string): WorkflowPlan | null {
    return this.activeWorkflows.get(workflowId) || null;
  }

  async cancelWorkflow(workflowId: string): Promise<void> {
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    // Cancel any active tasks
    // This would require tracking active task IDs per workflow
    // For now, just mark as failed
    workflow.status = 'failed';
    
    console.log(`Workflow ${workflowId} cancelled`);
  }

  getActiveWorkflows(): WorkflowPlan[] {
    return Array.from(this.activeWorkflows.values());
  }

  getWorkflowInstruction(workflowId: string): UserInstruction | null {
    return this.workflowInstructions.get(workflowId) || null;
  }

  // Error handling methods
  private handleWorkflowError(workflowId: string, error: Error, stepId?: string, taskId?: string): void {
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow) {
      return;
    }

    const workflowError: WorkflowError = {
      id: uuidv4(),
      stepId,
      taskId,
      error: error.message,
      timestamp: Date.now(),
      context: {
        workflowId,
        stepId,
        taskId,
        stack: error.stack,
      },
      retryable: this.isRetryableError(error),
    };

    workflow.errors.push(workflowError);
    
    // Log error
    Logger.error('Workflow error occurred', {
      workflowId,
      errorId: workflowError.id,
      stepId,
      taskId,
      error: error.message,
      retryable: workflowError.retryable,
    });

    // If workflow is not already failed, mark it as failed
    if (workflow.status === 'processing') {
      workflow.status = 'failed';
    }
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
    ];

    return retryablePatterns.some(pattern => pattern.test(error.message));
  }

  // Retry logic for workflows
  async retryWorkflow(workflowId: string, maxRetries: number = 3): Promise<void> {
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    if (workflow.status !== 'failed') {
      throw new Error(`Only failed workflows can be retried. Current status: ${workflow.status}`);
    }

    if (workflow.retryCount >= maxRetries) {
      throw new Error(`Maximum retry attempts (${maxRetries}) exceeded for workflow ${workflowId}`);
    }

    // Check if the last error is retryable
    const lastError = workflow.errors[workflow.errors.length - 1];
    if (lastError && !lastError.retryable) {
      throw new Error(`Workflow ${workflowId} failed with non-retryable error: ${lastError.error}`);
    }

    try {
      workflow.retryCount++;
      workflow.status = 'processing';
      
      Logger.info('Retrying workflow', { 
        workflowId, 
        retryCount: workflow.retryCount,
        maxRetries 
      });

      // Reset results for failed steps
      const failedSteps = workflow.steps.filter(step => 
        workflow.errors.some(error => error.stepId === step.id)
      );

      for (const step of failedSteps) {
        workflow.results.delete(step.id);
      }

      // Re-execute workflow
      await this.executeWorkflow(workflowId);
      
    } catch (error) {
      Logger.error('Workflow retry failed', { 
        workflowId, 
        retryCount: workflow.retryCount,
        error: error instanceof Error ? error.message : String(error)
      });
      
      this.handleWorkflowError(workflowId, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  // Retry logic for individual steps
  async retryWorkflowStep(workflowId: string, stepId: string, maxRetries: number = 3): Promise<void> {
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const step = workflow.steps.find(s => s.id === stepId);
    if (!step) {
      throw new Error(`Step ${stepId} not found in workflow ${workflowId}`);
    }

    const stepErrors = workflow.errors.filter(error => error.stepId === stepId);
    if (stepErrors.length >= maxRetries) {
      throw new Error(`Maximum retry attempts (${maxRetries}) exceeded for step ${stepId}`);
    }

    // Check if the last error for this step is retryable
    const lastStepError = stepErrors[stepErrors.length - 1];
    if (lastStepError && !lastStepError.retryable) {
      throw new Error(`Step ${stepId} failed with non-retryable error: ${lastStepError.error}`);
    }

    try {
      Logger.info('Retrying workflow step', { 
        workflowId, 
        stepId,
        retryCount: stepErrors.length + 1,
        maxRetries 
      });

      // Remove previous result for this step
      workflow.results.delete(stepId);

      // Re-execute just this step
      await this.executeWorkflowStep(workflow, step);
      
    } catch (error) {
      Logger.error('Workflow step retry failed', { 
        workflowId, 
        stepId,
        retryCount: stepErrors.length + 1,
        error: error instanceof Error ? error.message : String(error)
      });
      
      this.handleWorkflowError(workflowId, error instanceof Error ? error : new Error(String(error)), stepId);
      throw error;
    }
  }

  // Execute a single workflow step
  private async executeWorkflowStep(workflow: WorkflowPlan, step: WorkflowStep): Promise<any> {
    try {
      // Prepare task payload with results from dependencies
      const taskPayload = {
        ...step.payload,
        dependencyResults: this.getDependencyResults(step, workflow.results),
      };

      // Create task definition with retry policy
      const taskDefinition: Omit<TaskDefinition, 'id'> = {
        type: step.taskType,
        agentType: step.agentType,
        payload: taskPayload,
        priority: step.priority,
        timeout: step.timeout,
        retryPolicy: step.retryPolicy || {
          maxRetries: 3,
          backoffMultiplier: 2,
          initialDelay: 1000,
        },
      };

      // Import orchestratorAgent dynamically to avoid circular dependency
      const { orchestratorAgent } = await import('./index');
      
      // Submit task to orchestrator
      const taskId = await orchestratorAgent.submitTask(taskDefinition);
      
      // Wait for task completion with timeout
      const result = await this.waitForTaskCompletion(taskId, step.timeout);
      
      // Store result
      workflow.results.set(step.id, result);
      
      Logger.info('Workflow step completed successfully', {
        workflowId: workflow.id,
        stepId: step.id,
        taskType: step.taskType,
        taskId,
      });
      
      return result;
    } catch (error) {
      Logger.error('Workflow step execution failed', {
        workflowId: workflow.id,
        stepId: step.id,
        taskType: step.taskType,
        error: error instanceof Error ? error.message : String(error),
      });
      
      this.handleWorkflowError(workflow.id, error instanceof Error ? error : new Error(String(error)), step.id);
      throw error;
    }
  }

  // Enhanced task completion waiting with better error handling
  private async waitForTaskCompletion(taskId: string, timeout?: number): Promise<any> {
    const startTime = Date.now();
    const maxTimeout = timeout || 300000; // 5 minutes default
    
    return new Promise((resolve, reject) => {
      const checkStatus = async () => {
        try {
          // Check if we've exceeded the timeout
          if (Date.now() - startTime > maxTimeout) {
            reject(new Error(`Task ${taskId} timed out after ${maxTimeout}ms`));
            return;
          }

          const { orchestratorAgent } = await import('./index');
          const status = await orchestratorAgent.getTaskStatus(taskId);
          
          switch (status.status) {
            case 'completed':
              resolve(status.result?.result);
              break;
            case 'failed':
              reject(new Error(status.result?.error || 'Task failed'));
              break;
            case 'timeout':
              reject(new Error('Task timed out'));
              break;
            default:
              // Still processing, check again with exponential backoff
              const elapsed = Date.now() - startTime;
              const delay = Math.min(1000 + elapsed * 0.1, 5000); // Max 5 second delay
              setTimeout(checkStatus, delay);
              break;
          }
        } catch (error) {
          reject(error);
        }
      };
      
      checkStatus();
    });
  }

  // Get workflow errors
  getWorkflowErrors(workflowId: string): WorkflowError[] {
    const workflow = this.activeWorkflows.get(workflowId);
    return workflow ? workflow.errors : [];
  }

  // Get step errors
  getStepErrors(workflowId: string, stepId: string): WorkflowError[] {
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow) {
      return [];
    }
    return workflow.errors.filter(error => error.stepId === stepId);
  }

  // Cleanup completed workflows (should be called periodically)
  cleanupCompletedWorkflows(maxAge: number = 3600000): void { // 1 hour default
    const now = Date.now();
    
    for (const [workflowId, workflow] of this.activeWorkflows.entries()) {
      if (workflow.status === 'completed' || workflow.status === 'failed') {
        const age = now - workflow.createdAt;
        if (age > maxAge) {
          this.activeWorkflows.delete(workflowId);
          Logger.debug('Cleaned up old workflow', { workflowId, age });
        }
      }
    }
  }
}

export const workflowManager = new WorkflowManager();