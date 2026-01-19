/**
 * Privacy Policy Page
 *
 * Privacy policy explaining how 2Bot collects, uses, and protects user data.
 *
 * @module app/privacy/page
 */

import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | 2Bot",
  description: "Privacy Policy for the 2Bot platform - how we collect, use, and protect your data.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50">
        <div className="mx-auto max-w-4xl px-6 py-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-4xl px-6 py-12">
        <div className="space-y-8">
          {/* Title */}
          <div>
            <h1 className="text-4xl font-bold text-foreground">Privacy Policy</h1>
            <p className="mt-2 text-muted-foreground">
              Last updated: January 18, 2026
            </p>
          </div>

          {/* Introduction */}
          <p className="text-muted-foreground leading-relaxed">
            At 2Bot, we take your privacy seriously. This Privacy Policy explains how
            we collect, use, disclose, and safeguard your information when you use
            our platform. Please read this policy carefully.
          </p>

          {/* Content Sections */}
          <div className="prose prose-invert max-w-none space-y-8">
            {/* Section 1 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                1. Information We Collect
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                We collect information you provide directly and information collected
                automatically when you use our Service.
              </p>

              <h3 className="text-xl font-medium text-foreground mt-6">
                Information You Provide
              </h3>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>
                  <strong className="text-foreground">Account Information:</strong> Name,
                  email address, password when you register
                </li>
                <li>
                  <strong className="text-foreground">Payment Information:</strong> Billing
                  address and payment details (processed securely by Stripe)
                </li>
                <li>
                  <strong className="text-foreground">Bot Credentials:</strong> Telegram bot
                  tokens and API keys you connect
                </li>
                <li>
                  <strong className="text-foreground">Configuration Data:</strong> Plugin
                  settings, automation rules, and preferences
                </li>
              </ul>

              <h3 className="text-xl font-medium text-foreground mt-6">
                Automatically Collected Information
              </h3>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>
                  <strong className="text-foreground">Usage Data:</strong> Features used,
                  actions taken, timestamps
                </li>
                <li>
                  <strong className="text-foreground">Device Information:</strong> Browser
                  type, operating system, IP address
                </li>
                <li>
                  <strong className="text-foreground">Message Metadata:</strong> Message
                  counts and types (not message content unless required for plugin
                  functionality)
                </li>
              </ul>
            </section>

            {/* Section 2 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                2. How We Use Information
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                We use the information we collect to:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Provide, maintain, and improve our Service</li>
                <li>Process transactions and send related information</li>
                <li>Send technical notices, updates, and support messages</li>
                <li>Respond to your comments and questions</li>
                <li>Monitor and analyze usage patterns and trends</li>
                <li>Detect, prevent, and address technical issues</li>
                <li>Protect against fraudulent or illegal activity</li>
                <li>Comply with legal obligations</li>
              </ul>
            </section>

            {/* Section 3 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                3. Information Sharing
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                We do not sell your personal information. We may share information in
                the following circumstances:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>
                  <strong className="text-foreground">Service Providers:</strong> Third-party
                  services that help us operate (payment processing, analytics, hosting)
                </li>
                <li>
                  <strong className="text-foreground">Legal Requirements:</strong> When
                  required by law, subpoena, or legal process
                </li>
                <li>
                  <strong className="text-foreground">Safety:</strong> To protect the
                  rights, property, or safety of 2Bot, our users, or others
                </li>
                <li>
                  <strong className="text-foreground">Business Transfers:</strong> In
                  connection with a merger, acquisition, or sale of assets
                </li>
                <li>
                  <strong className="text-foreground">With Consent:</strong> When you
                  explicitly agree to share information
                </li>
              </ul>
            </section>

            {/* Section 4 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                4. Data Security
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                We implement appropriate technical and organizational security measures
                to protect your information:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Encryption of data in transit (TLS/SSL) and at rest</li>
                <li>Secure password hashing using industry-standard algorithms</li>
                <li>Regular security audits and vulnerability assessments</li>
                <li>Access controls and authentication requirements</li>
                <li>Encrypted storage of sensitive credentials (bot tokens, API keys)</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed">
                While we strive to protect your information, no method of transmission
                over the Internet is 100% secure. We cannot guarantee absolute security.
              </p>
            </section>

            {/* Section 5 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                5. Your Rights
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Depending on your location, you may have the following rights regarding
                your personal information:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>
                  <strong className="text-foreground">Access:</strong> Request a copy of
                  the personal data we hold about you
                </li>
                <li>
                  <strong className="text-foreground">Correction:</strong> Request
                  correction of inaccurate or incomplete data
                </li>
                <li>
                  <strong className="text-foreground">Deletion:</strong> Request deletion
                  of your personal data
                </li>
                <li>
                  <strong className="text-foreground">Portability:</strong> Request a copy
                  of your data in a machine-readable format
                </li>
                <li>
                  <strong className="text-foreground">Objection:</strong> Object to
                  processing of your personal data
                </li>
                <li>
                  <strong className="text-foreground">Withdrawal:</strong> Withdraw consent
                  at any time where processing is based on consent
                </li>
              </ul>
              <p className="text-muted-foreground leading-relaxed">
                To exercise these rights, please contact us at{" "}
                <a
                  href="mailto:privacy@2bot.ai"
                  className="text-purple-400 hover:text-purple-300"
                >
                  privacy@2bot.ai
                </a>
                .
              </p>
            </section>

            {/* Section 6 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                6. Cookies and Tracking
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                We use cookies and similar tracking technologies to collect and track
                information and to improve our Service.
              </p>

              <h3 className="text-xl font-medium text-foreground mt-6">
                Types of Cookies We Use
              </h3>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>
                  <strong className="text-foreground">Essential Cookies:</strong> Required
                  for the Service to function (authentication, security)
                </li>
                <li>
                  <strong className="text-foreground">Preference Cookies:</strong> Remember
                  your settings and preferences (theme, language)
                </li>
                <li>
                  <strong className="text-foreground">Analytics Cookies:</strong> Help us
                  understand how you use the Service
                </li>
              </ul>
              <p className="text-muted-foreground leading-relaxed">
                You can control cookie preferences through your browser settings.
                Disabling certain cookies may affect Service functionality.
              </p>
            </section>

            {/* Section 7 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                7. Third-Party Services
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Our Service integrates with third-party services that have their own
                privacy policies:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>
                  <strong className="text-foreground">Telegram:</strong> Subject to{" "}
                  <a
                    href="https://telegram.org/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-400 hover:text-purple-300"
                  >
                    Telegram&apos;s Privacy Policy
                  </a>
                </li>
                <li>
                  <strong className="text-foreground">Stripe:</strong> Payment processing
                  subject to{" "}
                  <a
                    href="https://stripe.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-400 hover:text-purple-300"
                  >
                    Stripe&apos;s Privacy Policy
                  </a>
                </li>
                <li>
                  <strong className="text-foreground">AI Providers:</strong> When using AI
                  features, data may be processed according to the respective AI
                  provider&apos;s privacy policies
                </li>
              </ul>
              <p className="text-muted-foreground leading-relaxed">
                We encourage you to review the privacy policies of any third-party
                services you connect to our platform.
              </p>
            </section>

            {/* Section 8 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                8. Data Retention
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                We retain your information for as long as your account is active or as
                needed to provide the Service. We may retain certain information as
                required by law or for legitimate business purposes.
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Account data: Retained until account deletion</li>
                <li>Usage logs: Retained for 90 days</li>
                <li>Payment records: Retained for 7 years (legal requirement)</li>
                <li>Backups: Retained for 30 days after deletion</li>
              </ul>
            </section>

            {/* Section 9 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                9. Children&apos;s Privacy
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Our Service is not intended for children under 18 years of age. We do
                not knowingly collect personal information from children under 18. If
                we become aware that we have collected personal information from a
                child under 18, we will take steps to delete that information.
              </p>
            </section>

            {/* Section 10 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                10. International Transfers
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Your information may be transferred to and processed in countries other
                than your country of residence. These countries may have different data
                protection laws. We take appropriate measures to ensure your
                information remains protected in accordance with this Privacy Policy.
              </p>
            </section>

            {/* Section 11 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                11. Changes to This Policy
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                We may update this Privacy Policy from time to time. We will notify you
                of any changes by posting the new Privacy Policy on this page and
                updating the &quot;Last updated&quot; date.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                For material changes, we will provide additional notice via email or
                through the Service at least 30 days before the changes take effect.
              </p>
            </section>

            {/* Section 12 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                12. Contact Us
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                If you have questions about this Privacy Policy or our data practices,
                please contact us:
              </p>
              <ul className="list-none text-muted-foreground space-y-2">
                <li>
                  <strong className="text-foreground">Privacy Inquiries:</strong>{" "}
                  <a
                    href="mailto:privacy@2bot.ai"
                    className="text-purple-400 hover:text-purple-300"
                  >
                    privacy@2bot.ai
                  </a>
                </li>
                <li>
                  <strong className="text-foreground">General Support:</strong>{" "}
                  <a
                    href="mailto:support@2bot.ai"
                    className="text-purple-400 hover:text-purple-300"
                  >
                    support@2bot.ai
                  </a>
                </li>
                <li>
                  <strong className="text-foreground">Data Protection Officer:</strong>{" "}
                  <a
                    href="mailto:dpo@2bot.ai"
                    className="text-purple-400 hover:text-purple-300"
                  >
                    dpo@2bot.ai
                  </a>
                </li>
              </ul>
            </section>
          </div>

          {/* Footer Links */}
          <div className="border-t border-border pt-8 flex flex-wrap gap-4 text-sm">
            <Link
              href="/terms"
              className="text-purple-400 hover:text-purple-300"
            >
              Terms of Service
            </Link>
            <span className="text-muted-foreground">•</span>
            <Link
              href="/"
              className="text-muted-foreground hover:text-foreground"
            >
              Home
            </Link>
            <span className="text-muted-foreground">•</span>
            <Link
              href="/register"
              className="text-muted-foreground hover:text-foreground"
            >
              Sign Up
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
