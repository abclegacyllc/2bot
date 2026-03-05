#!/bin/bash
# Test script for per-container rate limiting rules
# Usage: sudo bash scripts/test-rate-limit.sh

CIP="172.20.0.2"
CHAIN="2BOT-172-20-0-2"

echo "=== Setting up rate-limited egress for container $CIP ==="

# Full cleanup (ignore errors)
iptables -D DOCKER-USER -s "$CIP" -j "$CHAIN" 2>/dev/null
iptables -F "$CHAIN" 2>/dev/null
iptables -X "$CHAIN" 2>/dev/null

# Create chain
iptables -N "$CHAIN"
echo "[+] Chain $CHAIN created"

# Resolve IPs
TG_IP=$(dig +short api.telegram.org | head -1)
NPM_IP=$(dig +short registry.npmjs.org | head -1)
echo "[+] Telegram IP: $TG_IP"
echo "[+] npm IP: $NPM_IP"

# 1. ESTABLISHED,RELATED
iptables -A "$CHAIN" -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
echo "[+] Rule 1: ESTABLISHED,RELATED"

# 2. DNS rate limited (60/min, burst 15)
iptables -A "$CHAIN" -p udp --dport 53 -m limit --limit 60/min --limit-burst 15 -j RETURN
iptables -A "$CHAIN" -p udp --dport 53 -j DROP
echo "[+] Rule 2: DNS rate limited"

# 3. Loopback
iptables -A "$CHAIN" -d 127.0.0.0/8 -j RETURN
echo "[+] Rule 3: Loopback"

# 4. Bot platform (Telegram) — strict: 20/min, burst 5
iptables -A "$CHAIN" -d "$TG_IP" -p tcp -m multiport --dports 80,443 -m conntrack --ctstate NEW -m limit --limit 20/min --limit-burst 5 -j RETURN
iptables -A "$CHAIN" -d "$TG_IP" -p tcp -m multiport --dports 80,443 -m conntrack --ctstate NEW -j DROP
iptables -A "$CHAIN" -d "$TG_IP" -p tcp -m multiport --dports 80,443 -j RETURN
echo "[+] Rule 4: Telegram rate limited (20/min)"

# 5. General (npm) — standard: 120/min, burst 30
iptables -A "$CHAIN" -d "$NPM_IP" -p tcp -m multiport --dports 80,443 -m conntrack --ctstate NEW -m limit --limit 120/min --limit-burst 30 -j RETURN
iptables -A "$CHAIN" -d "$NPM_IP" -p tcp -m multiport --dports 80,443 -m conntrack --ctstate NEW -j DROP
iptables -A "$CHAIN" -d "$NPM_IP" -p tcp -m multiport --dports 80,443 -j RETURN
echo "[+] Rule 5: npm rate limited (120/min)"

# 6. DROP all else
iptables -A "$CHAIN" -j DROP
echo "[+] Rule 6: DROP all else"

# Jump from DOCKER-USER
iptables -I DOCKER-USER -s "$CIP" -j "$CHAIN"
echo "[+] Jump rule added to DOCKER-USER"

echo ""
echo "=== Chain $CHAIN rules ==="
iptables -L "$CHAIN" -n -v --line-numbers

echo ""
echo "=== DOCKER-USER (first 5 rules) ==="
iptables -L DOCKER-USER -n --line-numbers | head -8

echo ""
echo "=== DONE ==="
