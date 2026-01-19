#!/bin/bash
# ============================================
# 2Bot Platform - SSL Certificate Setup
# ============================================
# Uses Let's Encrypt with Certbot

set -e

DOMAIN=${1:-"2bot.org"}
EMAIL=${2:-"admin@2bot.org"}

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           2Bot Platform - SSL Certificate Setup              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Domain: $DOMAIN"
echo "Email:  $EMAIL"
echo ""

# Create SSL directory
mkdir -p nginx/ssl

# Option 1: Using certbot standalone (recommended for first time)
echo "Option 1: Standalone mode (stop nginx first)"
echo "-------------------------------------------"
echo "docker compose -f docker-compose.prod.yml stop nginx"
echo "certbot certonly --standalone -d $DOMAIN -d www.$DOMAIN -d api.$DOMAIN -d dashboard.$DOMAIN -d admin.$DOMAIN --email $EMAIL --agree-tos"
echo "cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem nginx/ssl/"
echo "cp /etc/letsencrypt/live/$DOMAIN/privkey.pem nginx/ssl/"
echo ""

# Option 2: Using Cloudflare DNS (recommended if using Cloudflare)
echo "Option 2: Cloudflare DNS Challenge (no downtime)"
echo "------------------------------------------------"
echo "1. Install certbot-dns-cloudflare:"
echo "   apt install python3-certbot-dns-cloudflare"
echo ""
echo "2. Create Cloudflare credentials file:"
echo "   mkdir -p ~/.secrets/certbot"
echo "   echo 'dns_cloudflare_api_token = YOUR_API_TOKEN' > ~/.secrets/certbot/cloudflare.ini"
echo "   chmod 600 ~/.secrets/certbot/cloudflare.ini"
echo ""
echo "3. Get certificate:"
echo "   certbot certonly --dns-cloudflare --dns-cloudflare-credentials ~/.secrets/certbot/cloudflare.ini -d '$DOMAIN' -d '*.$DOMAIN' --email $EMAIL --agree-tos"
echo ""
echo "4. Copy certificates:"
echo "   cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem nginx/ssl/"
echo "   cp /etc/letsencrypt/live/$DOMAIN/privkey.pem nginx/ssl/"
echo ""

# Option 3: Self-signed for testing
echo "Option 3: Self-signed certificate (TESTING ONLY)"
echo "------------------------------------------------"
read -p "Generate self-signed certificate for testing? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout nginx/ssl/privkey.pem \
    -out nginx/ssl/fullchain.pem \
    -subj "/C=US/ST=State/L=City/O=2Bot/CN=$DOMAIN"
  echo ""
  echo "✓ Self-signed certificate generated in nginx/ssl/"
  echo "  WARNING: This is for testing only. Browsers will show security warnings."
fi

echo ""
echo "After setting up SSL, restart nginx:"
echo "docker compose -f docker-compose.prod.yml restart nginx"
