import { User, Guild } from 'discord.js';

import { getDatabase } from '../database/connection';
import { users, guilds } from '../database/schema';

import { eq } from 'drizzle-orm';
import { logger } from './logger';

/**
 * Ensures a user exists in the database.
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
    logger.error(
      `FAILED TO UPSERT USER ${user.id}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );

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

        logger.info(`User created using fallback: ${user.id}`);
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

        logger.info(`User updated using fallback: ${user.id}`);
      }
    } catch (fallbackError) {
      logger.error(
        `FALLBACK FAILED FOR USER ${user.id}: ${
          fallbackError instanceof Error
            ? fallbackError.message
            : String(fallbackError)
        }`
      );

      throw fallbackError;
    }
  }
}

/**
 * Ensures a guild exists in the database.
 */
export async function ensureGuildExists(guild: Guild): Promise<void> {
  const db = getDatabase();

  try {
    await db
      .insert(guilds)
      .values({
        id: guild.id,
      })
      .onConflictDoUpdate({
        target: guilds.id,
        set: {
          updatedAt: new Date(),
        },
      });

    logger.debug(`Guild ensured in database: ${guild.id}`);
  } catch (error) {
    logger.error(
      `FAILED TO UPSERT GUILD ${guild.id}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );

    try {
      const existingGuild = await db
        .select()
        .from(guilds)
        .where(eq(guilds.id, guild.id))
        .limit(1);

      if (existingGuild.length === 0) {
        await db.insert(guilds).values({
          id: guild.id,
        });

        logger.info(`Guild created using fallback: ${guild.id}`);
      } else {
        await db
          .update(guilds)
          .set({
            updatedAt: new Date(),
          })
          .where(eq(guilds.id, guild.id));

        logger.info(`Guild updated using fallback: ${guild.id}`);
      }
    } catch (fallbackError) {
      logger.error(
        `FALLBACK FAILED FOR GUILD ${guild.id}: ${
          fallbackError instanceof Error
            ? fallbackError.message
            : String(fallbackError)
        }`
      );

      throw fallbackError;
    }
  }
}

/**
 * Ensures both the user and guild exist.
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
