import { Router } from 'express';
import { orchestratorController } from '../controllers/orchestratorController';
import { validateWorkflowId, validateTaskId, validateUserInstruction } from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// Workflow Management Endpoints

// Process user instruction (create new workflow)
router.post('/workflows',
  validateUserInstruction,
  asyncHandler(orchestratorController.processUserInstruction.bind(orchestratorController))
);

// Get workflow status
router.get('/workflows/:workflowId',
  validateWorkflowId,
  asyncHandler(orchestratorController.getWorkflowStatus.bind(orchestratorController))
);

// Cancel workflow
router.delete('/workflows/:workflowId',
  validateWorkflowId,
  asyncHandler(orchestratorController.cancelWorkflow.bind(orchestratorController))
);

// List active workflows for user
router.get('/workflows',
  asyncHandler(orchestratorController.listWorkflows.bind(orchestratorController))
);

// Task Management Endpoints

// Submit individual task
router.post('/tasks',
  asyncHandler(orchestratorController.submitTask.bind(orchestratorController))
);

// Get task status
router.get('/tasks/:taskId',
  validateTaskId,
  asyncHandler(orchestratorController.getTaskStatus.bind(orchestratorController))
);

// Cancel task
router.delete('/tasks/:taskId',
  validateTaskId,
  asyncHandler(orchestratorController.cancelTask.bind(orchestratorController))
);

// System Health and Monitoring Endpoints

// Get system health
router.get('/health',
  asyncHandler(orchestratorController.getSystemHealth.bind(orchestratorController))
);

// Get agent status
router.get('/agents',
  asyncHandler(orchestratorController.getAgentStatus.bind(orchestratorController))
);

// Get queue status
router.get('/queues',
  asyncHandler(orchestratorController.getQueueStatus.bind(orchestratorController))
);

// Get task metrics
router.get('/metrics',
  asyncHandler(orchestratorController.getTaskMetrics.bind(orchestratorController))
);

// Error Handling and Retry Endpoints

// Retry failed workflow
router.post('/workflows/:workflowId/retry',
  validateWorkflowId,
  asyncHandler(orchestratorController.retryWorkflow.bind(orchestratorController))
);

// Retry failed task
router.post('/tasks/:taskId/retry',
  validateTaskId,
  asyncHandler(orchestratorController.retryTask.bind(orchestratorController))
);

// Get error logs for workflow
router.get('/workflows/:workflowId/errors',
  validateWorkflowId,
  asyncHandler(orchestratorController.getWorkflowErrors.bind(orchestratorController))
);

// Get error logs for task
router.get('/tasks/:taskId/errors',
  validateTaskId,
  asyncHandler(orchestratorController.getTaskErrors.bind(orchestratorController))
);

// Get processing status for document
router.get('/documents/:documentId/status',
  asyncHandler(orchestratorController.getProcessingStatus.bind(orchestratorController))
);

export default router;