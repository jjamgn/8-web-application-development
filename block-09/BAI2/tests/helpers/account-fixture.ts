import bcrypt from 'bcryptjs';
import { stubSession, stubLoginAttempts } from './prisma-session.js';

export function accountFixture(db: any) {
  const sessions = stubSession(db);
  const attempts = stubLoginAttempts(db);
  const users = new Map<number, any>();
  const resetTokens = new Map<string, any>();
  const matches = (row: any, where: any) => Object.entries(where).every(([key, value]: [string, any]) => value && typeof value === 'object' && !(value instanceof Date) && 'not' in value ? row[key] !== value.not : row[key] === value);
  const change = (row: any, data: any) => {
    for (const [key, value] of Object.entries(data) as [string, any][]) row[key] = value && typeof value === 'object' && 'increment' in value ? row[key] + value.increment : value;
  };
  db.user.findUnique = async ({where}: any) => structuredClone([...users.values()].find(row => matches(row, where)) || null);
  db.user.updateMany = async ({where, data}: any) => {
    const selected = [...users.values()].filter(row => matches(row, where));
    selected.forEach(row => change(row, data));
    return {count: selected.length};
  };
  db.passwordResetToken.updateMany = async ({where, data}: any) => {
    const selected = [...resetTokens.values()].filter(row => matches(row, where));
    selected.forEach(row => change(row, data));
    return {count: selected.length};
  };
  const transaction = async (work: any) => {
    const maps: Map<any, any>[] = [users, resetTokens, sessions, attempts];
    const snapshots = maps.map(map => structuredClone(map));
    try {return await work(db);}
    catch (error) {maps.forEach((map, index) => {map.clear(); snapshots[index].forEach((value, key) => map.set(key, value));}); throw error;}
  };
  db.$transaction = transaction;
  return {
    users, resetTokens, sessions, attempts, transaction,
    async addUser(id: number, role = 'admin') {
      const user = {id, name: 'Nguyễn Minh An', email: `staff${id}@example.test`, role, status: 'active', emailVerifiedAt: new Date(), passwordVersion: 0, passwordHash: await bcrypt.hash('account-test-password', 4)};
      users.set(id, user);
      return user;
    },
  };
}
