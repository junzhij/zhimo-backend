// Notification Controller for managing user notifications and system alerts
import { Request, Response } from 'express';
import { errorNotificationService } from '../services/errorNotificationService';
import { Logger } from '../utils/logger';

// Extend Request interface to include user
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    [key: string]: any;
  };
}

class NotificationController {
  // User Notification Methods

  async getUserNotifications(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id || 'anonymous';
      const { limit = 20, offset = 0, unreadOnly = false } = req.query;

      const notifications = await errorNotificationService.getUserNotifications(
        userId,
        Number(limit),
        Number(offset)
      );

      // Filter for unread only if requested
      const filteredNotifications = unreadOnly === 'true' 
        ? notifications.filter(n => !n.read)
        : notifications;

      res.json({
        success: true,
        data: {
          notifications: filteredNotifications,
          total: filteredNotifications.length,
          unreadCount: notifications.filter(n => !n.read).length,
          offset: Number(offset),
          limit: Number(limit),
        },
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('Failed to get user notifications', { 
        userId: req.user?.id,
        error: errorMessage 
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to get notifications',
        message: errorMessage,
      });
    }
  }

  async markNotificationAsRead(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id || 'anonymous';
      const { notificationId } = req.params;

      await errorNotificationService.markNotificationAsRead(notificationId, userId);

      res.json({
        success: true,
        message: 'Notification marked as read',
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('Failed to mark notification as read', { 
        notificationId: req.params.notificationId,
        userId: req.user?.id,
        error: errorMessage 
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to mark notification as read',
        message: errorMessage,
      });
    }
  }

  async deleteNotification(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id || 'anonymous';
      const { notificationId } = req.params;

      await errorNotificationService.deleteNotification(notificationId, userId);

      res.json({
        success: true,
        message: 'Notification deleted',
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('Failed to delete notification', { 
        notificationId: req.params.notificationId,
        userId: req.user?.id,
        error: errorMessage 
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to delete notification',
        message: errorMessage,
      });
    }
  }

  async createTestNotification(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id || 'anonymous';
      const { type = 'info', title, message, retryable = false } = req.body;

      const notificationId = await errorNotificationService.createUserNotification({
        userId,
        type,
        title,
        message,
        retryable,
        actions: [
          {
            id: 'dismiss',
            label: 'Dismiss',
            type: 'dismiss',
          },
        ],
      });

      res.status(201).json({
        success: true,
        data: {
          notificationId,
          message: 'Test notification created',
        },
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('Failed to create test notification', { 
        userId: req.user?.id,
        error: errorMessage 
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to create test notification',
        message: errorMessage,
      });
    }
  }

  // System Alert Methods (Admin only)

  async getSystemAlerts(req: Request, res: Response): Promise<void> {
    try {
      const { limit = 50, offset = 0, severity, resolved } = req.query;

      let alerts = await errorNotificationService.getSystemAlerts(
        Number(limit),
        Number(offset)
      );

      // Filter by severity if specified
      if (severity) {
        alerts = alerts.filter(alert => alert.severity === severity);
      }

      // Filter by resolved status if specified
      if (resolved !== undefined) {
        const isResolved = resolved === 'true';
        alerts = alerts.filter(alert => alert.resolved === isResolved);
      }

      res.json({
        success: true,
        data: {
          alerts,
          total: alerts.length,
          offset: Number(offset),
          limit: Number(limit),
          summary: {
            critical: alerts.filter(a => a.severity === 'critical' && !a.resolved).length,
            high: alerts.filter(a => a.severity === 'high' && !a.resolved).length,
            medium: alerts.filter(a => a.severity === 'medium' && !a.resolved).length,
            low: alerts.filter(a => a.severity === 'low' && !a.resolved).length,
            resolved: alerts.filter(a => a.resolved).length,
          },
        },
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('Failed to get system alerts', { error: errorMessage });
      
      res.status(500).json({
        success: false,
        error: 'Failed to get system alerts',
        message: errorMessage,
      });
    }
  }

  async resolveSystemAlert(req: Request, res: Response): Promise<void> {
    try {
      const { alertId } = req.params;

      await errorNotificationService.resolveSystemAlert(alertId);

      res.json({
        success: true,
        message: 'System alert resolved',
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('Failed to resolve system alert', { 
        alertId: req.params.alertId,
        error: errorMessage 
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to resolve system alert',
        message: errorMessage,
      });
    }
  }

  async createTestAlert(req: Request, res: Response): Promise<void> {
    try {
      const { severity = 'medium', component, message } = req.body;

      const alertId = await errorNotificationService.createSystemAlert({
        severity,
        component,
        message,
        details: {
          test: true,
          timestamp: Date.now(),
        },
      });

      res.status(201).json({
        success: true,
        data: {
          alertId,
          message: 'Test alert created',
        },
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('Failed to create test alert', { error: errorMessage });
      
      res.status(500).json({
        success: false,
        error: 'Failed to create test alert',
        message: errorMessage,
      });
    }
  }

  // Notification Statistics

  async getNotificationStats(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id || 'anonymous';

      const notifications = await errorNotificationService.getUserNotifications(userId, 100, 0);
      const systemAlerts = await errorNotificationService.getSystemAlerts(100, 0);

      const now = Date.now();
      const oneHourAgo = now - 3600000;
      const oneDayAgo = now - 86400000;

      res.json({
        success: true,
        data: {
          user: {
            total: notifications.length,
            unread: notifications.filter(n => !n.read).length,
            errors: notifications.filter(n => n.type === 'error').length,
            warnings: notifications.filter(n => n.type === 'warning').length,
            recent: notifications.filter(n => n.timestamp > oneHourAgo).length,
            retryable: notifications.filter(n => n.retryable).length,
          },
          system: {
            total: systemAlerts.length,
            unresolved: systemAlerts.filter(a => !a.resolved).length,
            critical: systemAlerts.filter(a => a.severity === 'critical' && !a.resolved).length,
            high: systemAlerts.filter(a => a.severity === 'high' && !a.resolved).length,
            recent: systemAlerts.filter(a => a.timestamp > oneDayAgo).length,
          },
          trends: {
            userNotificationsLastHour: notifications.filter(n => n.timestamp > oneHourAgo).length,
            systemAlertsLastDay: systemAlerts.filter(a => a.timestamp > oneDayAgo).length,
            errorRate: notifications.length > 0 ? 
              notifications.filter(n => n.type === 'error').length / notifications.length : 0,
          },
        },
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('Failed to get notification stats', { 
        userId: req.user?.id,
        error: errorMessage 
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to get notification statistics',
        message: errorMessage,
      });
    }
  }
}

export const notificationController = new NotificationController();