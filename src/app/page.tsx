import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
    ArrowRight,
    Bot,
    Check,
    LineChart,
    MessageSquare,
    Plug,
    Rocket,
    Shield,
    Sparkles
} from "lucide-react";
import Link from "next/link";

/**
 * Landing Page
 *
 * Public marketing page with hero, features, pricing, and footer.
 * Showcases the platform's value proposition.
 *
 * @module app/page
 */

// ===========================================
// Hero Section
// ===========================================

function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pt-20 pb-32">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-purple-600/20 blur-3xl" />
        <div className="absolute top-60 -left-40 h-80 w-80 rounded-full bg-blue-600/20 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          {/* Badge */}
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-500/10 px-4 py-2 text-sm text-purple-300">
            <Sparkles className="h-4 w-4" />
            <span>AI-Powered Telegram Automation</span>
          </div>

          {/* Headline */}
          <h1 className="text-5xl font-bold tracking-tight text-foreground sm:text-6xl lg:text-7xl">
            Automate Your{" "}
            <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              Telegram
            </span>{" "}
            with AI
          </h1>

          {/* Subheadline */}
          <p className="mt-6 text-lg leading-8 text-muted-foreground sm:text-xl">
            Build powerful Telegram bots with AI capabilities. Connect plugins,
            automate workflows, and scale your communication — all without
            writing code.
          </p>

          {/* CTA Buttons */}
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/register">
              <Button
                size="lg"
                className="h-12 bg-purple-600 px-8 text-base hover:bg-purple-700"
              >
                Get Started Free
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="#pricing">
              <Button
                size="lg"
                variant="outline"
                className="h-12 border-border px-8 text-base text-foreground hover:bg-muted"
              >
                View Pricing
              </Button>
            </Link>
          </div>

          {/* Trust indicators */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-500" />
              <span>No credit card required</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-500" />
              <span>Free tier forever</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-500" />
              <span>Setup in 5 minutes</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ===========================================
// Features Section
// ===========================================

const features = [
  {
    name: "Telegram Bot Integration",
    description:
      "Connect your Telegram bots instantly. Manage multiple bots from one dashboard with real-time status monitoring.",
    icon: Bot,
    color: "text-blue-400",
    bgColor: "bg-blue-400/10",
  },
  {
    name: "AI-Powered Automation",
    description:
      "Leverage OpenAI, Claude, and other AI providers to create intelligent responses and automate conversations.",
    icon: Sparkles,
    color: "text-purple-400",
    bgColor: "bg-purple-400/10",
  },
  {
    name: "Plugin Marketplace",
    description:
      "Extend functionality with plugins. Analytics, moderation, auto-replies, and more — install with one click.",
    icon: Plug,
    color: "text-green-400",
    bgColor: "bg-green-400/10",
  },
  {
    name: "Analytics & Insights",
    description:
      "Track message volume, user engagement, and bot performance with detailed analytics dashboards.",
    icon: LineChart,
    color: "text-amber-400",
    bgColor: "bg-amber-400/10",
  },
  {
    name: "Enterprise Security",
    description:
      "End-to-end encryption, role-based access control, and SOC 2 compliant infrastructure.",
    icon: Shield,
    color: "text-red-400",
    bgColor: "bg-red-400/10",
  },
  {
    name: "Simple Setup",
    description:
      "No coding required. Connect your bot token, install plugins, and you're ready to go in minutes.",
    icon: Rocket,
    color: "text-cyan-400",
    bgColor: "bg-cyan-400/10",
  },
];

function FeaturesSection() {
  return (
    <section className="bg-background py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-base font-semibold leading-7 text-purple-400">
            Everything you need
          </h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Powerful features for modern automation
          </p>
          <p className="mt-6 text-lg leading-8 text-muted-foreground">
            Build, deploy, and scale your Telegram bots with our comprehensive
            platform designed for both beginners and power users.
          </p>
        </div>

        <div className="mx-auto mt-16 max-w-5xl">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <Card
                key={feature.name}
                className="border-border bg-card/50 transition-colors hover:bg-muted/50"
              >
                <CardHeader>
                  <div
                    className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg ${feature.bgColor}`}
                  >
                    <feature.icon className={`h-6 w-6 ${feature.color}`} />
                  </div>
                  <CardTitle className="text-foreground">{feature.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ===========================================
// Pricing Section
// ===========================================

const plans = [
  {
    name: "Free",
    price: 0,
    description: "Perfect for trying out the platform",
    features: [
      "1 Telegram bot",
      "3 plugins",
      "100 executions/day",
      "Community support",
    ],
    cta: "Get Started",
    href: "/register",
    popular: false,
  },
  {
    name: "Starter",
    price: 9,
    description: "For individuals getting started",
    features: [
      "3 Telegram bots",
      "10 plugins",
      "1,000 executions/day",
      "Email support",
      "Basic analytics",
    ],
    cta: "Start Free Trial",
    href: "/register",
    popular: false,
  },
  {
    name: "Pro",
    price: 29,
    description: "For professionals and small teams",
    features: [
      "10 Telegram bots",
      "Unlimited plugins",
      "10,000 executions/day",
      "Priority support",
      "Advanced analytics",
      "AI provider integration",
    ],
    cta: "Start Free Trial",
    href: "/register",
    popular: true,
  },
  {
    name: "Business",
    price: 79,
    description: "For growing businesses",
    features: [
      "25 Telegram bots",
      "Unlimited plugins",
      "50,000 executions/day",
      "Dedicated support",
      "Custom integrations",
      "Team collaboration",
      "SSO & advanced security",
    ],
    cta: "Contact Sales",
    href: "/register",
    popular: false,
  },
];

function PricingSection() {
  return (
    <section id="pricing" className="bg-card py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-base font-semibold leading-7 text-purple-400">
            Pricing
          </h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Choose the right plan for you
          </p>
          <p className="mt-6 text-lg leading-8 text-muted-foreground">
            Start free and scale as you grow. All plans include a 14-day free
            trial.
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-6xl grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => (
            <Card
              key={plan.name}
              className={`relative flex flex-col border-border bg-card/50 ${
                plan.popular
                  ? "border-purple-500 shadow-lg shadow-purple-500/20 scale-105 z-10"
                  : ""
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-purple-600 px-3 py-1 text-xs font-semibold text-foreground">
                    Most Popular
                  </span>
                </div>
              )}
              <CardHeader className="text-center">
                <CardTitle className="text-foreground">{plan.name}</CardTitle>
                <CardDescription className="text-muted-foreground">
                  {plan.description}
                </CardDescription>
                <div className="mt-4">
                  <span className="text-4xl font-bold text-foreground">
                    ${plan.price}
                  </span>
                  <span className="text-muted-foreground">/month</span>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-3">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-3 text-sm text-foreground"
                    >
                      <Check className="h-5 w-5 flex-shrink-0 text-green-500" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Link href={plan.href} className="w-full">
                  <Button
                    className={`w-full ${
                      plan.popular
                        ? "bg-purple-600 hover:bg-purple-700"
                        : "bg-muted hover:bg-muted"
                    }`}
                  >
                    {plan.cta}
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

// ===========================================
// CTA Section
// ===========================================

function CTASection() {
  return (
    <section className="bg-background py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-purple-900 to-blue-900 px-6 py-20 sm:px-12 sm:py-28">
          {/* Background decoration */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute -top-20 -right-20 h-60 w-60 rounded-full bg-purple-500/30 blur-3xl" />
            <div className="absolute -bottom-20 -left-20 h-60 w-60 rounded-full bg-blue-500/30 blur-3xl" />
          </div>

          <div className="relative mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Ready to automate your Telegram?
            </h2>
            <p className="mt-6 text-lg leading-8 text-foreground">
              Join thousands of users who are already using 2Bot to power their
              Telegram automation. Get started in minutes.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/register">
                <Button
                  size="lg"
                  className="h-12 bg-white px-8 text-base text-foreground hover:bg-accent"
                >
                  Start Free Today
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="/login">
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 border-white/30 px-8 text-base text-foreground hover:bg-white/10"
                >
                  Sign In
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ===========================================
// Footer Section
// ===========================================

function Footer() {
  return (
    <footer className="border-t border-border bg-background py-12">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          {/* Logo and tagline */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-600">
              <MessageSquare className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <span className="text-lg font-bold text-foreground">2Bot</span>
              <p className="text-xs text-muted-foreground">AI-Powered Telegram Automation</p>
            </div>
          </div>

          {/* Links */}
          <nav className="flex flex-wrap items-center justify-center gap-6 text-sm">
            <Link
              href="/terms"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Terms of Service
            </Link>
            <Link
              href="/privacy"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Privacy Policy
            </Link>
            <a
              href="mailto:support@2bot.org"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Contact
            </a>
          </nav>

          {/* Copyright */}
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} 2Bot. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

// ===========================================
// Main Page
// ===========================================

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <HeroSection />
      <FeaturesSection />
      <PricingSection />
      <CTASection />
      <Footer />
    </div>
  );
}
