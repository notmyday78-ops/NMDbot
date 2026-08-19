"use strict";
import { Client, GatewayIntentBits, Collection, ActivityType } from "discord.js";
import chalk from "chalk";
import { config } from "./config/env";
import { initializeDatabase } from "./database/connection";
import { loadCommands } from "./handlers/commandHandler";
import { loadEvents } from "./handlers/eventHandler";
import { initializeI18n } from "./i18n";
import { logger } from "./utils/logger";
import { startApiServer } from "./api/server";
import { registerAllInteractions } from "./handlers/registerInteractions";
class PegasusBot extends Client {
  commands = new Collection();
  cooldowns = new Collection();
  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.GuildIntegrations,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMessageTyping,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.DirectMessageTyping,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildScheduledEvents,
        GatewayIntentBits.AutoModerationConfiguration,
        GatewayIntentBits.AutoModerationExecution
      ],
      allowedMentions: {
        parse: ["users", "roles"],
        repliedUser: true
      },
      presence: {
        status: "online",
        activities: [
          {
            name: "Starting up...",
            type: ActivityType.Playing
          }
        ]
      }
    });
  }
  async start() {
    try {
      logger.info(chalk.blue("Initializing i18n..."));
      await initializeI18n();
      logger.info(chalk.blue("Connecting to database..."));
      try {
        await initializeDatabase();
        logger.info(chalk.green("Database connected successfully"));
      } catch (error) {
        logger.warn(
          chalk.yellow("Database connection failed - bot will run with limited functionality")
        );
        logger.warn(
          chalk.yellow(
            "Some features like economy, XP, and moderation may not work without database"
          )
        );
      }
      logger.info(chalk.blue("Loading commands..."));
      await loadCommands(this);
      logger.info(chalk.blue("Loading events..."));
      await loadEvents(this);
      logger.info(chalk.blue("Registering interactions..."));
      await registerAllInteractions();
      logger.info(chalk.blue("Logging in to Discord..."));
      await this.login(config.DISCORD_TOKEN);
      const shardId = this.shard?.ids[0] ?? 0;
      const isPrimaryShard = !this.shard || this.shard.ids.includes(0);
      logger.info(chalk.green(`Shard #${shardId} logged in successfully`));
      if (config.ENABLE_API) {
        if (isPrimaryShard) {
          logger.info(chalk.blue("Starting API server on primary shard..."));
          startApiServer();
        } else {
          logger.info(chalk.yellow(`API server skipped on Shard #${shardId} (running on Shard 0)`));
        }
      } else {
        logger.info(chalk.yellow("API server disabled - bot running in standalone mode"));
      }
    } catch (error) {
      logger.error(chalk.red("Failed to start bot:"), error);
      process.exit(1);
    }
  }
}
const bot = new PegasusBot();
process.on("unhandledRejection", (error) => {
  logger.error(chalk.red("Unhandled Rejection:"), error);
});
process.on("uncaughtException", (error) => {
  logger.error(chalk.red("Uncaught Exception:"), error);
  process.exit(1);
});
process.on("SIGINT", () => {
  logger.info(chalk.yellow("Received SIGINT, shutting down gracefully..."));
  bot.destroy();
  process.exit(0);
});
process.on("SIGTERM", () => {
  logger.info(chalk.yellow("Received SIGTERM, shutting down gracefully..."));
  bot.destroy();
  process.exit(0);
});
void bot.start();
export const client = bot;
