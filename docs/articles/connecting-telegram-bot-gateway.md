---
slug: connecting-telegram-bot-gateway
title: How to Connect a Telegram Bot Gateway
excerpt: Step-by-step guide to connecting your Telegram bot to 2Bot.
category: gateways
tags: [telegram, gateway, bot, setup, botfather]
---

# Connecting a Telegram Bot Gateway

Telegram Bot is one of the most popular gateway types on 2Bot. Here's how to set it up.

## Prerequisites
- A Telegram account
- A Telegram bot (created via @BotFather)

## Step 1: Create a Bot via @BotFather
1. Open Telegram and search for **@BotFather**
2. Send `/newbot` and follow the prompts
3. Choose a name and username for your bot
4. Copy the **bot token** (looks like `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`)

## Step 2: Add the Gateway in 2Bot
1. Go to **Dashboard → Gateways**
2. Click **"Add Gateway"**
3. Select **"Telegram Bot"** as the type
4. Paste your bot token
5. Give the gateway a friendly name
6. Click **"Create"**

## Step 3: Verify Connection
- 2Bot will verify the token with Telegram's API
- If successful, the status will show **"Connected"**
- If it fails, double-check your bot token

## Common Issues
- **"Token invalid"** — Make sure you copied the full token from @BotFather
- **"Bot already in use"** — Another service may be using the same bot. Use `/revoke` in @BotFather to get a new token
- **Connection timeout** — Check your internet connection and try again

## Using the Bot
Once connected, you can:
- Install plugins that use Telegram (e.g., Auto-Reply, Message Logger)
- Create workflows triggered by Telegram messages
- Send messages through the bot via plugins
