/**
 * Give every CONNECTED Telegram gateway that has no webhook secret one, now.
 *
 * Why: the inbound route accepts every delivery for a gateway with no secret,
 * and since 512b290 the provider mints one on connect -- but nothing connects
 * gateways after a restart. The provider connects lazily, only when the owner
 * opens the gateway, so on 2026-09-30 two live bots ("Edd fleet",
 * "@Moviefinduz_bot") were still accepting forged updates after the deploy.
 *
 * This runs the provider's own connect() for each such gateway: the same
 * setWebhook call (same URL, now with secret_token) and the same persistence
 * the owner's next visit would trigger. The inbound route reads the gateway
 * from the DB on every request, so the secret is enforced immediately, and
 * setWebhook runs before the secret is saved, so no delivery is rejected in
 * between.
 *
 * connect() marks a gateway ERROR if any Telegram call fails; here the previous
 * status is restored instead, so a transient failure can't take a live bot
 * down, and the failure is reported for a human to look at.
 *
 * Usage (loads the same env files as the API, incl. TELEGRAM_WEBHOOK_BASE_URL):
 *   set -a; . ./.env; . ./.env.production; . ./.env.local; set +a
 *   npx tsx scripts/secure-telegram-webhooks.ts            # dry run: list targets
 *   APPLY=1 npx tsx scripts/secure-telegram-webhooks.ts    # do it
 */

import { prisma } from "../src/lib/prisma";
import { gatewayService } from "../src/modules/gateway/gateway.service";
import type { TelegramBotCredentials } from "../src/modules/gateway/gateway.types";
import { TelegramBotProvider } from "../src/modules/gateway/providers/telegram-bot.provider";
import { resolveTelegramWebhookSecret } from "../src/server/routes/webhook";

const apply = process.env.APPLY === "1";

async function main(): Promise<void> {
  const gateways = await prisma.gateway.findMany({
    where: { type: "TELEGRAM_BOT", status: "CONNECTED" },
    orderBy: { id: "asc" },
  });
  const targets = gateways.filter((g) => !resolveTelegramWebhookSecret(g));
  console.log(`${gateways.length} connected Telegram gateways, ${targets.length} without a webhook secret`);
  for (const g of targets) console.log(`  [${g.id}] ${g.name}`);
  if (!apply || targets.length === 0) {
    if (!apply) console.log("\nDry run. Re-run with APPLY=1 to secure them.");
    return;
  }

  const provider = new TelegramBotProvider();
  let failed = 0;
  for (const g of targets) {
    try {
      // Filtered to TELEGRAM_BOT above, so these are Telegram credentials.
      const credentials = gatewayService.getDecryptedCredentials(g) as TelegramBotCredentials;
      await provider.connect(g.id, credentials, (g.config as Record<string, unknown>) ?? {});
      const after = await prisma.gateway.findUniqueOrThrow({ where: { id: g.id } });
      const ok = Boolean(resolveTelegramWebhookSecret(after));
      console.log(`  [${g.id}] ${g.name}: ${ok ? "secured" : "connected, but still no secret"}`);
      if (!ok) failed++;
    } catch (err) {
      failed++;
      await gatewayService.updateStatus(g.id, g.status);
      console.error(`  [${g.id}] ${g.name}: FAILED (${(err as Error).message}); status restored to ${g.status}`);
    }
  }
  if (failed) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(`✗ ${(err as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
