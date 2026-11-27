import type { SessionData } from 'express-session';
import type { UserDto } from '../../../contracts/index.js';

// A implements these operations against the dedicated Block 11 database.
export interface UserRepository {
  byEmail(email: string): Promise<(UserDto & { passwordHash: string }) | null>;
  byId(id: string): Promise<UserDto | null>;
  create(data: { name: string; email: string; passwordHash: string }): Promise<UserDto>;
}
export type SessionRecord = { sid: string; userId: string | null; data: SessionData; expiresAt: Date };
export interface SessionRepository {
  read(sid: string): Promise<SessionRecord | null>;
  create(record: SessionRecord): Promise<void>;
  // UPDATE only, WHERE sid AND expiresAt > now; NEVER upsert/recreate a destroyed session.
  // Preserve the stored expiresAt. Return false when missing/expired.
  updateActive(sid: string, data: SessionData, userId: string | null): Promise<boolean>;
  destroy(sid: string): Promise<void>;
}
