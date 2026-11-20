import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

// Run only on the trusted server with database credentials. This never accepts
// a role from an HTTP request and never creates or verifies an account.
const args = process.argv.slice(2);
const raw = args[0] === '--email' && args.length === 2 ? args[1] : args.length === 1 ? args[0] : '';
const email = raw.trim().toLowerCase();
if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Cách dùng: npm run admin:promote -- --email email-da-xac-minh@example.com');
  process.exitCode = 1;
} else {
  const prisma = new PrismaClient();
  try {
    await prisma.$transaction(async tx => {
      const user = await tx.user.findUnique({ where: { email } });
      if (!user || user.status !== 'active' || !user.emailVerifiedAt) throw new Error('Account is not verified and active');
      await tx.user.update({ where: { id: user.id }, data: { role: 'admin', passwordVersion: { increment: 1 } } });
      await tx.session.deleteMany({ where: { userId: user.id } });
    }, { isolationLevel: 'Serializable' });
    console.log('Đã cấp quyền quản trị. Người dùng cần đăng nhập lại để tiếp tục.');
  } catch {
    console.error('Chưa cấp được quyền. Kiểm tra database và bảo đảm tài khoản đã xác minh, đang active.');
    process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
}
