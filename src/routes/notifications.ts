// Notification routes for user notifications and system alerts
import { Router } from 'express';
import { notificationController } from '../controllers/notificationController';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// User Notification Endpoints

// Get user notifications
router.get('/user', 
  asyncHandler(notificationController.getUserNotifications.bind(notificationController))
);

// Mark notification as read
router.patch('/user/:notificationId/read', 
  asyncHandler(notificationController.markNotificationAsRead.bind(notificationController))
);

// Delete notification
router.delete('/user/:notificationId', 
  asyncHandler(notificationController.deleteNotification.bind(notificationController))
);

// Create test notification (for development/testing)
router.post('/user/test', 
  asyncHandler(notificationController.createTestNotification.bind(notificationController))
);

// System Alert Endpoints (Admin access recommended)

// Get system alerts
router.get('/system/alerts', 
  asyncHandler(notificationController.getSystemAlerts.bind(notificationController))
);

// Resolve system alert
router.patch('/system/alerts/:alertId/resolve', 
  asyncHandler(notificationController.resolveSystemAlert.bind(notificationController))
);

// Create test alert (for development/testing)
router.post('/system/alerts/test', 
  asyncHandler(notificationController.createTestAlert.bind(notificationController))
);

// Statistics and Analytics

// Get notification statistics
router.get('/stats', 
  asyncHandler(notificationController.getNotificationStats.bind(notificationController))
);

export default router;