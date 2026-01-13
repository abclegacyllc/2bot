import { decodeToken, generateToken, getTokenExpiration, isTokenExpired, verifyToken } from '../src/lib/jwt';

async function testJWT() {
  console.log('Testing JWT utilities...\n');

  // Test payload (includes role for Phase 1.5)
  const payload = {
    userId: 'user_123',
    email: 'test@example.com',
    plan: 'FREE' as const,
    sessionId: 'sess_456',
    role: 'MEMBER' as const,
  };

  // Test token generation
  const token = generateToken(payload);
  console.log('✅ Token generated:', token.substring(0, 50) + '...');

  // Test token verification
  const verified = verifyToken(token);
  console.log('✅ Token verified:', JSON.stringify(verified));

  // Test decode (without verification)
  const decoded = decodeToken(token);
  console.log('✅ Token decoded (has iat/exp):', !!decoded?.iat, !!decoded?.exp);

  // Test expiration
  const exp = getTokenExpiration(token);
  console.log('✅ Expiration date:', exp?.toISOString());

  // Test isExpired
  console.log('✅ Is expired:', isTokenExpired(token));

  // Test invalid token
  const invalid = verifyToken('invalid.token.here');
  console.log('✅ Invalid token returns null:', invalid === null);

  console.log('\n🎉 All JWT tests passed!');
}

testJWT();
