
import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const userId = 'cmlgj11hd0001jlky7n1rx2ci'; 
  const slug = 'custom-cmlgj11h-echo-bot';
  // Check if it exists
  const plugin = await prisma.plugin.findUnique({
    where: { slug: slug },
    include: {
      userPlugins: true
    }
  });

  if (plugin) {
    console.log(`Plugin found: ${plugin.slug}, Installations: ${plugin.userPlugins.length}`);
    if (plugin.userPlugins.length === 0) {
      console.log('Deleting orphaned plugin...');
      await prisma.plugin.delete({ where: { id: plugin.id } });
      console.log('Deleted orphaned plugin.');
    } else {
      console.log('Plugin is not orphaned.');
    }
  } else {
    console.log('Plugin not found.');
  }

  // Also check for user's analytics duplicates
  const userPlugins = await prisma.userPlugin.findMany({
    where: { 
      userId,
      plugin: { slug: 'analytics' }
    }
  });

  if (userPlugins.length > 1) {
    console.log(`Found ${userPlugins.length} analytics installations. Cleaning duplicates...`);
    // Keep the latest one
    // Sort by createdAt descending (newest first)
    const sorted = userPlugins.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const toDelete = sorted.slice(1);
    for (const p of toDelete) {
      console.log(`Deleting duplicate UserPlugin ${p.id}`);
      await prisma.userPlugin.delete({ where: { id: p.id } });
      console.log(`Deleted duplicate UserPlugin ${p.id}`);
    }
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
