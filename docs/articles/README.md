# Knowledge Base Articles

This directory contains KB articles for the 2Bot support system.
Admins can import these into the platform via the admin panel or the seed script.

## Structure

Each article is a markdown file with YAML frontmatter:

```yaml
---
slug: article-slug
title: Article Title
excerpt: Short description
category: getting_started | gateways | plugins | billing | troubleshooting
tags: [tag1, tag2]
---
```

## Categories

| Category | Description |
|----------|-------------|
| `getting_started` | Onboarding and basics |
| `gateways` | Gateway setup and management |
| `plugins` | Plugin installation and usage |
| `billing` | Credits, plans, and payments |
| `troubleshooting` | Common issues and fixes |

## How to add articles

1. Create a new `.md` file in this directory
2. Add the frontmatter (slug, title, excerpt, category, tags)
3. Write the article content in Markdown
4. Run `npx tsx scripts/seed-support.ts` to import into the database
   — OR use the Admin Panel → Knowledge Base → Create Article

## Quick Issues

Quick issue templates are defined in `quick-issues.json` in this directory.
These are pre-built shortcuts shown to users in the support widget.
