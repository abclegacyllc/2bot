import { Card, CardContent } from '@/components/ui/card';
import { Building2, Mail, MapPin } from 'lucide-react';
import { COMPANY, TEAM, TEAM_NOTE } from './content';

export function TeamSection() {
  return (
    <section id="team" className="bg-background py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-base font-semibold leading-7 text-purple-400">
            Who we are
          </h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Built by an engineer, for builders
          </p>
          <p className="mt-6 text-lg leading-8 text-muted-foreground">
            {COMPANY.description}
          </p>
        </div>

        {/* People, founder first.  The company/address block used to sit in
            this grid as the second cell; it now lives below the closing line,
            so the two cells here are the two people and the row stays even. */}
        <div className="mx-auto mt-16 grid max-w-4xl grid-cols-1 gap-8 lg:grid-cols-2">
          {TEAM.map((person) => (
            <Card key={person.name} className="border-border bg-card/50">
              <CardContent className="flex h-full flex-col items-center p-8 text-center sm:flex-row sm:items-start sm:text-left">
                <div className="mb-4 flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-600 to-blue-600 sm:mb-0 sm:mr-6">
                  <span className="text-2xl font-bold text-white">{person.initials}</span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">{person.name}</h3>
                  <p className="text-sm text-purple-400">{person.role}</p>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    {person.bio}
                  </p>
                  <a
                    href={person.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-block text-sm text-purple-400 transition-colors hover:text-foreground"
                  >
                    LinkedIn
                  </a>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Sits closer to the people it describes than to the address block. */}
        <p className="mx-auto mt-8 max-w-4xl text-center text-sm text-muted-foreground">
          {TEAM_NOTE}
        </p>

        <div className="mx-auto mt-12 max-w-4xl">
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
