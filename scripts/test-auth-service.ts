import { AuthError, authService } from '../src/modules/auth';

async function testAuthService() {
  console.log('Testing Auth Service...\n');

  // Test 1: Register a new user
  console.log('1️⃣ Testing registration...');
  try {
    const result = await authService.register({
      email: 'test-jwt@example.com',
      password: 'Test1234',
      name: 'Test User'
    }, { userAgent: 'test-script', ipAddress: '127.0.0.1' });

    console.log('✅ User registered:', result.user.email);
    console.log('✅ Token received:', result.token.substring(0, 30) + '...');
    console.log('✅ Expires at:', result.expiresAt);

    // Test 2: Validate session
    console.log('\n2️⃣ Testing session validation...');
    const validatedUser = await authService.validateSession(result.token);
    console.log('✅ Session validated:', validatedUser?.email);

    // Test 3: Login
    console.log('\n3️⃣ Testing login...');
    const loginResult = await authService.login({
      email: 'test-jwt@example.com',
      password: 'Test1234'
    });
    console.log('✅ Login successful:', loginResult.user.email);

    // Test 4: Get user sessions
    console.log('\n4️⃣ Testing get user sessions...');
    const sessions = await authService.getUserSessions(result.user.id);
    console.log('✅ Active sessions:', sessions.length);

    // Test 5: Logout
    console.log('\n5️⃣ Testing logout...');
    // Extract sessionId from token payload
    const { verifyToken } = await import('../src/lib/jwt');
    const payload = verifyToken(loginResult.token);
    if (payload) {
      await authService.logout(payload.sessionId);
      console.log('✅ Logged out session');
    }

    // Cleanup: delete test user and sessions
    console.log('\n🧹 Cleaning up...');
    const { prisma } = await import('../src/lib/prisma');
    await prisma.session.deleteMany({ where: { userId: result.user.id } });
    await prisma.user.delete({ where: { id: result.user.id } });
    console.log('✅ Test user cleaned up');

  } catch (error) {
    if (error instanceof AuthError) {
      console.error('❌ Auth error:', error.message, '(code:', error.code + ')');
    } else {
      console.error('❌ Error:', error);
    }
    process.exit(1);
  }

  // Test 6: Invalid login
  console.log('\n6️⃣ Testing invalid login...');
  try {
    await authService.login({
      email: 'nonexistent@example.com',
      password: 'wrongpassword'
    });
    console.error('❌ Should have thrown error');
    process.exit(1);
  } catch (error) {
    if (error instanceof AuthError && error.code === 'INVALID_CREDENTIALS') {
      console.log('✅ Invalid credentials rejected');
    } else {
      throw error;
    }
  }

  // Test 7: Weak password
  console.log('\n7️⃣ Testing weak password rejection...');
  try {
    await authService.register({
      email: 'weak@example.com',
      password: 'weak'
    });
    console.error('❌ Should have thrown error');
    process.exit(1);
  } catch (error) {
    if (error instanceof AuthError && error.code === 'PASSWORD_WEAK') {
      console.log('✅ Weak password rejected');
    } else {
      throw error;
    }
  }

  console.log('\n🎉 All Auth Service tests passed!');
  process.exit(0);
}

testAuthService();
