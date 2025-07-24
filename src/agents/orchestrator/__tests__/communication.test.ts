// Tests for Agent Communication Framework
import { AgentCommunicationFramework, AgentRegistration, TaskDefinition } from '../communication';
import { redisConnection } from '../../../database/redis';
import { v4 as uuidv4 } from 'uuid';

// Mock Redis connection
jest.mock('../../../database/redis', () => ({
  redisConnection: {
    isHealthy: jest.fn().mockReturnValue(true),
    connect: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(undefined),
    enqueueMessage: jest.fn().mockResolvedValue(undefined),
    publishMessage: jest.fn().mockResolvedValue(undefined),
    subscribeToChannel: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('AgentCommunicationFramework', () => {
  let framework: AgentCommunicationFramework;
  let mockRedis: jest.Mocked<typeof redisConnection>;

  beforeEach(() => {
    framework = new AgentCommunicationFramework();
    mockRedis = redisConnection as jest.Mocked<typeof redisConnection>;
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await framework.shutdown();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      mockRedis.isHealthy.mockReturnValue(false); // Force connection attempt
      
      await framework.initialize();
      
      expect(mockRedis.connect).toHaveBeenCalled();
    });

    it('should handle initialization errors', async () => {
      mockRedis.isHealthy.mockReturnValue(false); // Force connection attempt
      mockRedis.connect.mockRejectedValueOnce(new Error('Connection failed'));
      
      await expect(framework.initialize()).rejects.toThrow('Connection failed');
    });
  });

  describe('agent registration', () => {
    beforeEach(async () => {
      await framework.initialize();
    });

    it('should register an agent successfully', async () => {
      const registration: Omit<AgentRegistration, 'lastHeartbeat'> = {
        agentId: 'test-agent-1',
        agentType: 'analysis',
        capabilities: ['summarization', 'topic-modeling'],
        status: 'active',
        metadata: { version: '1.0.0' },
      };

      await framework.registerAgent(registration);

      expect(mockRedis.set).toHaveBeenCalledWith(
        'agent:test-agent-1',
        expect.objectContaining({
          ...registration,
          lastHeartbeat: expect.any(Number),
        }),
        { ttl: 300, prefix: 'registry' }
      );

      expect(mockRedis.publishMessage).toHaveBeenCalledWith('systemEvents', {
        type: 'agent_registered',
        agentId: 'test-agent-1',
        agentType: 'analysis',
        timestamp: expect.any(Number),
      });

      const agents = framework.getRegisteredAgents();
      expect(agents).toHaveLength(1);
      expect(agents[0].agentId).toBe('test-agent-1');
    });

    it('should unregister an agent successfully', async () => {
      const registration: Omit<AgentRegistration, 'lastHeartbeat'> = {
        agentId: 'test-agent-1',
        agentType: 'analysis',
        capabilities: ['summarization'],
        status: 'active',
      };

      await framework.registerAgent(registration);
      await framework.unregisterAgent('test-agent-1');

      expect(mockRedis.del).toHaveBeenCalledWith('agent:test-agent-1', 'registry');
      expect(mockRedis.publishMessage).toHaveBeenCalledWith('systemEvents', {
        type: 'agent_unregistered',
        agentId: 'test-agent-1',
        agentType: 'analysis',
        timestamp: expect.any(Number),
      });

      const agents = framework.getRegisteredAgents();
      expect(agents).toHaveLength(0);
    });

    it('should throw error when unregistering non-existent agent', async () => {
      await expect(framework.unregisterAgent('non-existent')).rejects.toThrow(
        'Agent non-existent not found'
      );
    });

    it('should update agent status', async () => {
      const registration: Omit<AgentRegistration, 'lastHeartbeat'> = {
        agentId: 'test-agent-1',
        agentType: 'analysis',
        capabilities: ['summarization'],
        status: 'active',
      };

      await framework.registerAgent(registration);
      await framework.updateAgentStatus('test-agent-1', 'busy', { currentTask: 'task-123' });

      expect(mockRedis.set).toHaveBeenCalledWith(
        'agent:test-agent-1',
        expect.objectContaining({
          status: 'busy',
          metadata: { currentTask: 'task-123' },
        }),
        { ttl: 300, prefix: 'registry' }
      );

      expect(mockRedis.publishMessage).toHaveBeenCalledWith('agentStatus', {
        agentId: 'test-agent-1',
        status: 'busy',
        metadata: { currentTask: 'task-123' },
        timestamp: expect.any(Number),
      });
    });
  });

  describe('agent discovery', () => {
    beforeEach(async () => {
      await framework.initialize();
    });

    it('should get registered agents by type', async () => {
      await framework.registerAgent({
        agentId: 'analysis-1',
        agentType: 'analysis',
        capabilities: ['summarization'],
        status: 'active',
      });

      await framework.registerAgent({
        agentId: 'extraction-1',
        agentType: 'extraction',
        capabilities: ['ner'],
        status: 'active',
      });

      const analysisAgents = framework.getRegisteredAgents('analysis');
      expect(analysisAgents).toHaveLength(1);
      expect(analysisAgents[0].agentId).toBe('analysis-1');

      const allAgents = framework.getRegisteredAgents();
      expect(allAgents).toHaveLength(2);
    });

    it('should get available agents', async () => {
      const now = Date.now();
      
      await framework.registerAgent({
        agentId: 'analysis-1',
        agentType: 'analysis',
        capabilities: ['summarization'],
        status: 'active',
      });

      await framework.registerAgent({
        agentId: 'analysis-2',
        agentType: 'analysis',
        capabilities: ['summarization'],
        status: 'busy',
      });

      // Mock the lastHeartbeat to be recent
      const agents = framework.getRegisteredAgents('analysis');
      agents.forEach(agent => {
        agent.lastHeartbeat = now;
      });

      const availableAgents = framework.getAvailableAgents('analysis');
      expect(availableAgents).toHaveLength(1);
      expect(availableAgents[0].agentId).toBe('analysis-1');
    });
  });

  describe('task distribution', () => {
    beforeEach(async () => {
      await framework.initialize();
      
      // Register a test agent
      await framework.registerAgent({
        agentId: 'analysis-1',
        agentType: 'analysis',
        capabilities: ['summarization'],
        status: 'active',
      });
    });

    it('should distribute task to available agent', async () => {
      const task: TaskDefinition = {
        id: 'task-123',
        type: 'summarize',
        agentType: 'analysis',
        payload: { documentId: 'doc-123' },
        priority: 1,
      };

      const agentId = await framework.distributeTask(task);

      expect(agentId).toBe('analysis-1');
      expect(mockRedis.enqueueMessage).toHaveBeenCalledWith('analysis', expect.objectContaining({
        id: 'task-123',
        type: 'task',
        agentType: 'analysis',
        payload: expect.objectContaining({
          taskId: 'task-123',
          taskType: 'summarize',
          data: { documentId: 'doc-123' },
        }),
      }));
    });

    it('should throw error when no agents available', async () => {
      const task: TaskDefinition = {
        id: 'task-123',
        type: 'extract',
        agentType: 'extraction',
        payload: { documentId: 'doc-123' },
      };

      await expect(framework.distributeTask(task)).rejects.toThrow(
        'No available agents for type: extraction'
      );
    });

    it('should get task status', async () => {
      const task: TaskDefinition = {
        id: 'task-123',
        type: 'summarize',
        agentType: 'analysis',
        payload: { documentId: 'doc-123' },
      };

      await framework.distributeTask(task);

      const status = await framework.getTaskStatus('task-123');
      expect(status.task).toEqual(task);
      expect(status.status).toBe('processing');
    });

    it('should cancel task', async () => {
      const task: TaskDefinition = {
        id: 'task-123',
        type: 'summarize',
        agentType: 'analysis',
        payload: { documentId: 'doc-123' },
      };

      await framework.distributeTask(task);
      await framework.cancelTask('task-123');

      expect(mockRedis.enqueueMessage).toHaveBeenCalledWith('analysis', expect.objectContaining({
        payload: expect.objectContaining({
          action: 'cancel',
          taskId: 'task-123',
        }),
      }));
    });
  });

  describe('event handling', () => {
    beforeEach(async () => {
      await framework.initialize();
    });

    it('should emit events on agent status change', (done) => {
      // First register an agent
      framework.registerAgent({
        agentId: 'test-agent',
        agentType: 'analysis',
        capabilities: ['test'],
        status: 'active',
      }).then(() => {
        framework.on('agentStatusChanged', (event) => {
          expect(event.agentId).toBe('test-agent');
          expect(event.status).toBe('busy');
          done();
        });

        // Simulate status update message
        framework['handleAgentStatusUpdate']({
          agentId: 'test-agent',
          status: 'busy',
          metadata: {},
          timestamp: Date.now(),
        });
      });
    });

    it('should emit events on task completion', (done) => {
      // First register an agent
      framework.registerAgent({
        agentId: 'agent-1',
        agentType: 'analysis',
        capabilities: ['test'],
        status: 'active',
      }).then(() => {
        framework.on('taskCompleted', (result) => {
          expect(result.taskId).toBe('task-123');
          expect(result.status).toBe('success');
          done();
        });

        // Simulate task completion message
        framework['handleTaskProgressUpdate']({
          taskId: 'task-123',
          agentId: 'agent-1',
          result: { summary: 'Test summary' },
        });
      });
    });
  });

  describe('shutdown', () => {
    it('should shutdown gracefully', async () => {
      await framework.initialize();
      
      await framework.registerAgent({
        agentId: 'test-agent',
        agentType: 'analysis',
        capabilities: ['test'],
        status: 'active',
      });

      await framework.shutdown();

      expect(mockRedis.del).toHaveBeenCalledWith('agent:test-agent', 'registry');
    });
  });
});