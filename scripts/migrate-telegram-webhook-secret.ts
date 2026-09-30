/**
 * One-time script: move `Gateway.config.webhookSecretToken` (plaintext JSON)
 * into the encrypted credentials blob and delete the plaintext copy.
 *
 * Why: the secret is the only thing the inbound Telegram webhook checks, and
 * a plaintext `config` column is returned by `GET /gateways/:id` and by the
 * account export. It now lives in `TelegramBotCredentials.webhookSecretToken`
 * (encrypted at rest, never serialised out).
 *
 * The provider performs the same move on the next reconnect of each gateway,
 * and every reader falls back to `config` until then, so this script is not
 * required for correctness. It is required to be able to remove the fallback,
 * and to close the exposure for gateways that never reconnect.
 *
 * Idempotent: rows without the legacy key are skipped. When both locations
 * hold a value the encrypted one wins (that is the one the provider handed to
 * Telegram last), and the plaintext copy is dropped.
 *
 * Usage:
 *   DRY_RUN=1 npx tsx scripts/migrate-telegram-webhook-secret.ts   # report only
 *   npx tsx scripts/migrate-telegram-webhook-secret.ts
 *
 * Needs DATABASE_URL and the encryption key env (ENCRYPTION_KEY or the
 * JWT_SECRET fallback) that the API uses, otherwise decryption fails and the
 * row is reported as "failed" and left untouched.
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import "dotenv/config";
import { Pool } from "pg";

import { decryptJson, encrypt } from "../src/lib/encryption";
import type { TelegramBotCredentials } from "../src/modules/gateway/gateway.types";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required (load .env.local before running this script).");
}
const dryRun = process.env.DRY_RUN === "1";

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const gateways = await prisma.gateway.findMany({
    where: { type: "TELEGRAM_BOT" },
    select: { id: true, name: true, credentialsEnc: true, config: true },
    orderBy: { id: "asc" },
  });

  let moved = 0;
  let skipped = 0;
  let failed = 0;

  for (const gateway of gateways) {
    const config = (gateway.config as Record<string, unknown> | null) ?? {};
    const legacy = config.webhookSecretToken;
    if (typeof legacy !== "string" || !legacy) {
      skipped++;
      continue;
    }

    let credentials: TelegramBotCredentials;
    try {
      credentials = decryptJson<TelegramBotCredentials>(gateway.credentialsEnc);
    } catch (err) {
      failed++;
      console.error(`[${gateway.id}] ${gateway.name}: cannot decrypt credentials — ${(err as Error).message}`);
      continue;
    }

    const webhookSecretToken = credentials.webhookSecretToken || legacy;
    const { webhookSecretToken: _drop, ...rest } = config;

    if (dryRun) {
      console.log(`[${gateway.id}] ${gateway.name}: would move secret (dry run)`);
      moved++;
      continue;
    }

    await prisma.gateway.update({
      where: { id: gateway.id },
      data: {
        credentialsEnc: encrypt({ ...credentials, webhookSecretToken }),
        config: rest as Prisma.InputJsonObject,
      },
    });
    console.log(`[${gateway.id}] ${gateway.name}: moved`);
    moved++;
  }

  console.log(
    `\n--- Telegram webhook secret migration${dryRun ? " (dry run)" : ""} ---\n` +
      `  gateways: ${gateways.length}\n` +
      `  moved:    ${moved}\n` +
      `  skipped:  ${skipped} (no plaintext secret)\n` +
      `  failed:   ${failed}`,
  );
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
