import { Button } from "@/components/ui/button";
import { serviceUrl } from "@/shared/config/urls";
import { ArrowRight } from "lucide-react";

const dashboardLoginUrl = serviceUrl('dashboard', '/login');
const dashboardRegisterUrl = serviceUrl('dashboard', '/register');

export function CTASection() {
  return (
    <section id="cta" className="bg-background py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-purple-900 to-blue-900 px-6 py-20 sm:px-12 sm:py-28">
          {/* Background decoration */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute -top-20 -right-20 h-60 w-60 rounded-full bg-purple-500/30 blur-3xl" />
            <div className="absolute -bottom-20 -left-20 h-60 w-60 rounded-full bg-blue-500/30 blur-3xl" />
          </div>

          <div className="relative mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Ready to automate your workflows?
            </h2>
            <p className="mt-6 text-lg leading-8 text-foreground">
              Join businesses already using 2Bot to power their backend
              automation. Get started in minutes.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button
                size="lg"
                className="h-12 bg-white px-8 text-base text-slate-900 hover:bg-slate-100"
                asChild
              >
                <a href={dashboardRegisterUrl}>
                  Start Free Today
                  <ArrowRight className="ml-2 h-5 w-5" />
                </a>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-12 border-white/30 px-8 text-base text-foreground hover:bg-white/10"
                asChild
              >
                <a href={dashboardLoginUrl}>Sign In</a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
