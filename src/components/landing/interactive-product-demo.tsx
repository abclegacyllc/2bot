'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Bot, RotateCcw, Zap } from 'lucide-react';
import {
  DEMO_STEP_CATALOG,
  DEMO_STEP_ORDER,
  DEMO_PRESET,
  type DemoStepType,
  type DemoStepDefinition,
} from './content';

interface WorkflowStep extends DemoStepDefinition {
  id: number;
  type: DemoStepType;
}

export function InteractiveProductDemo() {
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const previewEndRef = useRef<HTMLDivElement>(null);
  const nextIdRef = useRef(1);

  function createStep(type: DemoStepType): WorkflowStep {
    const def = DEMO_STEP_CATALOG[type];
    return { id: nextIdRef.current++, type, ...def };
  }

  // Auto-scroll chat preview to bottom when steps change
  useEffect(() => {
    previewEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [steps]);

  const addStep = useCallback((type: DemoStepType) => {
    setSteps((prev) => [...prev, createStep(type)]);
  }, []);

  const loadPreset = useCallback(() => {
    nextIdRef.current = 1;
    setSteps(DEMO_PRESET.steps.map((type) => createStep(type)));
  }, []);

  const reset = useCallback(() => {
    nextIdRef.current = 1;
    setSteps([]);
  }, []);

  return (
    <section id="demo" className="bg-gradient-to-b from-slate-950 to-background py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* Section header */}
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-base font-semibold leading-7 text-purple-400">
            See it in action
          </h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Build workflows visually
          </p>
          <p className="mt-6 text-lg leading-8 text-muted-foreground">
            Add steps to your workflow and watch the live preview update in real-time.
            This is how 2Bot works — no code required.
          </p>
        </div>

        {/* Two-panel demo */}
        <div className="mx-auto mt-16 grid max-w-5xl grid-cols-1 gap-6 lg:grid-cols-2">
          {/* ── Left panel: Workflow Builder ── */}
          <Card className="border-border bg-card/50 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Workflow Builder</h3>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadPreset}
                  className="text-xs"
                >
                  <Zap className="mr-1 h-3 w-3" />
                  Load Preset
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={reset}
                  className="text-xs text-muted-foreground"
                >
                  <RotateCcw className="mr-1 h-3 w-3" />
                  Reset
                </Button>
              </div>
            </div>

            {/* Action buttons */}
            <div className="mb-6 grid grid-cols-2 gap-2">
              {DEMO_STEP_ORDER.map((type) => {
                const def = DEMO_STEP_CATALOG[type];
                const Icon = def.icon;
                return (
                  <Button
                    key={type}
                    variant="outline"
                    size="sm"
                    onClick={() => addStep(type)}
                    className="justify-start gap-2 border-border text-sm"
                  >
                    <Icon className={`h-4 w-4 ${def.color}`} />
                    {def.label}
                  </Button>
                );
              })}
            </div>

            {/* Step list */}
            <div className="min-h-[200px] space-y-0">
              {steps.length === 0 && (
                <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
                  Click a button above to add workflow steps
                </div>
              )}
              {steps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <div key={step.id} className="relative">
                    {/* Connector line */}
                    {index > 0 && (
                      <div className="mx-auto h-4 w-px bg-border" />
                    )}
                    {/* Step node */}
                    <div className="flex items-center gap-3 rounded-lg border border-border bg-background/50 px-4 py-3">
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${step.bgColor}`}>
                        <Icon className={`h-4 w-4 ${step.color}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">{step.nodeText}</p>
                        <p className="truncate text-xs text-muted-foreground">Step {index + 1}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* ── Right panel: Chat Preview ── */}
          <Card className="border-border bg-card/50 p-6">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-600">
                <Bot className="h-4 w-4 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Live Preview</h3>
                <p className="text-xs text-muted-foreground">Chat simulation</p>
              </div>
            </div>

            {/* Chat messages */}
            <div className="min-h-[280px] max-h-[400px] space-y-3 overflow-y-auto rounded-lg border border-border bg-background/30 p-4">
              {steps.length === 0 && (
                <div className="flex min-h-[240px] items-center justify-center text-sm text-muted-foreground">
                  Workflow preview will appear here
                </div>
              )}

              {/* Incoming user message (always shown if steps exist) */}
              {steps.length > 0 && (
                <div className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-br-md bg-purple-600 px-4 py-2 text-sm text-white">
                    Hi, I need help with my order
                  </div>
                </div>
              )}

              {steps.map((step) => {
                if (step.previewSender === 'system') {
                  return (
                    <div key={step.id} className="flex justify-center">
                      <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                        {step.previewText}
                      </span>
                    </div>
                  );
                }

                const isBot = step.previewSender === 'bot';
                return (
                  <div
                    key={step.id}
                    className={`flex ${isBot ? 'justify-start' : 'justify-end'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                        isBot
                          ? 'rounded-bl-md bg-muted text-foreground'
                          : 'rounded-br-md bg-purple-600 text-white'
                      }`}
                    >
                      {step.previewText}
                    </div>
                  </div>
                );
              })}

              <div ref={previewEndRef} />
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}
