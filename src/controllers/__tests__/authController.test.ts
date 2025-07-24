import request from 'supertest';
import express from 'express';
import { AuthController } from '../authController';
import { AuthService } from '../../services/authService';
import { UserModel, User } from '../../models/userModel';

// Mock dependencies
jest.mock('../../services/authService');
jest.mock('../../models/userModel');

const mockAuthService = AuthService as jest.Mocked<typeof AuthService>;
const mockUserModel = UserModel as jest.Mocked<typeof UserModel>;

const app = express();
app.use(express.json());

// Set up routes for testing
app.post('/register', AuthController.registerValidation, AuthController.register);
app.post('/login', AuthController.loginValidation, AuthController.login);
app.post('/refresh-token', AuthController.refreshToken);

// Mock authenticated user middleware for profile tests
app.use((req, res, next) => {
  if (req.headers.authorization) {
    (req as any).user = {
      id: 'user-id',
      email: 'test@example.com',
      password_hash: 'hash',
      role: 'user' as const,
      is_active: true,
      email_verified: false,
      created_at: new Date(),
      updated_at: new Date()
    };
  }
  next();
});

app.get('/profile', AuthController.getProfile);
app.put('/profile', AuthController.updateProfile);
app.put('/change-password', AuthController.changePassword);

describe('AuthController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /register', () => {
    it('should register user with valid data', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'TestPassword123',
        first_name: 'John',
        last_name: 'Doe'
      };

      const mockResponse = {
        user: {
          id: 'user-id',
          email: 'test@example.com',
          first_name: 'John',
          last_name: 'Doe',
          role: 'user' as const,
          is_active: true,
          email_verified: false,
          created_at: new Date(),
          updated_at: new Date()
        },
        token: 'mock-token'
      };

      mockAuthService.register.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/register')
        .send(userData);

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('User registered successfully');
      expect(response.body.data).toEqual(mockResponse);
    });

    it('should return 400 for invalid email', async () => {
      const userData = {
        email: 'invalid-email',
        password: 'TestPassword123'
      };

      const response = await request(app)
        .post('/register')
        .send(userData);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should return 400 for weak password', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'weak'
      };

      const response = await request(app)
        .post('/register')
        .send(userData);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should return 409 for existing email', async () => {
      const userData = {
        email: 'existing@example.com',
        password: 'TestPassword123'
      };

      mockAuthService.register.mockRejectedValue(new Error('User with this email already exists'));

      const response = await request(app)
        .post('/register')
        .send(userData);

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('User with this email already exists');
    });
  });

  describe('POST /login', () => {
    it('should login user with valid credentials', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'TestPassword123'
      };

      const mockResponse = {
        user: {
          id: 'user-id',
          email: 'test@example.com',
          role: 'user' as const,
          is_active: true,
          email_verified: false,
          created_at: new Date(),
          updated_at: new Date()
        },
        token: 'mock-token'
      };

      mockAuthService.login.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/login')
        .send(loginData);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Login successful');
      expect(response.body.data).toEqual(mockResponse);
    });

    it('should return 400 for invalid email format', async () => {
      const loginData = {
        email: 'invalid-email',
        password: 'TestPassword123'
      };

      const response = await request(app)
        .post('/login')
        .send(loginData);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should return 401 for invalid credentials', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'WrongPassword'
      };

      mockAuthService.login.mockRejectedValue(new Error('Invalid email or password'));

      const response = await request(app)
        .post('/login')
        .send(loginData);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid email or password');
    });
  });

  describe('POST /refresh-token', () => {
    it('should refresh token successfully', async () => {
      mockAuthService.refreshToken.mockResolvedValue('new-token');

      const response = await request(app)
        .post('/refresh-token')
        .set('Authorization', 'Bearer old-token');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Token refreshed successfully');
      expect(response.body.data.token).toBe('new-token');
    });

    it('should return 401 without token', async () => {
      const response = await request(app)
        .post('/refresh-token');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Token required for refresh');
    });
  });

  describe('GET /profile', () => {
    it('should return user profile', async () => {
      const response = await request(app)
        .get('/profile')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Profile retrieved successfully');
      expect(response.body.data.user).not.toHaveProperty('password_hash');
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/profile');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Authentication required');
    });
  });

  describe('PUT /profile', () => {
    it('should update user profile', async () => {
      const updateData = {
        first_name: 'Jane',
        last_name: 'Smith'
      };

      const updatedUser = {
        id: 'user-id',
        email: 'test@example.com',
        first_name: 'Jane',
        last_name: 'Smith',
        role: 'user' as const,
        is_active: true,
        email_verified: false,
        password_hash: 'hash',
        created_at: new Date(),
        updated_at: new Date()
      };

      mockUserModel.updateUser.mockResolvedValue(updatedUser);

      const response = await request(app)
        .put('/profile')
        .set('Authorization', 'Bearer valid-token')
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Profile updated successfully');
      expect(response.body.data.user.first_name).toBe('Jane');
    });

    it('should return 409 for existing email', async () => {
      const updateData = {
        email: 'existing@example.com'
      };

      mockUserModel.emailExists.mockResolvedValue(true);

      const response = await request(app)
        .put('/profile')
        .set('Authorization', 'Bearer valid-token')
        .send(updateData);

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('Email already in use');
    });
  });

  describe('PUT /change-password', () => {
    it('should change password successfully', async () => {
      const passwordData = {
        currentPassword: 'OldPassword123',
        newPassword: 'NewPassword123'
      };

      mockUserModel.validatePassword.mockResolvedValue(true);
      mockUserModel.updateUser.mockResolvedValue({} as any);

      const response = await request(app)
        .put('/change-password')
        .set('Authorization', 'Bearer valid-token')
        .send(passwordData);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Password changed successfully');
    });

    it('should return 401 for incorrect current password', async () => {
      const passwordData = {
        currentPassword: 'WrongPassword',
        newPassword: 'NewPassword123'
      };

      mockUserModel.validatePassword.mockResolvedValue(false);

      const response = await request(app)
        .put('/change-password')
        .set('Authorization', 'Bearer valid-token')
        .send(passwordData);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Current password is incorrect');
    });

    it('should return 400 for weak new password', async () => {
      const passwordData = {
        currentPassword: 'OldPassword123',
        newPassword: 'weak'
      };

      mockUserModel.validatePassword.mockResolvedValue(true);

      const response = await request(app)
        .put('/change-password')
        .set('Authorization', 'Bearer valid-token')
        .send(passwordData);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('New password must be at least 8 characters');
    });
  });
});