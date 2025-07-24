import jwt from 'jsonwebtoken';
import { UserModel, CreateUserData, UserLoginData, User } from '../models/userModel';

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
}

export interface AuthResponse {
  user: Omit<User, 'password_hash'>;
  token: string;
}

export class AuthService {
  private static readonly JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
  private static readonly JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

  static async register(userData: CreateUserData): Promise<AuthResponse> {
    // Check if user already exists
    const existingUser = await UserModel.findByEmail(userData.email);
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Create new user
    const user = await UserModel.create(userData);
    
    // Generate JWT token
    const token = this.generateToken({
      userId: user.id,
      email: user.email,
      role: user.role
    });

    // Return user without password hash
    const { password_hash, ...userWithoutPassword } = user;
    
    return {
      user: userWithoutPassword,
      token
    };
  }

  static async login(loginData: UserLoginData): Promise<AuthResponse> {
    // Find user by email
    const user = await UserModel.findByEmail(loginData.email);
    if (!user) {
      throw new Error('Invalid email or password');
    }

    // Validate password
    const isValidPassword = await UserModel.validatePassword(loginData.password, user.password_hash);
    if (!isValidPassword) {
      throw new Error('Invalid email or password');
    }

    // Update last login
    await UserModel.updateLastLogin(user.id);

    // Generate JWT token
    const token = this.generateToken({
      userId: user.id,
      email: user.email,
      role: user.role
    });

    // Return user without password hash
    const { password_hash, ...userWithoutPassword } = user;
    
    return {
      user: userWithoutPassword,
      token
    };
  }

  static generateToken(payload: JWTPayload): string {
    return jwt.sign(payload, this.JWT_SECRET, {
      expiresIn: this.JWT_EXPIRES_IN
    } as jwt.SignOptions);
  }

  static verifyToken(token: string): JWTPayload {
    try {
      return jwt.verify(token, this.JWT_SECRET) as JWTPayload;
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  static async getUserFromToken(token: string): Promise<User | null> {
    try {
      const payload = this.verifyToken(token);
      return await UserModel.findById(payload.userId);
    } catch (error) {
      return null;
    }
  }

  static async refreshToken(token: string): Promise<string> {
    const payload = this.verifyToken(token);
    
    // Verify user still exists and is active
    const user = await UserModel.findById(payload.userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Generate new token
    return this.generateToken({
      userId: user.id,
      email: user.email,
      role: user.role
    });
  }
}