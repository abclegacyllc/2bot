import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { getAllPlansForDisplay } from "@/shared/constants/plans";
import { Check } from "lucide-react";
import { serviceUrl } from "@/shared/config/urls";
import { PLAN_AUDIENCE } from './content';

const plans = getAllPlansForDisplay().filter(p => p.id !== 'ENTERPRISE');

export function PricingSection() {
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
            Start free and scale as you grow. All paid plans include a 14-day free
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
              {plan.popular ? <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-purple-600 px-3 py-1 text-xs font-semibold text-foreground">
                    Most Popular
                  </span>
                </div> : null}
              <CardHeader className="text-center">
                <CardTitle className="text-foreground">{plan.name}</CardTitle>
                {PLAN_AUDIENCE[plan.id] ? (
                  <p className="text-xs font-medium text-purple-400">{PLAN_AUDIENCE[plan.id]}</p>
                ) : null}
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
                <Button
                  className={`w-full ${
                    plan.popular
                      ? "bg-purple-600 hover:bg-purple-700"
                      : "bg-muted hover:bg-muted/80"
                  }`}
                  asChild
                >
                  <a href={serviceUrl('dashboard', plan.href)}>
                    {plan.cta}
                  </a>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
        {/* Credit model explainer */}
        <div className="mx-auto mt-12 max-w-3xl text-center">
          <p className="text-sm leading-relaxed text-muted-foreground">
            2Bot is a B2B SaaS platform. Each plan includes a dedicated workspace,
            monthly API credits, and access to the plugin marketplace. Credits are
            consumed by AI steps, API calls, and gateway operations.
          </p>
        </div>      </div>
    </section>
  );
}
