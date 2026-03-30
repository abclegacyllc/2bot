import type { LucideIcon } from 'lucide-react';
import { Clock, Globe, MessageSquare, Sparkles, User } from 'lucide-react';

// ──────────────────────────────────────────────
// Interactive Demo — Step types & presets
// ──────────────────────────────────────────────

export type DemoStepType = 'message' | 'ai' | 'delay' | 'api';

export interface DemoStepDefinition {
  type: DemoStepType;
  label: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
  /** Text shown in the step node */
  nodeText: string;
  /** Simulated chat preview output */
  previewText: string;
  /** Preview sender: 'user' = right-aligned, 'bot' = left-aligned */
  previewSender: 'user' | 'bot' | 'system';
}

export const DEMO_STEP_CATALOG: Record<DemoStepType, Omit<DemoStepDefinition, 'type'>> = {
  message: {
    label: 'Add Message',
    icon: MessageSquare,
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/10',
    nodeText: 'Send Welcome Message',
    previewText: 'Hello! Welcome to our service. How can I help you today?',
    previewSender: 'bot',
  },
  ai: {
    label: 'Add AI Step',
    icon: Sparkles,
    color: 'text-purple-400',
    bgColor: 'bg-purple-400/10',
    nodeText: 'AI Intent Classification',
    previewText: 'Analyzing your request with AI... Detected intent: product inquiry.',
    previewSender: 'bot',
  },
  delay: {
    label: 'Add Delay',
    icon: Clock,
    color: 'text-amber-400',
    bgColor: 'bg-amber-400/10',
    nodeText: 'Wait 3 seconds',
    previewText: '⏳ Processing... please wait.',
    previewSender: 'system',
  },
  api: {
    label: 'Add API Call',
    icon: Globe,
    color: 'text-green-400',
    bgColor: 'bg-green-400/10',
    nodeText: 'Fetch Product Data',
    previewText: 'Retrieved product details from inventory API. 3 items found.',
    previewSender: 'bot',
  },
};

export const DEMO_STEP_ORDER: DemoStepType[] = ['message', 'ai', 'delay', 'api'];

export interface DemoPreset {
  name: string;
  steps: DemoStepType[];
}

export const DEMO_PRESET: DemoPreset = {
  name: 'Customer Support Bot',
  steps: ['message', 'ai', 'api', 'message'],
};

// ──────────────────────────────────────────────
// Navigation
// ──────────────────────────────────────────────

export interface NavLink {
  label: string;
  href: string;
}

export const NAV_LINKS: NavLink[] = [
  { label: 'Demo', href: '#demo' },
  { label: 'Features', href: '#features' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Team', href: '#team' },
  { label: 'FAQ', href: '#faq' },
];

// ──────────────────────────────────────────────
// Founder & company
// ──────────────────────────────────────────────

export const FOUNDER = {
  name: 'Alonur Komilov',
  role: 'Founder & CEO',
  initials: 'AK',
  bio: 'Full-stack engineer passionate about developer tools and automation. Built 2Bot to make backend workflow building accessible to everyone — from solo creators to enterprise teams.',
  icon: User,
} as const;

export const COMPANY = {
  name: 'ABC Legacy LLC',
  address: '30 N Gould St Ste R, Sheridan, WY 82801',
  email: 'support@2bot.org',
  description: '2Bot is built and maintained by ABC Legacy LLC, a US-based software company focused on workflow automation and messaging infrastructure.',
} as const;

// ──────────────────────────────────────────────
// Pricing audience labels
// ──────────────────────────────────────────────

export const PLAN_AUDIENCE: Record<string, string> = {
  FREE: 'Explore & test',
  STARTER: 'Side projects',
  PRO: 'Growing teams',
  BUSINESS: 'Scale operations',
};
