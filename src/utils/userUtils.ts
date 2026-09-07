```ts
import { User, Guild } from 'discord.js';

import { getDatabase } from '../database/connection';
import { users, guilds } from '../database/schema';

import { eq } from 'drizzle-orm';
import { logger } from './logger';

/**
 * Converts an unknown database error into a useful log message.
 */
function getDatabaseErrorDetails(error: unknown): string {
  if (error instanceof Error) {
    const dbError = error as Error & {
      code?: string;
      detail?: string;
      hint?: string;
      severity?: string;
      position?: string;
      routine?: string;
      cause?: unknown;
    };

    let message = `name=${dbError.name}\n`;
    message += `message=${dbError.message}\n`;

    if (dbError.code) {
      message += `code=${dbError.code}\n`;
    }

    if (dbError.detail) {
      message += `detail=${dbError.detail}\n`;
    }

    if (dbError.hint) {
      message += `hint=${dbError.hint}\n`;
    }

    if (dbError.severity) {
      message += `severity=${dbError.severity}\n`;
    }

    if (dbError.position) {
      message += `position=${dbError.position}\n`;
    }

    if (dbError.routine) {
      message += `routine=${dbError.routine}\n`;
    }

    if (dbError.cause) {
      message += `cause=${String(dbError.cause)}\n`;

      if (dbError.cause instanceof Error) {
        message += `cause.message=${dbError.cause.message}\n`;

        const causeError = dbError.cause as Error & {
          code?: string;
          detail?: string;
          hint?: string;
        };

        if (causeError.code) {
          message += `cause.code=${causeError.code}\n`;
        }

        if (causeError.detail) {
          message += `cause.detail=${causeError.detail}\n`;
        }

        if (causeError.hint) {
          message += `cause.hint=${causeError.hint}\n`;
        }
      }
    }

    return message;
  }

  return String(error);
}

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
      `FAILED TO UPSERT USER ${user.id} (${user.username})\n${getDatabaseErrorDetails(error)}`
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
        `FALLBACK FAILED FOR USER ${user.id} (${user.username})\n${getDatabaseErrorDetails(fallbackError)}`
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
      `FAILED TO UPSERT GUILD ${guild.id}\n${getDatabaseErrorDetails(error)}`
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
        `FALLBACK FAILED FOR GUILD ${guild.id}\n${getDatabaseErrorDetails(fallbackError)}`
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
```
