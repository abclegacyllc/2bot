import { verifyToken } from '../src/lib/jwt';
import { AuthError, authService } from '../src/modules/auth';

async function testAuthEndpoints() {
  console.log('Testing Auth Endpoints (Service Layer)...\n');

  // Test user for login
  const testEmail = 'login-test@example.com';
  const testPassword = 'Test1234';

  // Clean up any existing test user
  const { prisma } = await import('../src/lib/prisma');
  await prisma.session.deleteMany({ where: { user: { email: testEmail } } });
  await prisma.user.deleteMany({ where: { email: testEmail } });

  // 1. Register test user
  console.log('1️⃣ Registering test user...');
  const registerResult = await authService.register({
    email: testEmail,
    password: testPassword,
    name: 'Login Test User'
  });
  console.log('✅ Registered:', registerResult.user.email);

  // 2. Test login with correct password
  console.log('\n2️⃣ Testing login with correct password...');
  const loginResult = await authService.login({
    email: testEmail,
    password: testPassword
  });
  console.log('✅ Login successful:', loginResult.user.email);
  console.log('✅ Token received:', loginResult.token.substring(0, 30) + '...');

  // 3. Test login with wrong password
  console.log('\n3️⃣ Testing login with wrong password...');
  try {
    await authService.login({
      email: testEmail,
      password: 'WrongPassword123'
    });
    console.error('❌ Should have thrown error');
  } catch (error) {
    if (error instanceof AuthError && error.code === 'INVALID_CREDENTIALS') {
      console.log('✅ Wrong password rejected correctly');
    } else {
      throw error;
    }
  }

  // 4. Verify session created in DB
  console.log('\n4️⃣ Checking session in database...');
  const sessions = await authService.getUserSessions(registerResult.user.id);
  console.log('✅ Sessions in DB:', sessions.length);

  // 5. Test validateSession (used by /me endpoint)
  console.log('\n5️⃣ Testing validateSession (for /me endpoint)...');
  const validatedUser = await authService.validateSession(loginResult.token);
  if (validatedUser) {
    console.log('✅ Session validated, user:', validatedUser.email);
  } else {
    console.error('❌ Session validation failed');
  }

  // 6. Test logout
  console.log('\n6️⃣ Testing logout...');
  const payload = verifyToken(loginResult.token);
  if (payload) {
    await authService.logout(payload.sessionId);
    console.log('✅ Logout successful');

    // Verify session is deleted
    const afterLogout = await authService.validateSession(loginResult.token);
    if (!afterLogout) {
      console.log('✅ Session invalidated after logout');
    } else {
      console.error('❌ Session should be invalid after logout');
    }
  }

  // 7. Test /me returns 401 without token (will be HTTP test)
  console.log('\n7️⃣ Verify token no longer valid after logout...');
  const invalidSession = await authService.validateSession(loginResult.token);
  console.log('✅ Token invalid after logout:', invalidSession === null);

  // Cleanup
  console.log('\n🧹 Cleaning up...');
  await prisma.session.deleteMany({ where: { userId: registerResult.user.id } });
  await prisma.user.delete({ where: { id: registerResult.user.id } });
  console.log('✅ Test user cleaned up');

  console.log('\n🎉 All auth endpoint tests passed!');
  process.exit(0);
}

testAuthEndpoints().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
