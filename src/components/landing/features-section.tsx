import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Globe,
  LineChart,
  Plug,
  Rocket,
  Shield,
  Sparkles,
} from "lucide-react";

const features = [
  {
    name: "Messaging API Gateway",
    description:
      "Connect to messaging APIs instantly. Manage multiple channels from one dashboard with real-time monitoring and routing.",
    icon: Globe,
    color: "text-blue-400",
    bgColor: "bg-blue-400/10",
  },
  {
    name: "AI-Powered Automation",
    description:
      "Leverage OpenAI, Claude, and 100+ AI models to create intelligent workflows and automate backend processes.",
    icon: Sparkles,
    color: "text-purple-400",
    bgColor: "bg-purple-400/10",
  },
  {
    name: "Plugin Marketplace",
    description:
      "Extend functionality with plugins. Analytics, moderation, auto-responses, and more — install with one click.",
    icon: Plug,
    color: "text-green-400",
    bgColor: "bg-green-400/10",
  },
  {
    name: "Analytics & Insights",
    description:
      "Track message volume, user engagement, and workflow performance with detailed analytics dashboards.",
    icon: LineChart,
    color: "text-amber-400",
    bgColor: "bg-amber-400/10",
  },
  {
    name: "Enterprise Security",
    description:
      "End-to-end encryption, role-based access control, and enterprise-grade security infrastructure for your business.",
    icon: Shield,
    color: "text-red-400",
    bgColor: "bg-red-400/10",
  },
  {
    name: "Simple Setup",
    description:
      "No coding required. Connect your API credentials, install plugins, and you're ready to go in minutes.",
    icon: Rocket,
    color: "text-cyan-400",
    bgColor: "bg-cyan-400/10",
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="bg-background py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-base font-semibold leading-7 text-purple-400">
            Everything you need
          </h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Powerful features for modern automation
          </p>
          <p className="mt-6 text-lg leading-8 text-muted-foreground">
            Build, deploy, and scale your backend workflows with our comprehensive
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
