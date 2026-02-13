---
slug: troubleshooting-gateway-issues
title: Troubleshooting Gateway Connection Issues
excerpt: Fix common gateway issues — token errors, rate limits, and connection problems.
category: troubleshooting
tags: [troubleshooting, gateway, connection, error, fix]
---

# Troubleshooting Gateway Connection Issues

Having trouble with your gateway? Here are solutions to the most common problems.

## Gateway Status Types
- **Connected** ✅ — Working normally
- **Disconnected** ⚪ — Not actively connected
- **Error** ❌ — Connection failed

## Common Issues

### "Token Invalid" or "Authentication Failed"
- Double-check your API key or bot token
- Make sure the token hasn't expired or been revoked
- For Telegram bots: talk to @BotFather and get a fresh token with `/token`

### "Rate Limited"
- You're sending too many requests
- Wait a few minutes before retrying
- Consider upgrading your plan for higher rate limits

### "Connection Timeout"
- The external service may be down
- Check the service's status page
- Try reconnecting after a few minutes

### "Gateway Not Found"
- The gateway may have been deleted
- Check your Gateways page for the current list
- Re-create the gateway if needed

## Reconnecting a Gateway
1. Go to **Dashboard → Gateways**
2. Click on the problematic gateway
3. Click **"Reconnect"** or **"Test Connection"**
4. If it still fails, delete and re-create with fresh credentials

## AI Provider Gateways
For AI gateways (OpenAI, Anthropic):
- Verify your API key is valid and has credits on the provider's platform
- Check if the provider is experiencing outages
- Ensure your API key has the required permissions

## Still Having Issues?
If you've tried the above and your gateway still isn't working, reach out for help through the Support chat.
