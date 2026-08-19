"use strict";
import { getDatabase } from "../database/connection";
import { users, guilds } from "../database/schema";
import { eq } from "drizzle-orm";
export async function ensureUserExists(user) {
  const db = getDatabase();
  try {
    await db.insert(users).values({
      id: user.id,
      username: user.username,
      discriminator: user.discriminator,
      globalName: user.globalName,
      avatar: user.avatar,
      avatarUrl: user.displayAvatarURL(),
      bot: user.bot
    }).onConflictDoUpdate({
      target: users.id,
      set: {
        username: user.username,
        discriminator: user.discriminator,
        globalName: user.globalName,
        avatar: user.avatar,
        avatarUrl: user.displayAvatarURL(),
        updatedAt: /* @__PURE__ */ new Date()
      }
    });
  } catch (error) {
    const existingUser = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (existingUser.length === 0) {
      await db.insert(users).values({
        id: user.id,
        username: user.username,
        discriminator: user.discriminator,
        globalName: user.globalName,
        avatar: user.avatar,
        avatarUrl: user.displayAvatarURL(),
        bot: user.bot
      });
    } else {
      await db.update(users).set({
        username: user.username,
        discriminator: user.discriminator,
        globalName: user.globalName,
        avatar: user.avatar,
        avatarUrl: user.displayAvatarURL(),
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq(users.id, user.id));
    }
  }
}
export async function ensureGuildExists(guild) {
  const db = getDatabase();
  try {
    await db.insert(guilds).values({
      id: guild.id
    }).onConflictDoUpdate({
      target: guilds.id,
      set: {
        updatedAt: /* @__PURE__ */ new Date()
      }
    });
  } catch (error) {
    const existingGuild = await db.select().from(guilds).where(eq(guilds.id, guild.id)).limit(1);
    if (existingGuild.length === 0) {
      await db.insert(guilds).values({
        id: guild.id
      });
    }
  }
}
export async function ensureUserAndGuildExist(user, guild) {
  await Promise.all([ensureUserExists(user), ensureGuildExists(guild)]);
}
