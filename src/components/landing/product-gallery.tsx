'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  BarChart3,
  GitBranch,
  Monitor,
  Store,
} from 'lucide-react';

interface GalleryItem {
  id: string;
  title: string;
  description: string;
  icon: typeof Monitor;
  color: string;
  bgColor: string;
  /** When a real screenshot is added to public/landing/, set this path */
  imagePath?: string;
}

const galleryItems: GalleryItem[] = [
  {
    id: 'workflow',
    title: 'Visual Workflow Builder',
    description:
      'Drag-and-drop node editor powered by React Flow. Build multi-step automations with triggers, AI steps, API calls, and conditional logic — all without writing code.',
    icon: GitBranch,
    color: 'text-purple-400',
    bgColor: 'bg-purple-400/10',
  },
  {
    id: 'marketplace',
    title: 'Plugin Marketplace',
    description:
      'Browse, search, and install plugins by category. Analytics, moderation, auto-replies, custom integrations — extend your bots with one click.',
    icon: Store,
    color: 'text-green-400',
    bgColor: 'bg-green-400/10',
  },
  {
    id: 'analytics',
    title: 'Analytics Dashboard',
    description:
      'Track message volume, unique users, daily trends, and top conversations. Real-time stats per bot with exportable data.',
    icon: BarChart3,
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/10',
  },
  {
    id: 'bots',
    title: 'Bot Management Studio',
    description:
      'Create and manage multiple bots from one dashboard. Each bot owns its workflows, plugins, and gateway connections. Monitor status in real-time.',
    icon: Monitor,
    color: 'text-amber-400',
    bgColor: 'bg-amber-400/10',
  },
];

export function ProductGallery() {
  const defaultItem = galleryItems[0] as GalleryItem;
  const [activeId, setActiveId] = useState(defaultItem.id);
  const active = galleryItems.find((i) => i.id === activeId) ?? defaultItem;

  return (
    <section id="product" className="bg-card py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* Section header */}
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-base font-semibold leading-7 text-purple-400">
            Inside the product
          </h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Real tools, real results
          </p>
          <p className="mt-6 text-lg leading-8 text-muted-foreground">
            Every feature you see on this page is part of the live product.
            Here&apos;s what you&apos;ll find inside.
          </p>
        </div>

        {/* Gallery layout */}
        <div className="mx-auto mt-16 max-w-5xl">
          {/* Tab buttons */}
          <div className="flex flex-wrap justify-center gap-2">
            {galleryItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === activeId;
              return (
                <Button
                  key={item.id}
                  variant={isActive ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveId(item.id)}
                  className={
                    isActive
                      ? 'bg-purple-600 hover:bg-purple-700'
                      : 'border-border text-muted-foreground'
                  }
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {item.title}
                </Button>
              );
            })}
          </div>

          {/* Active item display */}
          <Card className="mt-8 overflow-hidden border-border bg-card/50">
            {/* Screenshot area */}
            <div className="relative aspect-video w-full bg-gradient-to-br from-slate-900 to-slate-800">
              {active.imagePath ? (
                // Real screenshot — use Next.js Image when available
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={active.imagePath}
                  alt={`${active.title} screenshot`}
                  className="h-full w-full object-cover object-top"
                />
              ) : (
                // Placeholder until real screenshots are added
                <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
                  <div className={`flex h-16 w-16 items-center justify-center rounded-2xl ${active.bgColor}`}>
                    <active.icon className={`h-8 w-8 ${active.color}`} />
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-semibold text-foreground">{active.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">Screenshot coming soon</p>
                  </div>
                  {/* Decorative grid lines to suggest a product UI */}
                  <div className="absolute inset-0 opacity-5">
                    <div className="grid h-full grid-cols-12 gap-px">
                      {Array.from({ length: 12 }).map((_, i) => (
                        <div key={i} className="border-r border-white/20" />
                      ))}
                    </div>
                    <div className="absolute inset-0 grid grid-rows-8 gap-px">
                      {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="border-b border-white/20" />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Description */}
            <div className="p-6">
              <h3 className="text-lg font-semibold text-foreground">{active.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {active.description}
              </p>
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}
