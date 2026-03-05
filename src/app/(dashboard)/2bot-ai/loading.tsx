/**
 * 2Bot AI Page Loading State
 *
 * @module app/(dashboard)/2bot-ai/loading
 */

import { Card, CardContent } from "@/components/ui/card";

export default function TwoBotAILoading() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="animate-pulse space-y-2">
          <div className="h-8 w-32 bg-muted rounded" />
          <div className="h-4 w-48 bg-muted rounded" />
        </div>
        <div className="animate-pulse flex items-center gap-3">
          <div className="h-6 w-20 bg-muted rounded" />
          <div className="h-6 w-24 bg-muted rounded" />
        </div>
      </div>

      {/* Chat skeleton */}
      <Card className="border-border bg-card/50">
        <CardContent className="p-0">
          <div className="h-[calc(100vh-14rem)] flex flex-col">
            {/* Messages area skeleton */}
            <div className="flex-1 p-6 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse flex gap-3">
                  <div className="h-8 w-8 bg-muted rounded-full flex-shrink-0" />
                  <div className="space-y-2 flex-1">
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-4 bg-muted rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
            {/* Input area skeleton */}
            <div className="border-t p-4 animate-pulse">
              <div className="h-10 bg-muted rounded" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
