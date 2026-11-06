import bcrypt from 'bcryptjs';
import { passwordSchema } from '../validation/registration.js';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(passwordSchema.parse(password), 12);
}
