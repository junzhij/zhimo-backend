import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { mysqlConnection } from '../database/mysql';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  first_name?: string;
  last_name?: string;
  role: 'user' | 'admin';
  is_active: boolean;
  email_verified: boolean;
  last_login?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserData {
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  role?: 'user' | 'admin';
}

export interface UserLoginData {
  email: string;
  password: string;
}

export class UserModel {
  static async create(userData: CreateUserData): Promise<User> {
    const id = uuidv4();
    const password_hash = await bcrypt.hash(userData.password, 12);
    
    const query = `
      INSERT INTO users (id, email, password_hash, first_name, last_name, role)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    await mysqlConnection.executeQuery(query, [
      id,
      userData.email,
      password_hash,
      userData.first_name || null,
      userData.last_name || null,
      userData.role || 'user'
    ]);
    
    return this.findById(id) as Promise<User>;
  }

  static async findById(id: string): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE id = ? AND is_active = true';
    const results = await mysqlConnection.executeQuery<User[]>(query, [id]);
    return results.length > 0 ? results[0] : null;
  }

  static async findByEmail(email: string): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE email = ? AND is_active = true';
    const results = await mysqlConnection.executeQuery<User[]>(query, [email]);
    return results.length > 0 ? results[0] : null;
  }

  static async validatePassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  static async updateLastLogin(userId: string): Promise<void> {
    const query = 'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?';
    await mysqlConnection.executeQuery(query, [userId]);
  }

  static async updateUser(userId: string, updateData: Partial<CreateUserData>): Promise<User | null> {
    const updates: string[] = [];
    const values: any[] = [];

    if (updateData.email) {
      updates.push('email = ?');
      values.push(updateData.email);
    }

    if (updateData.password) {
      updates.push('password_hash = ?');
      values.push(await bcrypt.hash(updateData.password, 12));
    }

    if (updateData.first_name !== undefined) {
      updates.push('first_name = ?');
      values.push(updateData.first_name);
    }

    if (updateData.last_name !== undefined) {
      updates.push('last_name = ?');
      values.push(updateData.last_name);
    }

    if (updateData.role) {
      updates.push('role = ?');
      values.push(updateData.role);
    }

    if (updates.length === 0) {
      return this.findById(userId);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(userId);

    const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
    await mysqlConnection.executeQuery(query, values);

    return this.findById(userId);
  }

  static async deactivateUser(userId: string): Promise<void> {
    const query = 'UPDATE users SET is_active = false WHERE id = ?';
    await mysqlConnection.executeQuery(query, [userId]);
  }

  static async emailExists(email: string): Promise<boolean> {
    const query = 'SELECT COUNT(*) as count FROM users WHERE email = ?';
    const results = await mysqlConnection.executeQuery<{count: number}[]>(query, [email]);
    return results[0].count > 0;
  }
}