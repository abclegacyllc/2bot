/**
 * Terms of Service Page
 *
 * Legal terms and conditions for using the 2Bot platform.
 * Company entity: ABC Legacy LLC (Wyoming).
 *
 * @module app/terms/page
 */

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
          <nav className="flex items-center gap-1.5 text-sm">
            <Link
              href="/"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Home
            </Link>
            <span className="text-muted-foreground/50">/</span>
            <span className="text-foreground font-medium">Terms of Service</span>
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-4xl px-6 py-12">
        <div className="space-y-8">
          {/* Title */}
          <div>
            <h1 className="text-4xl font-bold text-foreground">Terms of Service</h1>
            <p className="mt-2 text-muted-foreground">
              Last updated: February 15, 2026
            </p>
          </div>

          {/* Content Sections */}
          <div className="prose prose-invert max-w-none space-y-8">
            {/* Section 1 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                1. Agreement to Terms
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                These Terms of Service (&quot;Terms&quot;) constitute a legally binding agreement
                between you (&quot;User,&quot; &quot;you,&quot; or &quot;your&quot;) and ABC Legacy LLC, a Wyoming
                limited liability company (&quot;Company,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;), operating
                the 2Bot platform (&quot;Service&quot;) accessible at 2bot.org.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                By accessing or using the Service, you agree to be bound by these Terms.
                If you do not agree to these Terms, you may not access or use the Service.
                You represent that you are at least 18 years of age or the age of majority
                in your jurisdiction and have the legal capacity to enter into this agreement.
              </p>
            </section>

            {/* Section 2 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                2. Description of Service
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                2Bot is a cloud-based software-as-a-service (SaaS) platform that provides
                no-code workflow automation and backend building tools for messaging APIs.
                The Service includes, but is not limited to:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>API gateway management and message routing</li>
                <li>AI-powered workflow automation</li>
                <li>Plugin marketplace and extensibility</li>
                <li>Analytics and monitoring dashboards</li>
                <li>Organization and team management</li>
                <li>Credit-based usage billing</li>
              </ul>
            </section>

            {/* Section 3 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                3. Account Registration and Security
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                To use certain features of the Service, you must register for an account.
                When registering, you agree to:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Provide accurate, current, and complete registration information</li>
                <li>Maintain and promptly update your account information</li>
                <li>Maintain the security and confidentiality of your login credentials</li>
                <li>Notify us immediately of any unauthorized access to your account</li>
                <li>Accept responsibility for all activities under your account</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed">
                We reserve the right to suspend or terminate accounts that violate these
                Terms or that we reasonably believe are being used fraudulently.
              </p>
            </section>

            {/* Section 4 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                4. Acceptable Use Policy
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                You agree to use the Service only for lawful business purposes and in
                compliance with all applicable laws and regulations. You may not use
                the Service to:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Send spam, unsolicited messages, or bulk communications</li>
                <li>Harass, abuse, threaten, or harm any individual or entity</li>
                <li>Distribute malware, viruses, or any harmful code</li>
                <li>Violate any applicable laws, regulations, or third-party rights</li>
                <li>Infringe on intellectual property rights of others</li>
                <li>Engage in or facilitate illegal activities</li>
                <li>Attempt to gain unauthorized access to our systems or networks</li>
                <li>Resell, sublicense, or redistribute the Service without authorization</li>
                <li>Interfere with or disrupt the integrity or performance of the Service</li>
              </ul>
            </section>

            {/* Section 5 */}
            <section id="refund-policy" className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                5. Subscription Plans and Payment Terms
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                The Service offers multiple subscription tiers (Free, Starter, Pro, and
                Business). By selecting a paid subscription plan, you agree to the following:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Pay all applicable fees as described on our pricing page at the time of purchase</li>
                <li>Provide valid and current payment information</li>
                <li>Authorize recurring charges for your subscription period (monthly or annual)</li>
                <li>Subscription fees are billed in advance on a recurring basis</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed">
                <strong className="text-foreground">AI Credits:</strong> Usage-based AI
                features are billed through a credit system. Credits are consumed based
                on actual usage (tokens processed, images generated, etc.). Credit
                allocations and pricing are described on the pricing page and may be
                updated with 30 days&apos; advance notice.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                <strong className="text-foreground">Refund Policy:</strong> Subscription
                fees are non-refundable except as required by applicable law. Unused
                credits do not carry over between billing periods unless specified in
                your plan. We reserve the right to modify pricing with at least 30
                days&apos; advance written notice.
              </p>
            </section>

            {/* Section 6 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                6. Intellectual Property
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                The Service, including its original content, features, functionality,
                and underlying technology, is owned by ABC Legacy LLC and is protected
                by United States and international copyright, trademark, patent, trade
                secret, and other intellectual property laws.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                You retain all ownership rights to the content and data you create,
                upload, or process through the Service (&quot;User Content&quot;). By using the
                Service, you grant ABC Legacy LLC a limited, non-exclusive, royalty-free
                license to process, store, and transmit your User Content solely as
                necessary to provide the Service.
              </p>
            </section>

            {/* Section 7 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                7. Third-Party Services and APIs
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                The Service integrates with third-party APIs, AI providers, and payment
                processors. Your use of these third-party services is subject to their
                respective terms of service and privacy policies. We are not responsible
                for the availability, accuracy, or content of these third-party services.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                You are solely responsible for ensuring your use of third-party APIs
                through our Service complies with the applicable third-party terms of
                service.
              </p>
            </section>

            {/* Section 8 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                8. Disclaimer of Warranties
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                THE SERVICE IS PROVIDED ON AN &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; BASIS WITHOUT
                WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING
                BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
                PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. ABC LEGACY LLC DOES
                NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, SECURE,
                OR FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS.
              </p>
            </section>

            {/* Section 9 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                9. Limitation of Liability
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL
                ABC LEGACY LLC, ITS OFFICERS, DIRECTORS, EMPLOYEES, AGENTS, OR AFFILIATES
                BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
                PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Loss of profits, data, business opportunities, or goodwill</li>
                <li>Service interruptions, downtime, or data loss</li>
                <li>Actions of third parties or third-party service disruptions</li>
                <li>Cost of procurement of substitute services</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed">
                Our total aggregate liability for all claims arising out of or relating
                to these Terms or the Service shall not exceed the total amount you paid
                to ABC Legacy LLC during the twelve (12) months immediately preceding
                the event giving rise to the claim.
              </p>
            </section>

            {/* Section 10 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                10. Indemnification
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                You agree to indemnify, defend, and hold harmless ABC Legacy LLC and its
                officers, directors, employees, agents, and affiliates from and against
                any and all claims, damages, losses, liabilities, costs, and expenses
                (including reasonable attorneys&apos; fees) arising out of or relating to:
                (a) your use of the Service; (b) your violation of these Terms; (c) your
                violation of any applicable law or regulation; or (d) your User Content.
              </p>
            </section>

            {/* Section 11 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                11. Termination
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                We may terminate or suspend your account and access to the Service
                immediately, without prior notice or liability, for any reason,
                including but not limited to:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Breach of these Terms</li>
                <li>Suspected fraudulent, abusive, or illegal activity</li>
                <li>Non-payment of applicable fees</li>
                <li>Extended period of account inactivity</li>
                <li>Request by law enforcement or government agency</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed">
                Upon termination, your right to use the Service will immediately cease.
                You may request export of your data within 30 days following termination.
                After this period, we may permanently delete your data.
              </p>
            </section>

            {/* Section 12 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                12. Governing Law and Dispute Resolution
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                These Terms shall be governed by and construed in accordance with the
                laws of the State of Wyoming, United States, without regard to its
                conflict of law provisions. Any disputes arising under or in connection
                with these Terms shall be resolved through binding arbitration in
                Sheridan County, Wyoming, in accordance with the rules of the American
                Arbitration Association.
              </p>
            </section>

            {/* Section 13 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                13. Changes to Terms
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                We reserve the right to modify these Terms at any time. We will provide
                notice of material changes by posting the updated Terms on this page and
                updating the &quot;Last updated&quot; date, and by sending email notification at
                least 30 days before changes take effect.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Your continued use of the Service after the updated Terms become effective
                constitutes your acceptance of the revised Terms. If you do not agree to
                the revised Terms, you must discontinue use of the Service.
              </p>
            </section>

            {/* Section 14 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                14. Severability
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                If any provision of these Terms is held to be invalid, illegal, or
                unenforceable, the remaining provisions shall continue in full force
                and effect. The invalid or unenforceable provision shall be modified
                to the minimum extent necessary to make it valid and enforceable.
              </p>
            </section>

            {/* Section 15 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                15. Contact Information
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                If you have any questions about these Terms of Service, please contact us:
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
              href="/privacy"
              className="text-purple-400 hover:text-purple-300"
            >
              Privacy Policy
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
