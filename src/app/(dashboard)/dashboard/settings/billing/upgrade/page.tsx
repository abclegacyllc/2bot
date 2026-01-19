"use client";

/**
 * Plan Upgrade Page
 *
 * Displays available subscription plans and allows users to upgrade.
 *
 * @module app/dashboard/settings/billing/upgrade/page
 */

import { ProtectedRoute } from "@/components/auth/protected-route";
import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
    ArrowLeft,
    Building,
    Check,
    Loader2,
    Star,
    Zap,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

interface Plan {
  id: string;
  name: string;
  price: number;
  description: string;
  popular?: boolean;
  icon: React.ElementType;
  features: string[];
}

const PLANS: Plan[] = [
  {
    id: "STARTER",
    name: "Starter",
    price: 9,
    description: "For solo creators",
    icon: Zap,
    features: [
      "3 gateways",
      "10 plugins",
      "1,000 executions/day",
      "512MB RAM",
      "Email support",
    ],
  },
  {
    id: "PRO",
    name: "Pro",
    price: 29,
    description: "For power users",
    popular: true,
    icon: Star,
    features: [
      "10 gateways",
      "Unlimited plugins",
      "10,000 executions/day",
      "1GB RAM",
      "Priority support",
    ],
  },
  {
    id: "BUSINESS",
    name: "Business",
    price: 79,
    description: "For small teams",
    icon: Building,
    features: [
      "25 gateways",
      "Unlimited plugins",
      "50,000 executions/day",
      "2GB RAM",
      "Dedicated support",
      "Team features",
    ],
  },
];

function PlanCard({
  plan,
  current,
  onSelect,
  loading,
}: {
  plan: Plan;
  current: boolean;
  onSelect: () => void;
  loading: boolean;
}) {
  const Icon = plan.icon;

  return (
    <Card
      className={cn(
        "relative border-border bg-card/50 transition-all duration-200",
        plan.popular &&
          "border-purple-500 shadow-lg shadow-purple-500/20 scale-105 z-10",
        current && "bg-muted/50"
      )}
    >
      {plan.popular && (
        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
          <Badge className="bg-purple-600 text-foreground">Most Popular</Badge>
        </div>
      )}

      <CardHeader className="text-center pt-8">
        <div
          className={cn(
            "mx-auto mb-4 h-12 w-12 rounded-full flex items-center justify-center",
            plan.popular
              ? "bg-purple-600/20 text-purple-400"
              : "bg-muted text-muted-foreground"
          )}
        >
          <Icon className="h-6 w-6" />
        </div>
        <CardTitle className="text-foreground text-xl">{plan.name}</CardTitle>
        <CardDescription className="text-muted-foreground">
          {plan.description}
        </CardDescription>
        <div className="mt-4">
          <span className="text-4xl font-bold text-foreground">${plan.price}</span>
          <span className="text-muted-foreground">/month</span>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        <ul className="space-y-3">
          {plan.features.map((feature) => (
            <li
              key={feature}
              className="flex items-center gap-3 text-sm text-foreground"
            >
              <Check
                className={cn(
                  "h-4 w-4 flex-shrink-0",
                  plan.popular ? "text-purple-400" : "text-green-500"
                )}
              />
              {feature}
            </li>
          ))}
        </ul>
      </CardContent>

      <CardFooter className="pt-4">
        <Button
          className={cn(
            "w-full",
            plan.popular
              ? "bg-purple-600 hover:bg-purple-700"
              : current
                ? "bg-muted cursor-not-allowed"
                : "bg-muted hover:bg-muted"
          )}
          variant={current ? "outline" : "default"}
          disabled={current || loading}
          onClick={onSelect}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : current ? (
            "Current Plan"
          ) : (
            "Select Plan"
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}

function UpgradeContent() {
  const { context, isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  const currentPlan = context.plan || "FREE";

  const handleUpgrade = async (planId: string) => {
    setSelectedPlan(planId);
    setLoading(true);

    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ plan: planId }),
      });

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        console.error("No checkout URL returned");
        setLoading(false);
        setSelectedPlan(null);
      }
    } catch (error) {
      console.error("Failed to create checkout session:", error);
      setLoading(false);
      setSelectedPlan(null);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link href="/dashboard/settings/billing">
            <Button
              variant="outline"
              className="border-border text-foreground hover:bg-muted"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Billing
            </Button>
          </Link>
        </div>

        {/* Title */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-foreground">Choose Your Plan</h1>
          <p className="text-muted-foreground mt-2">
            {context.type === "organization"
              ? `Upgrade ${context.organizationName}`
              : "Upgrade your personal workspace"}
          </p>
          {currentPlan !== "FREE" && (
            <Badge
              variant="outline"
              className="mt-4 border-border text-muted-foreground"
            >
              Current: {currentPlan}
            </Badge>
          )}
        </div>

        {/* Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start pt-6">
          {PLANS.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              current={currentPlan === plan.id}
              onSelect={() => handleUpgrade(plan.id)}
              loading={loading && selectedPlan === plan.id}
            />
          ))}
        </div>

        {/* Free Plan Info */}
        <div className="text-center text-muted-foreground text-sm">
          <p>
            Currently on the{" "}
            <span className="text-foreground font-medium">Free</span> plan?
          </p>
          <p className="mt-1">
            Free plan includes: 1 gateway, 5 plugins, 100 executions/day, 256MB
            RAM
          </p>
        </div>

        {/* FAQ or Additional Info */}
        <Card className="border-border bg-card/50">
          <CardHeader>
            <CardTitle className="text-foreground text-lg">
              Need more customization?
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground">
            <p>
              For enterprise needs with custom limits, dedicated infrastructure,
              or special requirements, please{" "}
              <a
                href="mailto:enterprise@2bot.ai"
                className="text-purple-400 hover:text-purple-300 underline"
              >
                contact our sales team
              </a>
              .
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function UpgradePage() {
  return (
    <ProtectedRoute>
      <UpgradeContent />
    </ProtectedRoute>
  );
}
