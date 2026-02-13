
import dotenv from "dotenv";
import path from "path";

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { prisma } from "@/lib/prisma";
import { twoBotAIProvider } from "@/modules/2bot-ai-provider/2bot-ai.provider";
import type { TwoBotAIModel } from "@/modules/2bot-ai-provider/types";
import { creditWalletService } from "@/modules/credits/wallet.service";

async function main() {
  console.log("🚀 Starting AI Usage Tracking Test...");

  // 1. Get Test User
  const user = await prisma.user.findUnique({
    where: { email: "test@example.com" },
  });

  if (!user) {
    console.error("❌ Test user 'test@example.com' not found. Run 'npm run db:seed' first.");
    process.exit(1);
  }
  console.log(`👤 Using user: ${user.email} (${user.id})`);

  // 2. Setup Wallet & Get Initial State
  const wallet = await creditWalletService.getOrCreatePersonalWallet(user.id);
  const initialBalance = wallet.balance;
  
  const initialUsageCount = await prisma.aIUsage.count({
    where: { userId: user.id },
  });

  console.log(`💰 Initial Balance: ${initialBalance}`);
  console.log(`📊 Initial AI Usage Records: ${initialUsageCount}`);

  // 3. Make AI Request (Claude 3 Haiku)
  const modelToTest = "claude-3-haiku-20240307"; // As requested: Haiku
  console.log(`\n🤖 Sending request to ${modelToTest}...`);

  try {
    const response = await twoBotAIProvider.textGeneration({
      messages: [{ role: "user", content: `Say 'Testing AI Usage ${Date.now()}' and nothing else.` }],
      model: modelToTest as TwoBotAIModel,
      userId: user.id,
      stream: false,
      smartRouting: false, // Force specific model
    });

    console.log("✅ Response received:", response.content);
    console.log(`   Tokens: Input=${response.usage.inputTokens}, Output=${response.usage.outputTokens}`);
    console.log(`   Credits Used: ${response.creditsUsed}`);

    // 4. Verify Tracking
    const finalWallet = await creditWalletService.getPersonalWallet(user.id);
    if (!finalWallet) {
      console.error('❌ Final wallet not found');
      process.exit(1);
    }
    const finalBalance = finalWallet.balance;
    
    const finalUsageCount = await prisma.aIUsage.count({
      where: { userId: user.id },
    });

    // Get the latest usage record
    const lastUsage = await prisma.aIUsage.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    console.log("\n📉 Verification Results:");
    console.log(`💰 Final Balance: ${finalBalance} (Diff: ${finalBalance - initialBalance})`);
    console.log(`📊 Final AI Usage Records: ${finalUsageCount} (Diff: +${finalUsageCount - initialUsageCount})`);

    // Assertions
    const balanceDiff = initialBalance - finalBalance;
    const expectedCredits = response.creditsUsed;

    if (balanceDiff === expectedCredits) {
      console.log("✅ Credit deduction matches API response");
    } else {
      console.error(`❌ Credit mismatch! Deducted: ${balanceDiff}, Expected: ${expectedCredits}`);
    }

    if (finalUsageCount === initialUsageCount + 1) {
      console.log("✅ New AI Usage record created");
    } else {
      console.error("❌ No new AI Usage record found!");
    }

    if (lastUsage) {
      console.log("\n📝 Latest Usage Record Details:");
      console.log(`   ID: ${lastUsage.id}`);
      console.log(`   Model: ${lastUsage.model}`);
      console.log(`   Input Tokens: ${lastUsage.inputTokens}`);
      console.log(`   Output Tokens: ${lastUsage.outputTokens}`);
      console.log(`   Credits: ${lastUsage.creditsUsed}`);
      
      if (lastUsage.model === modelToTest && lastUsage.creditsUsed === expectedCredits) {
        console.log("✅ Usage record matches request details");
      } else {
        console.error("❌ Usage record details mismatch!");
      }
    }

  } catch (error) {
    console.error("❌ AI Request Failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
