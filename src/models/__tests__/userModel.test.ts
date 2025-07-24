import { UserModel, CreateUserData } from '../userModel';
import { mysqlConnection } from '../../database/mysql';

// Mock the mysql connection
jest.mock('../../database/mysql');
const mockMysqlConnection = mysqlConnection as jest.Mocked<typeof mysqlConnection>;

describe('UserModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new user with hashed password', async () => {
      const userData: CreateUserData = {
        email: 'test@example.com',
        password: 'TestPassword123',
        first_name: 'John',
        last_name: 'Doe'
      };

      const mockUser = {
        id: 'mock-uuid',
        email: 'test@example.com',
        password_hash: 'hashed-password',
        first_name: 'John',
        last_name: 'Doe',
        role: 'user',
        is_active: true,
        email_verified: false,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockMysqlConnection.executeQuery
        .mockResolvedValueOnce(undefined) // INSERT query
        .mockResolvedValueOnce([mockUser]); // SELECT query for findById

      const result = await UserModel.create(userData);

      expect(mockMysqlConnection.executeQuery).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockUser);
    });

    it('should create user with default role', async () => {
      const userData: CreateUserData = {
        email: 'test@example.com',
        password: 'TestPassword123'
      };

      mockMysqlConnection.executeQuery
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([{
          id: 'mock-uuid',
          email: 'test@example.com',
          role: 'user'
        }]);

      await UserModel.create(userData);

      const insertCall = mockMysqlConnection.executeQuery.mock.calls[0];
      expect(insertCall?.[1]?.[5]).toBe('user'); // role parameter
    });
  });

  describe('findById', () => {
    it('should return user when found', async () => {
      const mockUser = {
        id: 'test-id',
        email: 'test@example.com',
        is_active: true
      };

      mockMysqlConnection.executeQuery.mockResolvedValue([mockUser]);

      const result = await UserModel.findById('test-id');

      expect(mockMysqlConnection.executeQuery).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE id = ? AND is_active = true',
        ['test-id']
      );
      expect(result).toEqual(mockUser);
    });

    it('should return null when user not found', async () => {
      mockMysqlConnection.executeQuery.mockResolvedValue([]);

      const result = await UserModel.findById('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('should return user when found by email', async () => {
      const mockUser = {
        id: 'test-id',
        email: 'test@example.com',
        is_active: true
      };

      mockMysqlConnection.executeQuery.mockResolvedValue([mockUser]);

      const result = await UserModel.findByEmail('test@example.com');

      expect(mockMysqlConnection.executeQuery).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE email = ? AND is_active = true',
        ['test@example.com']
      );
      expect(result).toEqual(mockUser);
    });

    it('should return null when user not found by email', async () => {
      mockMysqlConnection.executeQuery.mockResolvedValue([]);

      const result = await UserModel.findByEmail('nonexistent@example.com');

      expect(result).toBeNull();
    });
  });

  describe('validatePassword', () => {
    it('should return true for valid password', async () => {
      const plainPassword = 'TestPassword123';
      const hashedPassword = '$2a$12$hashedpassword';

      // Mock bcrypt.compare to return true
      const bcrypt = require('bcryptjs');
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);

      const result = await UserModel.validatePassword(plainPassword, hashedPassword);

      expect(result).toBe(true);
      expect(bcrypt.compare).toHaveBeenCalledWith(plainPassword, hashedPassword);
    });

    it('should return false for invalid password', async () => {
      const plainPassword = 'WrongPassword';
      const hashedPassword = '$2a$12$hashedpassword';

      const bcrypt = require('bcryptjs');
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false);

      const result = await UserModel.validatePassword(plainPassword, hashedPassword);

      expect(result).toBe(false);
    });
  });

  describe('updateLastLogin', () => {
    it('should update last login timestamp', async () => {
      mockMysqlConnection.executeQuery.mockResolvedValue(undefined);

      await UserModel.updateLastLogin('test-id');

      expect(mockMysqlConnection.executeQuery).toHaveBeenCalledWith(
        'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
        ['test-id']
      );
    });
  });

  describe('emailExists', () => {
    it('should return true when email exists', async () => {
      mockMysqlConnection.executeQuery.mockResolvedValue([{ count: 1 }]);

      const result = await UserModel.emailExists('existing@example.com');

      expect(result).toBe(true);
      expect(mockMysqlConnection.executeQuery).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM users WHERE email = ?',
        ['existing@example.com']
      );
    });

    it('should return false when email does not exist', async () => {
      mockMysqlConnection.executeQuery.mockResolvedValue([{ count: 0 }]);

      const result = await UserModel.emailExists('nonexistent@example.com');

      expect(result).toBe(false);
    });
  });

  describe('deactivateUser', () => {
    it('should deactivate user', async () => {
      mockMysqlConnection.executeQuery.mockResolvedValue(undefined);

      await UserModel.deactivateUser('test-id');

      expect(mockMysqlConnection.executeQuery).toHaveBeenCalledWith(
        'UPDATE users SET is_active = false WHERE id = ?',
        ['test-id']
      );
    });
  });
});