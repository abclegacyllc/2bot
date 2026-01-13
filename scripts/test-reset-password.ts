import { prisma } from '../src/lib/prisma';
import { AuthError, authService } from '../src/modules/auth';

async function testResetPassword() {
  console.log('Testing Task 1.4.2: Reset Password Endpoint...\n');

  const testEmail = 'reset-password-test@example.com';
  const originalPassword = 'Test1234';
  const newPassword = 'NewPass5678';

  // Cleanup any existing test data
  await prisma.passwordResetToken.deleteMany({ where: { user: { email: testEmail } } });
  await prisma.session.deleteMany({ where: { user: { email: testEmail } } });
  await prisma.user.deleteMany({ where: { email: testEmail } });

  // 1. Create test user
  console.log('1️⃣ Creating test user...');
  const registerResult = await authService.register({
    email: testEmail,
    password: originalPassword,
    name: 'Reset Password Test'
  });
  console.log('✅ Test user created:', registerResult.user.email);

  // 2. Request password reset token
  console.log('\n2️⃣ Requesting password reset token...');
  const token = await authService.requestPasswordReset(testEmail);
  console.log('✅ Token generated:', token ? token.substring(0, 20) + '...' : 'null');

  if (!token) {
    console.error('❌ Token should not be null');
    process.exit(1);
  }

  // 3. Reset password with valid token
  console.log('\n3️⃣ Resetting password with valid token...');
  await authService.resetPassword(token, newPassword);
  console.log('✅ Password reset successful');

  // 4. Verify can login with new password
  console.log('\n4️⃣ Verifying login with new password...');
  const loginResult = await authService.login({
    email: testEmail,
    password: newPassword
  });
  console.log('✅ Login with new password successful:', loginResult.user.email);

  // 5. Verify old password no longer works
  console.log('\n5️⃣ Verifying old password rejected...');
  try {
    await authService.login({
      email: testEmail,
      password: originalPassword
    });
    console.error('❌ Old password should be rejected');
    process.exit(1);
  } catch (error) {
    if (error instanceof AuthError && error.code === 'INVALID_CREDENTIALS') {
      console.log('✅ Old password correctly rejected');
    } else {
      throw error;
    }
  }

  // 6. Verify token cannot be reused
  console.log('\n6️⃣ Verifying token cannot be reused...');
  try {
    await authService.resetPassword(token, 'AnotherPass123');
    console.error('❌ Token should not be reusable');
    process.exit(1);
  } catch (error) {
    if (error instanceof AuthError && error.code === 'TOKEN_USED') {
      console.log('✅ Token correctly rejected after use');
    } else {
      throw error;
    }
  }

  // 7. Test expired token
  console.log('\n7️⃣ Testing expired token...');
  const newToken = await authService.requestPasswordReset(testEmail);
  // Manually expire the token
  await prisma.passwordResetToken.updateMany({
    where: { token: newToken! },
    data: { expiresAt: new Date(Date.now() - 1000) } // 1 second ago
  });
  try {
    await authService.resetPassword(newToken!, 'ExpiredPass123');
    console.error('❌ Expired token should be rejected');
    process.exit(1);
  } catch (error) {
    if (error instanceof AuthError && error.code === 'TOKEN_EXPIRED') {
      console.log('✅ Expired token correctly rejected');
    } else {
      throw error;
    }
  }

  // 8. Test invalid token
  console.log('\n8️⃣ Testing invalid token...');
  try {
    await authService.resetPassword('invalid-token-12345', 'SomePass123');
    console.error('❌ Invalid token should be rejected');
    process.exit(1);
  } catch (error) {
    if (error instanceof AuthError && error.code === 'TOKEN_INVALID') {
      console.log('✅ Invalid token correctly rejected');
    } else {
      throw error;
    }
  }

  // Cleanup
  console.log('\n🧹 Cleaning up...');
  await prisma.passwordResetToken.deleteMany({ where: { userId: registerResult.user.id } });
  await prisma.session.deleteMany({ where: { userId: registerResult.user.id } });
  await prisma.user.delete({ where: { id: registerResult.user.id } });
  console.log('✅ Test data cleaned up');

  console.log('\n🎉 Task 1.4.2 (Reset Password) all tests passed!');
  process.exit(0);
}

testResetPassword().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
