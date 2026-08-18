import { getDatabase } from '../database/connection';
import { socialFeeds } from '../database/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../utils/logger';
import { Client, TextChannel } from 'discord.js';
import Parser from 'rss-parser';

export class SocialFeedService {
  private parser = new Parser();

  public async checkFeeds(client: Client) {
    try {
      const db = getDatabase();
      const feeds = await db.select().from(socialFeeds).where(eq(socialFeeds.enabled, true));

      for (const feed of feeds) {
        try {
          const parsed = await this.parser.parseURL(feed.feedUrl);
          if (!parsed.items || parsed.items.length === 0) continue;

          let itemsToPost: Array<{
            guid?: string;
            id?: string;
            link?: string;
            title?: string;
            creator?: string;
          }> = [];

          if (!feed.lastEntryId) {
            // First time running, just post the newest item
            itemsToPost.push(parsed.items[0]);
          } else {
            const lastPostedIndex = parsed.items.findIndex(
              (item) =>
                item.guid === feed.lastEntryId ||
                item.id === feed.lastEntryId ||
                item.link === feed.lastEntryId
            );

            if (lastPostedIndex === 0) {
              continue; // No new items
            } else if (lastPostedIndex > 0) {
              // Found the last posted item, post everything newer
              itemsToPost = parsed.items.slice(0, lastPostedIndex);
            } else {
              // Last posted item fell off the feed, just post the newest one to avoid spam
              itemsToPost.push(parsed.items[0]);
            }
          }

          if (itemsToPost.length === 0) continue;

          const channel = (await client.channels
            .fetch(feed.channelId)
            .catch(() => null)) as TextChannel;
          if (!channel || !channel.isTextBased()) continue;

          // Post in reverse order to maintain chronological timeline in discord
          for (const item of itemsToPost.reverse()) {
            let messageContent = `New post from ${parsed.title || 'Feed'}: ${item.link}`;
            if (feed.customMessage) {
              messageContent = feed.customMessage
                .replace(/{link}/gi, item.link || '')
                .replace(/{title}/gi, item.title || '')
                .replace(/{author}/gi, item.creator || item.title || '');
            }

            if (feed.mentionRole) {
              messageContent = `<@&${feed.mentionRole}> ${messageContent}`;
            }

            await channel.send({ content: messageContent });
          }

          // Update lastEntryId to the absolute newest item in the feed (which is items[0])
          const newestItem = parsed.items[0] as { guid?: string; id?: string; link?: string };
          await db
            .update(socialFeeds)
            .set({ lastEntryId: newestItem.guid || newestItem.id || newestItem.link })
            .where(eq(socialFeeds.id, feed.id));
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          logger.warn(`Failed to process social feed ${feed.feedUrl}: ${errMsg}`);
          
          // Disable feed if it's completely invalid to prevent log spam
          if (errMsg.includes('not recognized as RSS') || errMsg.includes('404')) {
            try {
              await db.update(socialFeeds).set({ enabled: false }).where(eq(socialFeeds.id, feed.id));
              logger.info(`Automatically disabled invalid social feed: ${feed.feedUrl}`);
            } catch (dbErr) {
              logger.error(`Failed to disable feed ${feed.feedUrl}:`, dbErr);
            }
          }
        }
      }
    } catch (error) {
      logger.error('Error checking social feeds:', error);
    }
  }
}

export const socialFeedService = new SocialFeedService();
