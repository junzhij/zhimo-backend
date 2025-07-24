import { AuthService } from '../authService';
import { UserModel } from '../../models/userModel';
import jwt from 'jsonwebtoken';

// Mock dependencies
jest.mock('../../models/userModel');
jest.mock('jsonwebtoken');

const mockUserModel = UserModel as jest.Mocked<typeof UserModel>;
const mockJwt = jwt as jest.Mocked<typeof jwt>;

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
    process.env.JWT_EXPIRES_IN = '1h';
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'TestPassword123',
        first_name: 'John',
        last_name: 'Doe'
      };

      const mockUser = {
        id: 'user-id',
        email: 'test@example.com',
        password_hash: 'hashed-password',
        first_name: 'John',
        last_name: 'Doe',
        role: 'user' as const,
        is_active: true,
        email_verified: false,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockUserModel.findByEmail.mockResolvedValue(null);
      mockUserModel.create.mockResolvedValue(mockUser);
      mockJwt.sign.mockReturnValue('mock-token' as any);

      const result = await AuthService.register(userData);

      expect(mockUserModel.findByEmail).toHaveBeenCalledWith('test@example.com');
      expect(mockUserModel.create).toHaveBeenCalledWith(userData);
      expect(result.user).not.toHaveProperty('password_hash');
      expect(result.token).toBe('mock-token');
    });

    it('should throw error if user already exists', async () => {
      const userData = {
        email: 'existing@example.com',
        password: 'TestPassword123'
      };

      const existingUser = {
        id: 'existing-id',
        email: 'existing@example.com',
        password_hash: 'hash',
        role: 'user' as const,
        is_active: true,
        email_verified: false,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockUserModel.findByEmail.mockResolvedValue(existingUser);

      await expect(AuthService.register(userData)).rejects.toThrow('User with this email already exists');
    });
  });

  describe('login', () => {
    it('should login user with valid credentials', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'TestPassword123'
      };

      const mockUser = {
        id: 'user-id',
        email: 'test@example.com',
        password_hash: 'hashed-password',
        role: 'user' as const,
        is_active: true,
        email_verified: false,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockUserModel.findByEmail.mockResolvedValue(mockUser);
      mockUserModel.validatePassword.mockResolvedValue(true);
      mockUserModel.updateLastLogin.mockResolvedValue(undefined);
      mockJwt.sign.mockReturnValue('mock-token' as any);

      const result = await AuthService.login(loginData);

      expect(mockUserModel.findByEmail).toHaveBeenCalledWith('test@example.com');
      expect(mockUserModel.validatePassword).toHaveBeenCalledWith('TestPassword123', 'hashed-password');
      expect(mockUserModel.updateLastLogin).toHaveBeenCalledWith('user-id');
      expect(result.user).not.toHaveProperty('password_hash');
      expect(result.token).toBe('mock-token');
    });

    it('should throw error for non-existent user', async () => {
      const loginData = {
        email: 'nonexistent@example.com',
        password: 'TestPassword123'
      };

      mockUserModel.findByEmail.mockResolvedValue(null);

      await expect(AuthService.login(loginData)).rejects.toThrow('Invalid email or password');
    });

    it('should throw error for invalid password', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'WrongPassword'
      };

      const mockUser = {
        id: 'user-id',
        email: 'test@example.com',
        password_hash: 'hashed-password',
        role: 'user' as const,
        is_active: true,
        email_verified: false,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockUserModel.findByEmail.mockResolvedValue(mockUser);
      mockUserModel.validatePassword.mockResolvedValue(false);

      await expect(AuthService.login(loginData)).rejects.toThrow('Invalid email or password');
    });
  });

  describe('generateToken', () => {
    it('should generate JWT token with correct payload', () => {
      const payload = {
        userId: 'user-id',
        email: 'test@example.com',
        role: 'user'
      };

      mockJwt.sign.mockReturnValue('generated-token' as any);

      const result = AuthService.generateToken(payload);

      expect(mockJwt.sign).toHaveBeenCalledWith(payload, 'your-secret-key', { expiresIn: '24h' });
      expect(result).toBe('generated-token');
    });
  });

  describe('verifyToken', () => {
    it('should verify valid token', () => {
      const token = 'valid-token';
      const payload = {
        userId: 'user-id',
        email: 'test@example.com',
        role: 'user'
      };

      mockJwt.verify.mockReturnValue(payload as any);

      const result = AuthService.verifyToken(token);

      expect(mockJwt.verify).toHaveBeenCalledWith(token, 'your-secret-key');
      expect(result).toEqual(payload);
    });

    it('should throw error for invalid token', () => {
      const token = 'invalid-token';

      mockJwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      expect(() => AuthService.verifyToken(token)).toThrow('Invalid or expired token');
    });
  });

  describe('getUserFromToken', () => {
    it('should return user for valid token', async () => {
      const token = 'valid-token';
      const payload = {
        userId: 'user-id',
        email: 'test@example.com',
        role: 'user'
      };
      const mockUser = {
        id: 'user-id',
        email: 'test@example.com',
        role: 'user' as const,
        is_active: true,
        password_hash: 'hash',
        email_verified: false,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockJwt.verify.mockReturnValue(payload as any);
      mockUserModel.findById.mockResolvedValue(mockUser);

      const result = await AuthService.getUserFromToken(token);

      expect(result).toEqual(mockUser);
    });

    it('should return null for invalid token', async () => {
      const token = 'invalid-token';

      mockJwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const result = await AuthService.getUserFromToken(token);

      expect(result).toBeNull();
    });
  });

  describe('refreshToken', () => {
    it('should refresh token for valid user', async () => {
      const token = 'old-token';
      const payload = {
        userId: 'user-id',
        email: 'test@example.com',
        role: 'user'
      };
      const mockUser = {
        id: 'user-id',
        email: 'test@example.com',
        role: 'user' as const,
        is_active: true,
        password_hash: 'hash',
        email_verified: false,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockJwt.verify.mockReturnValue(payload as any);
      mockUserModel.findById.mockResolvedValue(mockUser);
      mockJwt.sign.mockReturnValue('new-token' as any);

      const result = await AuthService.refreshToken(token);

      expect(result).toBe('new-token');
    });

    it('should throw error if user not found', async () => {
      const token = 'valid-token';
      const payload = {
        userId: 'user-id',
        email: 'test@example.com',
        role: 'user'
      };

      mockJwt.verify.mockReturnValue(payload as any);
      mockUserModel.findById.mockResolvedValue(null);

      await expect(AuthService.refreshToken(token)).rejects.toThrow('User not found');
    });
  });
});