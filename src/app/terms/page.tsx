/**
 * Terms of Service Page
 *
 * Legal terms and conditions for using the 2Bot platform.
 *
 * @module app/terms/page
 */

import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | 2Bot",
  description: "Terms of Service and conditions for using the 2Bot platform.",
};

export default function TermsOfServicePage() {
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
            <h1 className="text-4xl font-bold text-foreground">Terms of Service</h1>
            <p className="mt-2 text-muted-foreground">
              Last updated: January 18, 2026
            </p>
          </div>

          {/* Content Sections */}
          <div className="prose prose-invert max-w-none space-y-8">
            {/* Section 1 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                1. Acceptance of Terms
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                By accessing or using the 2Bot platform (&quot;Service&quot;), you agree to be
                bound by these Terms of Service (&quot;Terms&quot;). If you disagree with any
                part of these terms, you may not access the Service.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                These Terms apply to all visitors, users, and others who access or use
                the Service. By using the Service, you represent that you are at least
                18 years of age or the age of majority in your jurisdiction.
              </p>
            </section>

            {/* Section 2 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                2. Description of Service
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                2Bot is a SaaS platform that enables users to automate Telegram bots
                with AI capabilities. The Service includes:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Telegram bot integration and management</li>
                <li>AI-powered automation plugins</li>
                <li>Message routing and processing</li>
                <li>Analytics and monitoring tools</li>
                <li>API access for custom integrations</li>
              </ul>
            </section>

            {/* Section 3 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                3. User Responsibilities
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                As a user of the Service, you agree to:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Provide accurate and complete registration information</li>
                <li>Maintain the security of your account credentials</li>
                <li>Notify us immediately of any unauthorized access</li>
                <li>Comply with all applicable laws and regulations</li>
                <li>Use the Service only for lawful purposes</li>
                <li>Respect the rights of other users and third parties</li>
              </ul>
            </section>

            {/* Section 4 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                4. Prohibited Uses
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                You may not use the Service to:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Send spam, unsolicited messages, or bulk communications</li>
                <li>Harass, abuse, or harm other users or individuals</li>
                <li>Distribute malware, viruses, or harmful code</li>
                <li>Violate Telegram&apos;s Terms of Service or API policies</li>
                <li>Infringe on intellectual property rights</li>
                <li>Engage in illegal activities or promote violence</li>
                <li>Attempt to gain unauthorized access to systems</li>
                <li>Resell or redistribute the Service without authorization</li>
              </ul>
            </section>

            {/* Section 5 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                5. Payment Terms
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Certain features of the Service require payment. By selecting a paid
                plan, you agree to:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Pay all applicable fees as described at the time of purchase</li>
                <li>Provide valid payment information</li>
                <li>Authorize recurring charges for subscription plans</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed">
                All fees are non-refundable except as required by law or as explicitly
                stated in our refund policy. We reserve the right to change pricing
                with 30 days advance notice.
              </p>
            </section>

            {/* Section 6 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                6. Intellectual Property
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                The Service and its original content, features, and functionality are
                owned by 2Bot and are protected by international copyright, trademark,
                and other intellectual property laws.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                You retain ownership of any content you create using the Service.
                By using the Service, you grant us a limited license to process and
                store your content as necessary to provide the Service.
              </p>
            </section>

            {/* Section 7 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                7. Limitation of Liability
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                To the maximum extent permitted by law, 2Bot shall not be liable for
                any indirect, incidental, special, consequential, or punitive damages,
                including but not limited to:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Loss of profits, data, or business opportunities</li>
                <li>Service interruptions or downtime</li>
                <li>Actions of third parties using the Service</li>
                <li>Telegram platform changes or outages</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed">
                Our total liability shall not exceed the amount you paid for the
                Service in the twelve (12) months preceding the claim.
              </p>
            </section>

            {/* Section 8 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                8. Termination
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                We may terminate or suspend your account immediately, without prior
                notice, for any reason, including but not limited to:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Violation of these Terms</li>
                <li>Suspected fraudulent or illegal activity</li>
                <li>Non-payment of fees</li>
                <li>Extended inactivity</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed">
                Upon termination, your right to use the Service will immediately cease.
                You may export your data within 30 days of termination notice.
              </p>
            </section>

            {/* Section 9 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                9. Changes to Terms
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                We reserve the right to modify these Terms at any time. We will notify
                users of material changes via email or through the Service at least 30
                days before they take effect.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Your continued use of the Service after changes become effective
                constitutes acceptance of the revised Terms.
              </p>
            </section>

            {/* Section 10 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                10. Contact Information
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                If you have any questions about these Terms, please contact us:
              </p>
              <ul className="list-none text-muted-foreground space-y-2">
                <li>
                  <strong className="text-foreground">Email:</strong>{" "}
                  <a
                    href="mailto:legal@2bot.ai"
                    className="text-purple-400 hover:text-purple-300"
                  >
                    legal@2bot.ai
                  </a>
                </li>
                <li>
                  <strong className="text-foreground">Support:</strong>{" "}
                  <a
                    href="mailto:support@2bot.ai"
                    className="text-purple-400 hover:text-purple-300"
                  >
                    support@2bot.ai
                  </a>
                </li>
              </ul>
            </section>
          </div>

          {/* Footer Links */}
          <div className="border-t border-border pt-8 flex flex-wrap gap-4 text-sm">
            <Link
              href="/privacy"
              className="text-purple-400 hover:text-purple-300"
            >
              Privacy Policy
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
