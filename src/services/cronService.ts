import { Client, TextChannel } from 'discord.js';
import { getDatabase } from '../database/connection';
import { userBirthdays, birthdaySettings } from '../database/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '../utils/logger';
import { triviaService } from './triviaService';
import { socialFeedService } from './socialFeedService';
import { economyMarketService } from './economyMarketService';
import { ticketWorkflowService } from './ticketWorkflowService';

export class CronService {
  private client: Client;
  private birthdayInterval: NodeJS.Timeout | null = null;
  private triviaInterval: NodeJS.Timeout | null = null;
  private feedsInterval: NodeJS.Timeout | null = null;
  private marketInterval: NodeJS.Timeout | null = null;
  private ticketInterval: NodeJS.Timeout | null = null;

  constructor(client: Client) {
    this.client = client;
  }

  public startAll() {
    void this.checkBirthdays();
    this.birthdayInterval = setInterval(() => { void this.checkBirthdays(); }, 60 * 60 * 1000); // Check every hour

    void this.checkTrivia();
    this.triviaInterval = setInterval(() => { void this.checkTrivia(); }, 5 * 60 * 1000); // Check every 5 minutes

    void this.checkFeeds();
    this.feedsInterval = setInterval(() => { void this.checkFeeds(); }, 15 * 60 * 1000); // Check every 15 minutes

    void this.checkMarket();
    this.marketInterval = setInterval(() => { void this.checkMarket(); }, 10 * 60 * 1000); // Check every 10 minutes

    void this.checkTickets();
    this.ticketInterval = setInterval(() => { void this.checkTickets(); }, 15 * 60 * 1000); // Check every 15 minutes

    logger.info('CronService started for Birthdays, Trivia, Feeds, Market, and Tickets');
  }

  public stopAll() {
    if (this.birthdayInterval) clearInterval(this.birthdayInterval);
    if (this.triviaInterval) clearInterval(this.triviaInterval);
    if (this.feedsInterval) clearInterval(this.feedsInterval);
    if (this.marketInterval) clearInterval(this.marketInterval);
    if (this.ticketInterval) clearInterval(this.ticketInterval);
  }

  private async checkBirthdays() {
    try {
      const today = new Date();
      // Only process at a specific hour (e.g. 12 UTC) to avoid spamming
      if (today.getUTCHours() !== 12) return;

      const day = today.getUTCDate();
      const month = today.getUTCMonth() + 1; // 1-indexed

      const db = getDatabase();
      const { users } = await import('../database/schema/users');
      const birthdays = await db
        .select()
        .from(userBirthdays)
        .innerJoin(birthdaySettings, eq(userBirthdays.guildId, birthdaySettings.guildId))
        .innerJoin(users, eq(userBirthdays.userId, users.id))
        .where(
          and(
            eq(birthdaySettings.enabled, true),
            eq(userBirthdays.day, day),
            eq(userBirthdays.month, month)
          )
        );

      const { generateBirthdayImage } = await import('../utils/canvas');
      const { AttachmentBuilder } = await import('discord.js');

      for (const b of birthdays) {
        if (!b.birthday_settings.channelId) continue;

        const channel = (await this.client.channels
          .fetch(b.birthday_settings.channelId)
          .catch(() => null)) as TextChannel;
        if (!channel || !channel.isTextBased()) continue;

        const msg = b.birthday_settings.message.replace('{user}', `<@${b.user_birthdays.userId}>`);

        // Determine background image using override logic
        let backgroundUrl = b.users.customBackgroundImage || undefined;
        if (b.birthday_settings.customBackgroundImage) {
          if (b.birthday_settings.forceGuildBackgroundImage || !backgroundUrl) {
            backgroundUrl = b.birthday_settings.customBackgroundImage;
          }
        }

        // Generate image
        const username = b.users.username || 'User';
        let avatarUrl = b.users.avatarUrl || '';
        
        if (!avatarUrl) {
           // Try to fetch from discord if missing
           try {
             const discordUser = await this.client.users.fetch(b.user_birthdays.userId);
             avatarUrl = discordUser.displayAvatarURL({ extension: 'png', size: 256 });
           } catch {
             // Fallback
           }
        }

        let attachment;
        if (avatarUrl) {
           try {
             const buffer = await generateBirthdayImage(username, avatarUrl, backgroundUrl);
             attachment = new AttachmentBuilder(buffer, { name: 'birthday.png' });
           } catch (e) {
             logger.error(`Failed to generate birthday image for ${username}:`, e);
           }
        }

        await channel
          .send({
            content: msg,
            files: attachment ? [attachment] : undefined,
          })
          .catch(() => null);
      }
    } catch (error) {
      logger.error('Error in checkBirthdays cron:', error);
    }
  }

  private async checkTrivia() {
    await triviaService.checkScheduledGames();
  }

  private async checkFeeds() {
    await socialFeedService.checkFeeds(this.client);
  }

  private async checkMarket() {
    await economyMarketService.fluctuateMarket();
  }

  private async checkTickets() {
    await ticketWorkflowService.checkSlaTimeouts(this.client);
  }
}
