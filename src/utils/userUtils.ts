import { User, Guild } from 'discord.js';

import { getDatabase } from '../database/connection';
import { users, guilds } from '../database/schema';

import { eq } from 'drizzle-orm';
import { logger } from './logger';

/**
 * Ensures a user exists in the database.
 * If the user already exists, their Discord information is updated.
 */
export async function ensureUserExists(user: User): Promise<void> {
  const db = getDatabase();

  try {
    await db
      .insert(users)
      .values({
        id: user.id,
        username: user.username,
        discriminator: user.discriminator,
        globalName: user.globalName,
        avatar: user.avatar,
        avatarUrl: user.displayAvatarURL(),
        bot: user.bot,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          username: user.username,
          discriminator: user.discriminator,
          globalName: user.globalName,
          avatar: user.avatar,
          avatarUrl: user.displayAvatarURL(),
          updatedAt: new Date(),
        },
      });

    logger.debug(`User ensured in database: ${user.id}`);
  } catch (error) {
    /*
     * IMPORTANT:
     * Log the original database error.
     * This allows us to see the actual PostgreSQL error instead
     * of only getting "Failed query".
     */
    logger.error(`Failed to upsert user ${user.id}:`, error);

    /*
     * Fallback:
     * Check whether the user already exists.
     */
    try {
      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);

      if (existingUser.length === 0) {
        await db.insert(users).values({
          id: user.id,
          username: user.username,
          discriminator: user.discriminator,
          globalName: user.globalName,
          avatar: user.avatar,
          avatarUrl: user.displayAvatarURL(),
          bot: user.bot,
        });

        logger.info(`User created in database using fallback: ${user.id}`);
      } else {
        await db
          .update(users)
          .set({
            username: user.username,
            discriminator: user.discriminator,
            globalName: user.globalName,
            avatar: user.avatar,
            avatarUrl: user.displayAvatarURL(),
            updatedAt: new Date(),
          })
          .where(eq(users.id, user.id));

        logger.info(`User updated in database using fallback: ${user.id}`);
      }
    } catch (fallbackError) {
      logger.error(
        `Fallback database operation also failed for user ${user.id}:`,
        fallbackError
      );

      throw fallbackError;
    }
  }
}

/**
 * Ensures a guild exists in the database.
 * Creates the guild if it doesn't exist.
 */
export async function ensureGuildExists(guild: Guild): Promise<void> {
  const db = getDatabase();

  try {
    await db
      .insert(guilds)
      .values({
        id: guild.id,
        name: guild.name,
        icon: guild.icon,
      })
      .onConflictDoUpdate({
        target: guilds.id,
        set: {
          name: guild.name,
          icon: guild.icon,
          updatedAt: new Date(),
        },
      });

    logger.debug(`Guild ensured in database: ${guild.id}`);
  } catch (error) {
    logger.error(`Failed to upsert guild ${guild.id}:`, error);

    /*
     * Fallback for guilds.
     */
    try {
      const existingGuild = await db
        .select()
        .from(guilds)
        .where(eq(guilds.id, guild.id))
        .limit(1);

      if (existingGuild.length === 0) {
        await db.insert(guilds).values({
          id: guild.id,
          name: guild.name,
          icon: guild.icon,
        });

        logger.info(`Guild created in database using fallback: ${guild.id}`);
      } else {
        await db
          .update(guilds)
          .set({
            name: guild.name,
            icon: guild.icon,
            updatedAt: new Date(),
          })
          .where(eq(guilds.id, guild.id));

        logger.info(`Guild updated in database using fallback: ${guild.id}`);
      }
    } catch (fallbackError) {
      logger.error(
        `Fallback database operation also failed for guild ${guild.id}:`,
        fallbackError
      );

      throw fallbackError;
    }
  }
}

/**
 * Ensures both the user and guild exist in the database.
 */
export async function ensureUserAndGuildExist(
  user: User,
  guild: Guild
): Promise<void> {
  await Promise.all([
    ensureUserExists(user),
    ensureGuildExists(guild),
  ]);
}
