"use strict";
import { Events, ActivityType } from "discord.js";
import { logger } from "../utils/logger";
import { giveawayService } from "../services/giveawayService";
import { registerCommands } from "../handlers/commandHandler";
import chalk from "chalk";
import { moderationScheduler } from "../services/moderationScheduler";
import { crossShardService } from "../services/crossShardService";
import { CronService } from "../services/cronService";
import { reminderService } from "../services/reminderService";
import { musicService } from "../services/musicService";
export const name = Events.ClientReady;
export const once = true;
export async function execute(client) {
  const shardId = client.shard?.ids[0] ?? 0;
  const isPrimaryShard = !client.shard || client.shard.ids.includes(0);
  logger.info(chalk.green(`Ready! Logged in as ${client.user.tag} (Shard #${shardId})`));
  if (isPrimaryShard) {
    await registerCommands(client);
    logger.info(chalk.blue("Global slash commands registered"));
  }
  const globalObj = global;
  globalObj.client = client;
  await giveawayService.initializeActiveGiveaways();
  logger.info(chalk.blue(`Initialized active giveaways on Shard #${shardId}`));
  moderationScheduler.attachClient(client);
  await moderationScheduler.initialize();
  logger.info(chalk.blue(`Moderation scheduler initialized on Shard #${shardId}`));
  const cronService = new CronService(client);
  cronService.startAll();
  reminderService.init(client);
  await musicService.init(client);
  const totalGuilds = await crossShardService.getTotalGuildsCount(client);
  client.user.setPresence({
    activities: [
      {
        name: `${totalGuilds} servers`,
        type: ActivityType.Watching
      }
    ],
    status: "online"
  });
  setInterval(async () => {
    try {
      const [guildsCount, usersCount] = await Promise.all([
        crossShardService.getTotalGuildsCount(client),
        crossShardService.getTotalUsersCount(client)
      ]);
      const activities = [
        { name: `${guildsCount} servers`, type: ActivityType.Watching },
        { name: `${usersCount} users`, type: ActivityType.Listening },
        { name: "/help for commands", type: ActivityType.Playing }
      ];
      const activity = activities[Math.floor(Math.random() * activities.length)];
      client.user.setActivity(activity.name, { type: activity.type });
    } catch (err) {
      logger.debug("Failed to update sharded status presence:", err);
    }
  }, 3e5);
}
