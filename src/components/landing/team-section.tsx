import { Card, CardContent } from '@/components/ui/card';
import { Building2, Mail, MapPin } from 'lucide-react';
import { COMPANY, FOUNDER } from './content';

export function TeamSection() {
  return (
    <section id="team" className="bg-background py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-base font-semibold leading-7 text-purple-400">
            Who we are
          </h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Built by engineers, for builders
          </p>
          <p className="mt-6 text-lg leading-8 text-muted-foreground">
            {COMPANY.description}
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-4xl grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Founder card */}
          <Card className="border-border bg-card/50">
            <CardContent className="flex flex-col items-center p-8 text-center sm:flex-row sm:items-start sm:text-left">
              {/* Avatar placeholder */}
              <div className="mb-4 flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-600 to-blue-600 sm:mb-0 sm:mr-6">
                <span className="text-2xl font-bold text-white">{FOUNDER.initials}</span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">{FOUNDER.name}</h3>
                <p className="text-sm text-purple-400">{FOUNDER.role}</p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {FOUNDER.bio}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Company card */}
          <Card className="border-border bg-card/50">
            <CardContent className="flex flex-col gap-5 p-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-400/10">
                <Building2 className="h-6 w-6 text-purple-400" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">{COMPANY.name}</h3>

              <div className="space-y-3">
                <div className="flex items-start gap-3 text-sm text-muted-foreground">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>{COMPANY.address}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <a
                    href={`mailto:${COMPANY.email}`}
                    className="transition-colors hover:text-foreground"
                  >
                    {COMPANY.email}
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
