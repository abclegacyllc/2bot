/**
 * Privacy Policy Page
 *
 * Privacy policy explaining how ABC Legacy LLC (operating as 2Bot) collects,
 * uses, and protects user data.
 *
 * @module app/privacy/page
 */

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
          <nav className="flex items-center gap-1.5 text-sm">
            <Link
              href="/"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Home
            </Link>
            <span className="text-muted-foreground/50">/</span>
            <span className="text-foreground font-medium">Privacy Policy</span>
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-4xl px-6 py-12">
        <div className="space-y-8">
          {/* Title */}
          <div>
            <h1 className="text-4xl font-bold text-foreground">Privacy Policy</h1>
            <p className="mt-2 text-muted-foreground">
              Last updated: February 15, 2026
            </p>
          </div>

          {/* Introduction */}
          <p className="text-muted-foreground leading-relaxed">
            ABC Legacy LLC (&quot;Company,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;), operating the 2Bot
            platform, is committed to protecting your privacy. This Privacy Policy
            explains how we collect, use, disclose, and safeguard your information
            when you use our cloud-based workflow automation and backend building
            platform (&quot;Service&quot;) accessible at 2bot.org. Please read this policy
            carefully.
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
                  email address, and password when you register for an account
                </li>
                <li>
                  <strong className="text-foreground">Organization Information:</strong> Company
                  name and team member details for organization accounts
                </li>
                <li>
                  <strong className="text-foreground">Payment Information:</strong> Billing
                  address and payment details (processed securely by Stripe; we do not
                  store full card numbers)
                </li>
                <li>
                  <strong className="text-foreground">API Credentials:</strong> API keys,
                  access tokens, and webhook URLs you configure for third-party
                  messaging services
                </li>
                <li>
                  <strong className="text-foreground">Configuration Data:</strong> Plugin
                  settings, workflow rules, automation configurations, and preferences
                </li>
              </ul>

              <h3 className="text-xl font-medium text-foreground mt-6">
                Automatically Collected Information
              </h3>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>
                  <strong className="text-foreground">Usage Data:</strong> Features used,
                  actions taken, workflow execution logs, and timestamps
                </li>
                <li>
                  <strong className="text-foreground">Device Information:</strong> Browser
                  type, operating system, IP address, and device identifiers
                </li>
                <li>
                  <strong className="text-foreground">Performance Metrics:</strong> API
                  response times, error rates, and credit consumption data
                </li>
              </ul>
            </section>

            {/* Section 2 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                2. How We Use Information
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                We use the information we collect for the following purposes:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Provide, operate, maintain, and improve our Service</li>
                <li>Process subscriptions, transactions, and credit-based billing</li>
                <li>Send technical notices, security alerts, and support communications</li>
                <li>Respond to your comments, questions, and customer service requests</li>
                <li>Monitor and analyze usage patterns, trends, and performance</li>
                <li>Detect, investigate, and prevent fraudulent or unauthorized activity</li>
                <li>Enforce our Terms of Service and protect our legal rights</li>
                <li>Comply with applicable laws, regulations, and legal obligations</li>
              </ul>
            </section>

            {/* Section 3 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                3. Information Sharing and Disclosure
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                We do not sell, rent, or trade your personal information to third
                parties. We may share information in the following limited circumstances:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>
                  <strong className="text-foreground">Service Providers:</strong> Trusted
                  third-party vendors that help us operate our business (payment
                  processing, cloud hosting, analytics, error monitoring)
                </li>
                <li>
                  <strong className="text-foreground">Legal Requirements:</strong> When
                  required by law, regulation, subpoena, court order, or legal process
                </li>
                <li>
                  <strong className="text-foreground">Safety and Protection:</strong> To
                  protect the rights, property, safety, or security of ABC Legacy LLC,
                  our users, or the public
                </li>
                <li>
                  <strong className="text-foreground">Business Transfers:</strong> In
                  connection with a merger, acquisition, reorganization, or sale of
                  assets, with advance notice to affected users
                </li>
                <li>
                  <strong className="text-foreground">With Your Consent:</strong> When you
                  explicitly authorize us to share information
                </li>
              </ul>
            </section>

            {/* Section 4 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                4. Data Security
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                We implement industry-standard technical and organizational security
                measures to protect your information:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Encryption of data in transit (TLS 1.2+) and at rest (AES-256)</li>
                <li>Secure password hashing using bcrypt with appropriate work factors</li>
                <li>Regular security assessments and vulnerability scanning</li>
                <li>Role-based access controls and multi-factor authentication</li>
                <li>Encrypted storage of API credentials and access tokens</li>
                <li>Automated monitoring and alerting for suspicious activity</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed">
                While we employ robust security measures, no method of electronic
                transmission or storage is 100% secure. We cannot guarantee absolute
                security but will promptly notify affected users and relevant authorities
                in the event of a data breach, as required by applicable law.
              </p>
            </section>

            {/* Section 5 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                5. Your Rights and Choices
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Depending on your jurisdiction, you may have the following rights
                regarding your personal information:
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
                  of your personal data (&quot;right to be forgotten&quot;)
                </li>
                <li>
                  <strong className="text-foreground">Portability:</strong> Request a copy
                  of your data in a structured, machine-readable format
                </li>
                <li>
                  <strong className="text-foreground">Restriction:</strong> Request
                  restriction of processing of your personal data
                </li>
                <li>
                  <strong className="text-foreground">Objection:</strong> Object to
                  processing of your personal data for certain purposes
                </li>
                <li>
                  <strong className="text-foreground">Withdrawal:</strong> Withdraw consent
                  at any time where processing is based on consent
                </li>
              </ul>
              <p className="text-muted-foreground leading-relaxed">
                To exercise these rights, please contact us at{" "}
                <a
                  href="mailto:support@2bot.org"
                  className="text-purple-400 hover:text-purple-300"
                >
                  support@2bot.org
                </a>
                . We will respond to valid requests within 30 days, or as required
                by applicable law.
              </p>
            </section>

            {/* Section 6 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                6. Cookies and Tracking Technologies
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
                  for the Service to function (authentication, session management,
                  security)
                </li>
                <li>
                  <strong className="text-foreground">Preference Cookies:</strong> Remember
                  your settings and preferences (theme, language, display options)
                </li>
                <li>
                  <strong className="text-foreground">Analytics Cookies:</strong> Help us
                  understand how you use the Service to improve functionality and
                  performance
                </li>
              </ul>
              <p className="text-muted-foreground leading-relaxed">
                You can control cookie preferences through your browser settings.
                Disabling certain cookies may affect Service functionality. We do not
                use cookies for targeted advertising.
              </p>
            </section>

            {/* Section 7 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                7. Third-Party Services
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Our Service integrates with third-party services that have their own
                privacy policies. We encourage you to review them:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
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
                  features, data may be processed by third-party AI providers (e.g.,
                  OpenAI, Anthropic, Google) in accordance with their respective privacy
                  policies
                </li>
                <li>
                  <strong className="text-foreground">Messaging APIs:</strong> When
                  connecting to third-party messaging platforms, your data may be subject
                  to those platforms&apos; privacy policies
                </li>
                <li>
                  <strong className="text-foreground">Cloud Infrastructure:</strong> Our
                  Service is hosted on secure cloud infrastructure with its own data
                  processing agreements
                </li>
              </ul>
              <p className="text-muted-foreground leading-relaxed">
                We are not responsible for the privacy practices of third-party services.
                We recommend reviewing the privacy policies of any services you connect
                through our platform.
              </p>
            </section>

            {/* Section 8 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                8. Data Retention
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                We retain your information for as long as your account is active or as
                needed to provide the Service. Specific retention periods:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Account data: Retained until account deletion request is fulfilled</li>
                <li>Usage and workflow logs: Retained for 90 days</li>
                <li>Payment and billing records: Retained for 7 years (legal/tax requirement)</li>
                <li>Security and audit logs: Retained for 1 year</li>
                <li>Backups: Retained for 30 days after data deletion</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed">
                After account deletion, we will remove or anonymize your personal data
                within 30 days, except where retention is required by law or for
                legitimate business purposes documented above.
              </p>
            </section>

            {/* Section 9 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                9. Children&apos;s Privacy
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Our Service is designed for business use and is not intended for
                children under 18 years of age. We do not knowingly collect personal
                information from children under 18. If we become aware that we have
                collected personal information from a child under 18, we will take
                immediate steps to delete that information and terminate the associated
                account.
              </p>
            </section>

            {/* Section 10 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                10. International Data Transfers
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Your information may be transferred to and processed in the United
                States or other countries where our service providers operate. These
                countries may have different data protection laws than your country of
                residence. We implement appropriate safeguards — including standard
                contractual clauses and data processing agreements — to ensure your
                information remains protected in accordance with this Privacy Policy
                and applicable data protection laws.
              </p>
            </section>

            {/* Section 11 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                11. California Privacy Rights (CCPA)
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                If you are a California resident, you have additional rights under the
                California Consumer Privacy Act (CCPA), including the right to know
                what personal information we collect, the right to request deletion,
                and the right to opt out of the sale of personal information. As stated
                above, we do not sell personal information. To exercise your CCPA
                rights, contact us at{" "}
                <a
                  href="mailto:support@2bot.org"
                  className="text-purple-400 hover:text-purple-300"
                >
                  support@2bot.org
                </a>
                .
              </p>
            </section>

            {/* Section 12 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                12. Changes to This Policy
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                We may update this Privacy Policy from time to time. We will notify you
                of any changes by posting the new Privacy Policy on this page and
                updating the &quot;Last updated&quot; date.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                For material changes, we will provide additional notice via email or
                through the Service at least 30 days before the changes take effect.
                Your continued use of the Service after the updated policy becomes
                effective constitutes acceptance of the changes.
              </p>
            </section>

            {/* Section 13 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                13. Contact Us
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                If you have questions about this Privacy Policy, our data practices,
                or wish to exercise your data rights, please contact us:
              </p>
              <ul className="list-none text-muted-foreground space-y-2">
                <li>
                  <strong className="text-foreground">Company:</strong>{" "}
                  ABC Legacy LLC
                </li>
                <li>
                  <strong className="text-foreground">Address:</strong>{" "}
                  30 N Gould St Ste R, Sheridan, WY 82801, United States
                </li>
                <li>
                  <strong className="text-foreground">Email:</strong>{" "}
                  <a
                    href="mailto:support@2bot.org"
                    className="text-purple-400 hover:text-purple-300"
                  >
                    support@2bot.org
                  </a>
                </li>
                <li>
                  <strong className="text-foreground">Website:</strong>{" "}
                  <a
                    href="https://2bot.org"
                    className="text-purple-400 hover:text-purple-300"
                  >
                    https://2bot.org
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
            <span className="text-muted-foreground">&bull;</span>
            <Link
              href="/"
              className="text-muted-foreground hover:text-foreground"
            >
              Home
            </Link>
            <span className="text-muted-foreground">&bull;</span>
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
