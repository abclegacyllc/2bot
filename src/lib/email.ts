/**
 * Email Service
 *
 * Handles sending transactional emails.
 * Uses Resend in production, console.log in development.
 *
 * @module lib/email
 */

import { loggers } from "./logger";

const logger = loggers.server;

/**
 * Get email configuration at runtime (ensures env vars are loaded)
 */
function getEmailConfig() {
  return {
    from: process.env.EMAIL_FROM || "2Bot <hello@2bot.org>",
    replyTo: process.env.EMAIL_REPLY_TO || "support@2bot.org",
    baseUrl: process.env.APP_URL || "https://www.2bot.org",
    dashboardUrl: process.env.NEXT_PUBLIC_DASHBOARD_URL || "https://dash.2bot.org",
  };
}

/**
 * Email options interface
 */
export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Email result interface
 */
export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send an email
 *
 * In development: logs to console
 * In production: uses Resend API
 *
 * @param options - Email options (to, subject, html, text)
 * @returns Result with success status and optional messageId
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  const { to, subject, html, text } = options;

  // If no API key, log to console (true development mode)
  if (!process.env.RESEND_API_KEY) {
    logger.info(
      {
        to,
        subject,
        from: getEmailConfig().from,
      },
      "[DEV EMAIL] Would send email (no RESEND_API_KEY)"
    );
    console.log("\n" + "=".repeat(60));
    console.log("📧 EMAIL (Development Mode - No API Key)");
    console.log("=".repeat(60));
    console.log(`To: ${to}`);
    console.log(`From: ${getEmailConfig().from}`);
    console.log(`Subject: ${subject}`);
    console.log("-".repeat(60));
    console.log(text || html.replace(/<[^>]*>/g, ""));
    console.log("=".repeat(60) + "\n");

    return {
      success: true,
      messageId: `dev-${Date.now()}`,
    };
  }

  // Production mode: use Resend
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: getEmailConfig().from,
        to: [to],
        subject,
        html,
        text,
        reply_to: getEmailConfig().replyTo,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error({ to, subject, error }, "Failed to send email via Resend");
      return {
        success: false,
        error: `Resend API error: ${error}`,
      };
    }

    const data = (await response.json()) as { id: string };
    logger.info({ to, subject, messageId: data.id }, "Email sent successfully");

    return {
      success: true,
      messageId: data.id,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error({ to, subject, error: message }, "Failed to send email");
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Send password reset email
 *
 * @param email - Recipient email
 * @param token - Reset token
 * @returns Email result
 */
export async function sendPasswordResetEmail(
  email: string,
  token: string
): Promise<EmailResult> {
  const resetUrl = `${getEmailConfig().baseUrl}/auth/reset-password?token=${token}`;

  const subject = "Reset your 2Bot password";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">🤖 2Bot</h1>
  </div>
  
  <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
    <h2 style="color: #1f2937; margin-top: 0;">Reset Your Password</h2>
    
    <p>We received a request to reset your password. Click the button below to create a new password:</p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetUrl}" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Reset Password</a>
    </div>
    
    <p style="color: #6b7280; font-size: 14px;">This link will expire in 1 hour for security reasons.</p>
    
    <p style="color: #6b7280; font-size: 14px;">If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
    
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    
    <p style="color: #9ca3af; font-size: 12px; margin-bottom: 0;">
      If the button doesn't work, copy and paste this link into your browser:<br>
      <a href="${resetUrl}" style="color: #667eea; word-break: break-all;">${resetUrl}</a>
    </p>
  </div>
  
  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p>© ${new Date().getFullYear()} 2Bot. All rights reserved.</p>
  </div>
</body>
</html>
`;

  const text = `
Reset Your 2Bot Password

We received a request to reset your password.

Click here to reset your password:
${resetUrl}

This link will expire in 1 hour for security reasons.

If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.

---
© ${new Date().getFullYear()} 2Bot. All rights reserved.
`;

  return sendEmail({
    to: email,
    subject,
    html,
    text,
  });
}

/**
 * Send welcome email after registration
 *
 * @param email - Recipient email
 * @param name - User's name (optional)
 * @returns Email result
 */
export async function sendWelcomeEmail(
  email: string,
  name?: string | null
): Promise<EmailResult> {
  const displayName = name || "there";
  const subject = "Welcome to 2Bot! 🤖";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">🤖 2Bot</h1>
  </div>
  
  <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
    <h2 style="color: #1f2937; margin-top: 0;">Welcome, ${displayName}!</h2>
    
    <p>Thanks for signing up for 2Bot. You're now ready to automate your Telegram experience with AI-powered tools.</p>
    
    <h3 style="color: #374151;">Getting Started:</h3>
    <ul style="color: #4b5563;">
      <li>Connect your Telegram bot</li>
      <li>Set up your first automation</li>
      <li>Explore our plugin marketplace</li>
    </ul>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${getEmailConfig().dashboardUrl}" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Go to Dashboard</a>
    </div>
    
    <p style="color: #6b7280; font-size: 14px;">Need help? Reply to this email or check out our documentation.</p>
  </div>
  
  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p>© ${new Date().getFullYear()} 2Bot. All rights reserved.</p>
  </div>
</body>
</html>
`;

  const text = `
Welcome to 2Bot, ${displayName}!

Thanks for signing up for 2Bot. You're now ready to automate your Telegram experience with AI-powered tools.

Getting Started:
- Connect your Telegram bot
- Set up your first automation
- Explore our plugin marketplace

Go to your dashboard: ${getEmailConfig().dashboardUrl}

Need help? Reply to this email or check out our documentation.

---
© ${new Date().getFullYear()} 2Bot. All rights reserved.
`;

  return sendEmail({
    to: email,
    subject,
    html,
    text,
  });
}

/**
 * Send organization invite email
 *
 * @param email - Recipient email
 * @param organizationName - Name of the organization
 * @param inviterName - Name of the person who sent the invite
 * @param role - Role being invited to
 * @returns Email result
 */
export async function sendOrganizationInviteEmail(
  email: string,
  organizationName: string,
  inviterName: string,
  role: string
): Promise<EmailResult> {
  const invitesUrl = `${getEmailConfig().baseUrl}/invites`;
  const roleDisplay = role.replace('ORG_', '').toLowerCase();
  const subject = `You've been invited to join ${organizationName} on 2Bot`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">🤖 2Bot</h1>
  </div>
  
  <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
    <h2 style="color: #1f2937; margin-top: 0;">You're Invited!</h2>
    
    <p><strong>${inviterName}</strong> has invited you to join <strong>${organizationName}</strong> as a <strong>${roleDisplay}</strong>.</p>
    
    <p>Click the button below to view and accept your invitation:</p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${invitesUrl}" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">View Invitation</a>
    </div>
    
    <p style="color: #6b7280; font-size: 14px;">Once you accept, you'll have access to the organization's gateways, plugins, and resources based on your role.</p>
    
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    
    <p style="color: #9ca3af; font-size: 12px; margin-bottom: 0;">
      If you didn't expect this invitation, you can safely ignore this email.
    </p>
  </div>
  
  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p>© ${new Date().getFullYear()} 2Bot. All rights reserved.</p>
  </div>
</body>
</html>
`;

  const text = `
You're Invited to ${organizationName}!

${inviterName} has invited you to join ${organizationName} as a ${roleDisplay}.

View and accept your invitation here:
${invitesUrl}

Once you accept, you'll have access to the organization's gateways, plugins, and resources based on your role.

If you didn't expect this invitation, you can safely ignore this email.

---
© ${new Date().getFullYear()} 2Bot. All rights reserved.
`;

  return sendEmail({
    to: email,
    subject,
    html,
    text,
  });
}

/**
 * Send organization invite email with registration link
 * For users who don't have an account yet
 *
 * @param email - Recipient email
 * @param organizationName - Name of the organization
 * @param inviterName - Name of the person who sent the invite
 * @param role - Role being invited to
 * @param token - Unique invite token
 * @returns Email result
 */
export async function sendPendingInviteEmail(
  email: string,
  organizationName: string,
  inviterName: string,
  role: string,
  token: string
): Promise<EmailResult> {
  const inviteUrl = `${getEmailConfig().baseUrl}/invite/${token}`;
  const roleDisplay = role.replace('ORG_', '').toLowerCase();
  const subject = `You've been invited to join ${organizationName} on 2Bot`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">🤖 2Bot</h1>
  </div>
  
  <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
    <h2 style="color: #1f2937; margin-top: 0;">You're Invited!</h2>
    
    <p><strong>${inviterName}</strong> has invited you to join <strong>${organizationName}</strong> as a <strong>${roleDisplay}</strong>.</p>
    
    <p>Click the button below to create your account and join the organization:</p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${inviteUrl}" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Accept Invitation</a>
    </div>
    
    <p style="color: #6b7280; font-size: 14px;">This invitation link will expire in 7 days.</p>
    
    <p style="color: #6b7280; font-size: 14px;">Once you create your account, you'll have access to the organization's gateways, plugins, and resources based on your role.</p>
    
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    
    <p style="color: #9ca3af; font-size: 12px; margin-bottom: 0;">
      If the button doesn't work, copy and paste this link into your browser:<br>
      <a href="${inviteUrl}" style="color: #667eea; word-break: break-all;">${inviteUrl}</a>
    </p>
  </div>
  
  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p>© ${new Date().getFullYear()} 2Bot. All rights reserved.</p>
  </div>
</body>
</html>
`;

  const text = `
You're Invited to ${organizationName}!

${inviterName} has invited you to join ${organizationName} as a ${roleDisplay}.

Click here to create your account and join:
${inviteUrl}

This invitation link will expire in 7 days.

Once you create your account, you'll have access to the organization's gateways, plugins, and resources based on your role.

If you didn't expect this invitation, you can safely ignore this email.

---
© ${new Date().getFullYear()} 2Bot. All rights reserved.
`;

  return sendEmail({
    to: email,
    subject,
    html,
    text,
  });
}
