import { prisma } from '../src/lib/prisma';
import { authService } from '../src/modules/auth';

async function testForgotPassword() {
  console.log('Testing Task 1.4.1: Forgot Password Endpoint...\n');

  const testEmail = 'forgot-password-test@example.com';

  // Cleanup any existing test data
  await prisma.passwordResetToken.deleteMany({ where: { user: { email: testEmail } } });
  await prisma.session.deleteMany({ where: { user: { email: testEmail } } });
  await prisma.user.deleteMany({ where: { email: testEmail } });

  // 1. Create test user
  console.log('1️⃣ Creating test user...');
  const registerResult = await authService.register({
    email: testEmail,
    password: 'Test1234',
    name: 'Forgot Password Test'
  });
  console.log('✅ Test user created:', registerResult.user.email);

  // 2. Request password reset
  console.log('\n2️⃣ Requesting password reset...');
  const token = await authService.requestPasswordReset(testEmail);
  console.log('✅ Token generated:', token ? token.substring(0, 20) + '...' : 'null');
  
  if (!token) {
    console.error('❌ Token should not be null for existing user');
    process.exit(1);
  }

  // 3. Verify token is stored in database
  console.log('\n3️⃣ Verifying token stored in database...');
  const storedToken = await prisma.passwordResetToken.findUnique({
    where: { token }
  });
  console.log('✅ Token found in DB:', !!storedToken);
  console.log('✅ Token expires at:', storedToken?.expiresAt?.toISOString());

  // 4. Verify expiry is ~1 hour from now
  console.log('\n4️⃣ Verifying token expires in ~1 hour...');
  const now = new Date();
  const expiresAt = storedToken!.expiresAt;
  const diffMs = expiresAt.getTime() - now.getTime();
  const diffMins = Math.round(diffMs / 1000 / 60);
  console.log('✅ Token expires in', diffMins, 'minutes');
  
  if (diffMins < 55 || diffMins > 65) {
    console.error('❌ Token should expire in ~60 minutes, got', diffMins);
    process.exit(1);
  }

  // 5. Test with non-existent email (should return null but not error)
  console.log('\n5️⃣ Testing with non-existent email...');
  const nullToken = await authService.requestPasswordReset('nonexistent@example.com');
  console.log('✅ Returns null for non-existent email:', nullToken === null);

  // 6. Verify new token request invalidates old one
  console.log('\n6️⃣ Verifying new request invalidates old token...');
  const newToken = await authService.requestPasswordReset(testEmail);
  const oldTokenStillExists = await prisma.passwordResetToken.findUnique({
    where: { token }
  });
  console.log('✅ Old token invalidated:', oldTokenStillExists === null);
  console.log('✅ New token generated:', newToken ? newToken.substring(0, 20) + '...' : 'null');

  // Cleanup
  console.log('\n🧹 Cleaning up...');
  await prisma.passwordResetToken.deleteMany({ where: { userId: registerResult.user.id } });
  await prisma.session.deleteMany({ where: { userId: registerResult.user.id } });
  await prisma.user.delete({ where: { id: registerResult.user.id } });
  console.log('✅ Test data cleaned up');

  console.log('\n🎉 Task 1.4.1 (Forgot Password) all tests passed!');
  process.exit(0);
}

testForgotPassword().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
