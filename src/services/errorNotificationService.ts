// Error Notification Service for user notifications and system alerts
import { Logger } from '../utils/logger';
import { redisConnection } from '../database/redis';
import { v4 as uuidv4 } from 'uuid';

export interface ErrorNotification {
  id: string;
  userId: string;
  workflowId?: string;
  taskId?: string;
  type: 'error' | 'warning' | 'info';
  title: string;
  message: string;
  details?: any;
  timestamp: number;
  read: boolean;
  retryable: boolean;
  actions?: NotificationAction[];
}

export interface NotificationAction {
  id: string;
  label: string;
  type: 'retry' | 'cancel' | 'view_details' | 'dismiss';
  endpoint?: string;
  method?: 'GET' | 'POST' | 'DELETE';
}

export interface SystemAlert {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  component: string;
  message: string;
  details: any;
  timestamp: number;
  resolved: boolean;
  resolvedAt?: number;
}

export class ErrorNotificationService {
  private readonly NOTIFICATION_TTL = 86400; // 24 hours
  private readonly ALERT_TTL = 604800; // 7 days

  // User Notifications
  async createUserNotification(notification: Omit<ErrorNotification, 'id' | 'timestamp' | 'read'>): Promise<string> {
    const fullNotification: ErrorNotification = {
      ...notification,
      id: uuidv4(),
      timestamp: Date.now(),
      read: false,
    };

    try {
      // Store in Redis with TTL
      await redisConnection.set(
        `notification:${fullNotification.id}`,
        fullNotification,
        { ttl: this.NOTIFICATION_TTL, prefix: 'notifications' }
      );

      // Add to user's notification list using Redis client directly
      const client = redisConnection.getClient();
      await client.lPush(`notifications:user_notifications:${notification.userId}`, fullNotification.id);

      // Publish real-time notification
      await redisConnection.publishMessage('systemEvents', {
        type: 'userNotification',
        userId: notification.userId,
        notification: fullNotification,
      });

      Logger.info('User notification created', {
        notificationId: fullNotification.id,
        userId: notification.userId,
        type: notification.type,
        title: notification.title,
      });

      return fullNotification.id;
    } catch (error) {
      Logger.error('Failed to create user notification', {
        userId: notification.userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async getUserNotifications(userId: string, limit: number = 20, offset: number = 0): Promise<ErrorNotification[]> {
    try {
      // Get notification IDs from user's list using Redis client directly
      const client = redisConnection.getClient();
      const notificationIds = await client.lRange(
        `notifications:user_notifications:${userId}`,
        offset,
        offset + limit - 1
      );

      if (!notificationIds || notificationIds.length === 0) {
        return [];
      }

      // Get notification details
      const notifications: ErrorNotification[] = [];
      for (const id of notificationIds) {
        try {
          const notification = await redisConnection.get(`notification:${id}`, 'notifications');
          if (notification) {
            notifications.push(notification as ErrorNotification);
          }
        } catch (error) {
          Logger.warn('Failed to get notification details', { notificationId: id, error });
        }
      }

      return notifications.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      Logger.error('Failed to get user notifications', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  async markNotificationAsRead(notificationId: string, userId: string): Promise<void> {
    try {
      const notification = await redisConnection.get(`notification:${notificationId}`, 'notifications');
      if (!notification) {
        throw new Error('Notification not found');
      }

      const typedNotification = notification as ErrorNotification;
      if (typedNotification.userId !== userId) {
        throw new Error('Unauthorized access to notification');
      }

      typedNotification.read = true;
      await redisConnection.set(
        `notification:${notificationId}`,
        typedNotification,
        { ttl: this.NOTIFICATION_TTL, prefix: 'notifications' }
      );

      Logger.debug('Notification marked as read', { notificationId, userId });
    } catch (error) {
      Logger.error('Failed to mark notification as read', {
        notificationId,
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async deleteNotification(notificationId: string, userId: string): Promise<void> {
    try {
      const notification = await redisConnection.get(`notification:${notificationId}`, 'notifications');
      if (!notification) {
        return; // Already deleted
      }

      const typedNotification = notification as ErrorNotification;
      if (typedNotification.userId !== userId) {
        throw new Error('Unauthorized access to notification');
      }

      // Remove from Redis
      await redisConnection.del(`notification:${notificationId}`, 'notifications');

      // Remove from user's notification list using Redis client directly
      const client = redisConnection.getClient();
      await client.lRem(`notifications:user_notifications:${userId}`, 0, notificationId);

      Logger.debug('Notification deleted', { notificationId, userId });
    } catch (error) {
      Logger.error('Failed to delete notification', {
        notificationId,
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  // System Alerts
  async createSystemAlert(alert: Omit<SystemAlert, 'id' | 'timestamp' | 'resolved'>): Promise<string> {
    const fullAlert: SystemAlert = {
      ...alert,
      id: uuidv4(),
      timestamp: Date.now(),
      resolved: false,
    };

    try {
      // Store in Redis with TTL
      await redisConnection.set(
        `alert:${fullAlert.id}`,
        fullAlert,
        { ttl: this.ALERT_TTL, prefix: 'alerts' }
      );

      // Add to system alerts list using Redis client directly
      const client = redisConnection.getClient();
      await client.lPush('alerts:system_alerts', fullAlert.id);

      // Publish system alert
      await redisConnection.publishMessage('systemEvents', {
        type: 'systemAlert',
        alert: fullAlert,
      });

      Logger.warn('System alert created', {
        alertId: fullAlert.id,
        severity: alert.severity,
        component: alert.component,
        message: alert.message,
      });

      return fullAlert.id;
    } catch (error) {
      Logger.error('Failed to create system alert', {
        component: alert.component,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async getSystemAlerts(limit: number = 50, offset: number = 0): Promise<SystemAlert[]> {
    try {
      // Get alert IDs from system alerts list using Redis client directly
      const client = redisConnection.getClient();
      const alertIds = await client.lRange(
        'alerts:system_alerts',
        offset,
        offset + limit - 1
      );

      if (!alertIds || alertIds.length === 0) {
        return [];
      }

      // Get alert details
      const alerts: SystemAlert[] = [];
      for (const id of alertIds) {
        try {
          const alert = await redisConnection.get(`alert:${id}`, 'alerts');
          if (alert) {
            alerts.push(alert as SystemAlert);
          }
        } catch (error) {
          Logger.warn('Failed to get alert details', { alertId: id, error });
        }
      }

      return alerts.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      Logger.error('Failed to get system alerts', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  async resolveSystemAlert(alertId: string): Promise<void> {
    try {
      const alert = await redisConnection.get(`alert:${alertId}`, 'alerts');
      if (!alert) {
        throw new Error('Alert not found');
      }

      const typedAlert = alert as SystemAlert;
      typedAlert.resolved = true;
      typedAlert.resolvedAt = Date.now();

      await redisConnection.set(
        `alert:${alertId}`,
        typedAlert,
        { ttl: this.ALERT_TTL, prefix: 'alerts' }
      );

      Logger.info('System alert resolved', { alertId });
    } catch (error) {
      Logger.error('Failed to resolve system alert', {
        alertId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  // Convenience methods for common error scenarios
  async notifyProcessingError(
    userId: string,
    workflowId: string,
    error: Error,
    retryable: boolean = true
  ): Promise<string> {
    const actions: NotificationAction[] = [];

    if (retryable) {
      actions.push({
        id: 'retry',
        label: 'Retry Processing',
        type: 'retry',
        endpoint: `/api/orchestrator/workflows/${workflowId}/retry`,
        method: 'POST',
      });
    }

    actions.push(
      {
        id: 'view_details',
        label: 'View Details',
        type: 'view_details',
        endpoint: `/api/orchestrator/workflows/${workflowId}/errors`,
        method: 'GET',
      },
      {
        id: 'dismiss',
        label: 'Dismiss',
        type: 'dismiss',
      }
    );

    return this.createUserNotification({
      userId,
      workflowId,
      type: 'error',
      title: 'Processing Failed',
      message: `Document processing failed: ${error.message}`,
      details: {
        error: error.message,
        stack: error.stack,
        workflowId,
      },
      retryable,
      actions,
    });
  }

  async notifyTaskTimeout(
    userId: string,
    taskId: string,
    workflowId?: string,
    timeout: number = 300000
  ): Promise<string> {
    const actions: NotificationAction[] = [
      {
        id: 'retry',
        label: 'Retry Task',
        type: 'retry',
        endpoint: `/api/orchestrator/tasks/${taskId}/retry`,
        method: 'POST',
      },
      {
        id: 'view_details',
        label: 'View Details',
        type: 'view_details',
        endpoint: `/api/orchestrator/tasks/${taskId}/errors`,
        method: 'GET',
      },
      {
        id: 'dismiss',
        label: 'Dismiss',
        type: 'dismiss',
      },
    ];

    return this.createUserNotification({
      userId,
      taskId,
      workflowId,
      type: 'warning',
      title: 'Task Timeout',
      message: `Task timed out after ${timeout / 1000} seconds`,
      details: {
        taskId,
        workflowId,
        timeout,
      },
      retryable: true,
      actions,
    });
  }

  async notifyProcessingComplete(
    userId: string,
    workflowId: string,
    results: any
  ): Promise<string> {
    const actions: NotificationAction[] = [
      {
        id: 'view_results',
        label: 'View Results',
        type: 'view_details',
        endpoint: `/api/orchestrator/workflows/${workflowId}`,
        method: 'GET',
      },
      {
        id: 'dismiss',
        label: 'Dismiss',
        type: 'dismiss',
      },
    ];

    return this.createUserNotification({
      userId,
      workflowId,
      type: 'info',
      title: 'Processing Complete',
      message: 'Your document has been processed successfully',
      details: {
        workflowId,
        completedSteps: results.completedSteps || 0,
        totalSteps: results.totalSteps || 0,
      },
      retryable: false,
      actions,
    });
  }

  // System health monitoring
  async notifySystemIssue(
    component: string,
    severity: SystemAlert['severity'],
    message: string,
    details: any
  ): Promise<string> {
    return this.createSystemAlert({
      severity,
      component,
      message,
      details,
    });
  }

  async notifyAgentFailure(agentType: string, agentId: string, error: Error): Promise<string> {
    return this.createSystemAlert({
      severity: 'high',
      component: `${agentType}-agent`,
      message: `Agent ${agentId} failed: ${error.message}`,
      details: {
        agentType,
        agentId,
        error: error.message,
        stack: error.stack,
        timestamp: Date.now(),
      },
    });
  }

  async notifyQueueBacklog(agentType: string, queueSize: number, threshold: number): Promise<string> {
    return this.createSystemAlert({
      severity: queueSize > threshold * 2 ? 'high' : 'medium',
      component: `${agentType}-queue`,
      message: `Queue backlog detected: ${queueSize} tasks pending`,
      details: {
        agentType,
        queueSize,
        threshold,
        timestamp: Date.now(),
      },
    });
  }

  // Cleanup old notifications and alerts
  async cleanupOldNotifications(maxAge: number = 86400000): Promise<void> {
    try {
      // This would typically scan Redis for old notifications and clean them up
      Logger.debug('Cleaning up old notifications', { maxAge });
      
      // Implementation would depend on Redis scanning capabilities
      // For now, we rely on TTL for automatic cleanup
    } catch (error) {
      Logger.error('Failed to cleanup old notifications', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export const errorNotificationService = new ErrorNotificationService();