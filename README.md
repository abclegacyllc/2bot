# 2Bot Platform

AI-powered chatbot platform with multi-gateway support, organization management, and enterprise features.

## Quick Start (Development)

### Prerequisites
- Node.js 18+ (LTS recommended)
- Docker & Docker Compose
- pnpm (recommended) or npm

### Setup

1. **Clone and install dependencies:**
```bash
git clone https://github.com/your-org/2bot.git
cd 2bot
pnpm install
```

2. **Configure environment:**
```bash
# Copy the development environment template
cp .env.development.example .env.development.local

# Edit with your values (especially Stripe test keys)
nano .env.development.local
```

3. **Start services:**
```bash
# Start database and Redis
make docker-up

# Run database migrations
pnpm prisma migrate dev

# Seed development data (optional)
pnpm prisma db seed
```

4. **Start development servers:**
```bash
# Option 1: Using Makefile (recommended)
make dev

# Option 2: Manual
pnpm dev          # Next.js frontend on :3000
pnpm dev:api      # Express API on :3001
```

5. **Open in browser:**
- Frontend: http://localhost:3000
- API: http://localhost:3001/api

### Environment Files

| File | Purpose | Committed |
|------|---------|-----------|
| `.env.development.example` | Full dev config template | ✅ Yes |
| `.env.production.example` | Production template | ✅ Yes |
| `.env.development.local` | Your local dev config | ❌ No |
| `.env.production` | Production secrets | ❌ No |

### Key Commands

```bash
make dev              # Start all dev servers
make docker-up        # Start Docker services
make docker-down      # Stop Docker services
make test             # Run tests
make typecheck        # TypeScript check
make lint             # ESLint check
pnpm prisma studio    # Database browser
```

## Documentation

- [CURRENT-STATE.md](./CURRENT-STATE.md) - Development progress
- [docs/tasks/](./docs/tasks/) - Phase implementation docs
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Production deployment guide
- [docs/AI-DEVELOPER/](./docs/AI-DEVELOPER/) - AI pair programming templates

## Tech Stack

- **Frontend:** Next.js 15, React 19, TailwindCSS, shadcn/ui
- **Backend:** Express.js, TypeScript
- **Database:** PostgreSQL, Prisma ORM
- **Cache:** Redis
- **Auth:** JWT + Refresh tokens
- **Billing:** Stripe
- **Email:** Resend

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Stripe Documentation](https://stripe.com/docs)
