# 2Bot Platform - Production Deployment Guide

## 🚀 Quick Start

```bash
# 1. Copy environment template
cp .env.production.example .env.production

# 2. Fill in all values in .env.production
nano .env.production

# 3. Run deployment
./scripts/deploy/deploy.sh
```

---

## 📋 Prerequisites

### Server Requirements
- **OS:** Ubuntu 22.04 LTS (recommended)
- **RAM:** 2GB minimum, 4GB recommended
- **Storage:** 20GB minimum
- **CPU:** 2 cores minimum

### Software Requirements
```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo apt install docker-compose-plugin

# Verify installation
docker --version
docker compose version
```

---

## 🔐 Environment Configuration

### 1. Generate Secrets

```bash
# JWT Secrets (64 bytes each)
openssl rand -base64 64

# Encryption Key (32 bytes hex)
openssl rand -hex 32

# Database Password
openssl rand -base64 32

# Redis Password
openssl rand -base64 32
```

### 2. Stripe Configuration

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Switch to **Live Mode**
3. Get API keys from **Developers > API Keys**
4. Create webhook endpoint:
   - URL: `https://2bot.org/api/billing/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.*`, `invoice.*`
5. Copy webhook signing secret

### 3. Email (Mailgun/SMTP)

1. Create Mailgun account or use existing SMTP
2. Verify domain `mail.2bot.org`
3. Get SMTP credentials

---

## 🌐 Domain & SSL Setup

### Cloudflare DNS Configuration

Add these DNS records in Cloudflare:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | @ | YOUR_SERVER_IP | Proxied |
| A | www | YOUR_SERVER_IP | Proxied |
| A | api | YOUR_SERVER_IP | Proxied |
| A | dashboard | YOUR_SERVER_IP | Proxied |
| A | admin | YOUR_SERVER_IP | Proxied |

### SSL Certificate (Choose One)

#### Option A: Cloudflare Origin Certificate (Recommended)
1. In Cloudflare, go to SSL/TLS > Origin Server
2. Create Certificate for `*.2bot.org` and `2bot.org`
3. Copy certificates to:
   - `nginx/ssl/fullchain.pem`
   - `nginx/ssl/privkey.pem`

#### Option B: Let's Encrypt with Certbot
```bash
# Install certbot
sudo apt install certbot python3-certbot-dns-cloudflare

# Create Cloudflare credentials
mkdir -p ~/.secrets/certbot
echo "dns_cloudflare_api_token = YOUR_TOKEN" > ~/.secrets/certbot/cloudflare.ini
chmod 600 ~/.secrets/certbot/cloudflare.ini

# Get wildcard certificate
sudo certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials ~/.secrets/certbot/cloudflare.ini \
  -d "2bot.org" \
  -d "*.2bot.org"

# Copy to nginx/ssl/
sudo cp /etc/letsencrypt/live/2bot.org/fullchain.pem nginx/ssl/
sudo cp /etc/letsencrypt/live/2bot.org/privkey.pem nginx/ssl/
```

---

## 🐳 Deployment

### Full Deployment
```bash
./scripts/deploy/deploy.sh
```

### Manual Steps
```bash
# Build images
docker compose -f docker-compose.prod.yml build

# Start services
docker compose -f docker-compose.prod.yml up -d

# Run migrations
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy

# View logs
docker compose -f docker-compose.prod.yml logs -f
```

### Useful Commands
```bash
# Stop all services
docker compose -f docker-compose.prod.yml down

# Restart a service
docker compose -f docker-compose.prod.yml restart app

# View specific logs
docker compose -f docker-compose.prod.yml logs -f api

# Shell into container
docker compose -f docker-compose.prod.yml exec api sh

# Database shell
docker compose -f docker-compose.prod.yml exec postgres psql -U 2bot_prod 2bot_production
```

---

## 💾 Backups

### Manual Backup
```bash
./scripts/deploy/backup.sh
```

### Automated Backups (Cron)
```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * /home/abcdev/projects/2bot/scripts/deploy/backup.sh >> /var/log/2bot-backup.log 2>&1
```

### Restore from Backup
```bash
# Stop services
docker compose -f docker-compose.prod.yml stop app api

# Restore database
gunzip -c backups/2bot_backup_TIMESTAMP.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres psql -U 2bot_prod 2bot_production

# Start services
docker compose -f docker-compose.prod.yml start app api
```

---

## 📊 Monitoring

### Health Checks
- App: `https://2bot.org/` (should return 200)
- API: `https://2bot.org/api/health` (should return JSON)

### Sentry
- Dashboard: https://sentry.io
- Check for errors in real-time

### Container Status
```bash
docker compose -f docker-compose.prod.yml ps
```

### Resource Usage
```bash
docker stats
```

---

## 🔧 Troubleshooting

### Common Issues

#### 1. Database Connection Failed
```bash
# Check postgres is running
docker compose -f docker-compose.prod.yml ps postgres

# Check postgres logs
docker compose -f docker-compose.prod.yml logs postgres

# Verify DATABASE_URL is correct
echo $DATABASE_URL
```

#### 2. Redis Connection Failed
```bash
# Check redis is running
docker compose -f docker-compose.prod.yml ps redis

# Test redis connection
docker compose -f docker-compose.prod.yml exec redis redis-cli -a YOUR_PASSWORD ping
```

#### 3. 502 Bad Gateway
```bash
# Check if app/api are running
docker compose -f docker-compose.prod.yml ps

# Check nginx logs
docker compose -f docker-compose.prod.yml logs nginx

# Restart all services
docker compose -f docker-compose.prod.yml restart
```

#### 4. SSL Certificate Issues
```bash
# Verify certificate files exist
ls -la nginx/ssl/

# Check certificate validity
openssl x509 -in nginx/ssl/fullchain.pem -text -noout | grep -A2 "Validity"
```

---

## 📝 Post-Deployment Checklist

- [ ] App accessible at https://2bot.org
- [ ] API health check passes at https://2bot.org/api/health
- [ ] Can register new account
- [ ] Can login
- [ ] Dashboard loads correctly
- [ ] Stripe checkout works (test with $1 product)
- [ ] Email sending works (forgot password)
- [ ] Sentry receiving errors
- [ ] Backups scheduled
- [ ] SSL certificate valid

---

## 🎉 Launch!

Once all checks pass:

1. **Soft Launch** - Invite 10-20 beta users
2. **Monitor** - Watch Sentry and logs for 48 hours
3. **Public Launch** - Announce on social media
4. **Celebrate!** 🚀
