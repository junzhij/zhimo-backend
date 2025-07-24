import { Request, Response } from 'express';
import { AuthService } from '../services/authService';
import { UserModel } from '../models/userModel';

// Use require for express-validator due to CommonJS compatibility issues
const { body, validationResult } = require('express-validator');

export class AuthController {
  static registerValidation = [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email address'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters long')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number'),
    body('first_name')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('First name must be between 1 and 100 characters'),
    body('last_name')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Last name must be between 1 and 100 characters'),
    body('role')
      .optional()
      .isIn(['user', 'admin'])
      .withMessage('Role must be either user or admin')
  ];

  static loginValidation = [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email address'),
    body('password')
      .notEmpty()
      .withMessage('Password is required')
  ];

  static async register(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      const { email, password, first_name, last_name, role } = req.body;

      const authResponse = await AuthService.register({
        email,
        password,
        first_name,
        last_name,
        role
      });

      res.status(201).json({
        message: 'User registered successfully',
        data: authResponse
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'User with this email already exists') {
          res.status(409).json({ error: error.message });
          return;
        }
      }
      
      console.error('Registration error:', error);
      res.status(500).json({ error: 'Internal server error during registration' });
    }
  }

  static async login(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      const { email, password } = req.body;

      const authResponse = await AuthService.login({ email, password });

      res.status(200).json({
        message: 'Login successful',
        data: authResponse
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Invalid email or password') {
          res.status(401).json({ error: error.message });
          return;
        }
      }
      
      console.error('Login error:', error);
      res.status(500).json({ error: 'Internal server error during login' });
    }
  }

  static async refreshToken(req: Request, res: Response): Promise<void> {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.split(' ')[1];

      if (!token) {
        res.status(401).json({ error: 'Token required for refresh' });
        return;
      }

      const newToken = await AuthService.refreshToken(token);

      res.status(200).json({
        message: 'Token refreshed successfully',
        data: { token: newToken }
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Invalid') || error.message.includes('expired')) {
          res.status(401).json({ error: error.message });
          return;
        }
      }
      
      console.error('Token refresh error:', error);
      res.status(500).json({ error: 'Internal server error during token refresh' });
    }
  }

  static async getProfile(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { password_hash, ...userProfile } = req.user;

      res.status(200).json({
        message: 'Profile retrieved successfully',
        data: { user: userProfile }
      });
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({ error: 'Internal server error while retrieving profile' });
    }
  }

  static async updateProfile(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { first_name, last_name, email } = req.body;
      
      // Check if email is being changed and if it already exists
      if (email && email !== req.user.email) {
        const emailExists = await UserModel.emailExists(email);
        if (emailExists) {
          res.status(409).json({ error: 'Email already in use' });
          return;
        }
      }

      const updatedUser = await UserModel.updateUser(req.user.id, {
        first_name,
        last_name,
        email
      });

      if (!updatedUser) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const { password_hash, ...userProfile } = updatedUser;

      res.status(200).json({
        message: 'Profile updated successfully',
        data: { user: userProfile }
      });
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({ error: 'Internal server error while updating profile' });
    }
  }

  static async changePassword(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        res.status(400).json({ error: 'Current password and new password are required' });
        return;
      }

      // Validate current password
      const isValidPassword = await UserModel.validatePassword(currentPassword, req.user.password_hash);
      if (!isValidPassword) {
        res.status(401).json({ error: 'Current password is incorrect' });
        return;
      }

      // Validate new password strength
      if (newPassword.length < 8 || !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
        res.status(400).json({ 
          error: 'New password must be at least 8 characters long and contain at least one lowercase letter, one uppercase letter, and one number' 
        });
        return;
      }

      await UserModel.updateUser(req.user.id, { password: newPassword });

      res.status(200).json({
        message: 'Password changed successfully'
      });
    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({ error: 'Internal server error while changing password' });
    }
  }
}