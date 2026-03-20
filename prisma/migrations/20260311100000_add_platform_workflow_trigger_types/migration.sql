-- Add new platform-specific workflow trigger types
-- Extends WorkflowTriggerType enum with Discord, Slack, and WhatsApp triggers

-- PostgreSQL: add new enum values to existing type
ALTER TYPE "WorkflowTriggerType" ADD VALUE IF NOT EXISTS 'DISCORD_MESSAGE';
ALTER TYPE "WorkflowTriggerType" ADD VALUE IF NOT EXISTS 'DISCORD_COMMAND';
ALTER TYPE "WorkflowTriggerType" ADD VALUE IF NOT EXISTS 'SLACK_MESSAGE';
ALTER TYPE "WorkflowTriggerType" ADD VALUE IF NOT EXISTS 'SLACK_COMMAND';
ALTER TYPE "WorkflowTriggerType" ADD VALUE IF NOT EXISTS 'WHATSAPP_MESSAGE';
