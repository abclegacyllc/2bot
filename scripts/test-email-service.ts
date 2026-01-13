import { sendEmail, sendPasswordResetEmail, sendWelcomeEmail } from '../src/lib/email';

async function testEmailService() {
  console.log('Testing Task 1.4.3: Email Service...\n');

  // 1. Test basic sendEmail
  console.log('1️⃣ Testing sendEmail function...');
  const result1 = await sendEmail({
    to: 'test@example.com',
    subject: 'Test Email',
    html: '<h1>Hello</h1><p>This is a test email.</p>',
    text: 'Hello\n\nThis is a test email.'
  });
  console.log('✅ Email sent successfully:', result1.success);
  console.log('✅ Message ID:', result1.messageId);

  // 2. Test password reset email
  console.log('\n2️⃣ Testing sendPasswordResetEmail function...');
  const result2 = await sendPasswordResetEmail(
    'user@example.com',
    'abc123def456token'
  );
  console.log('✅ Password reset email sent:', result2.success);
  console.log('✅ Message ID:', result2.messageId);

  // 3. Test welcome email
  console.log('\n3️⃣ Testing sendWelcomeEmail function...');
  const result3 = await sendWelcomeEmail(
    'newuser@example.com',
    'John Doe'
  );
  console.log('✅ Welcome email sent:', result3.success);
  console.log('✅ Message ID:', result3.messageId);

  // 4. Test welcome email without name
  console.log('\n4️⃣ Testing sendWelcomeEmail without name...');
  const result4 = await sendWelcomeEmail('anonymous@example.com');
  console.log('✅ Welcome email sent (no name):', result4.success);

  // Verify all succeeded
  if (!result1.success || !result2.success || !result3.success || !result4.success) {
    console.error('❌ Some emails failed to send');
    process.exit(1);
  }

  console.log('\n🎉 Task 1.4.3 (Email Service) all tests passed!');
  console.log('\nNote: In development mode, emails are logged to console.');
  console.log('In production with RESEND_API_KEY set, emails will be sent via Resend API.');
  process.exit(0);
}

testEmailService().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
