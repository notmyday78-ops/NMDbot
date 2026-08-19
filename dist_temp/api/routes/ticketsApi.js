"use strict";
import { Router } from "express";
import { client } from "../../index";
import { getDatabase } from "../../database/connection";
import { tickets } from "../../database/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "../../utils/logger";
import { EmbedBuilder } from "discord.js";
import { crossShardService } from "../../services/crossShardService";
const router = Router();
function getTicketParams(req) {
  const ticketId = req.body.ticketId || req.query.ticketId;
  const guildId = req.body.guildId || req.query.guildId;
  const reason = req.body.reason || req.query.reason;
  const userId = req.body.userId || req.body.closedBy || req.body.lockedBy || req.body.frozenBy || req.body.claimedBy || req.query.userId;
  return { ticketId, guildId, reason, userId };
}
const handleClose = async (req, res) => {
  const { ticketId, guildId, reason, userId } = getTicketParams(req);
  if (!ticketId) {
    return res.status(400).json({ error: "Bad Request", message: "ticketId is required" });
  }
  try {
    const db = getDatabase();
    const whereClause = guildId ? and(eq(tickets.id, ticketId), eq(tickets.guildId, guildId)) : eq(tickets.id, ticketId);
    const [ticket] = await db.select().from(tickets).where(whereClause).limit(1);
    if (!ticket) {
      return res.status(404).json({ error: "Not Found", message: "Ticket not found" });
    }
    if (ticket.status === "closed") {
      return res.status(400).json({ error: "Bad Request", message: "Ticket is already closed" });
    }
    const [updatedTicket] = await db.update(tickets).set({
      status: "closed",
      closedAt: /* @__PURE__ */ new Date(),
      closedBy: userId || null,
      closedReason: reason || null,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq(tickets.id, ticket.id)).returning();
    const guild = await crossShardService.fetchGuild(client, ticket.guildId);
    if (guild) {
      try {
        const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
        if (channel && channel.isTextBased()) {
          const embed = new EmbedBuilder().setTitle("\u{1F512} Ticket Closed").setDescription(
            reason ? `Reason: ${reason}` : "This ticket has been closed via the dashboard."
          ).setColor(16711680).setTimestamp();
          await channel.send({ embeds: [embed] });
          await new Promise((resolve) => setTimeout(resolve, 3e3));
          await channel.delete("Ticket closed via dashboard");
        }
      } catch (error) {
        logger.warn(`Could not delete ticket channel: ${error}`);
      }
      try {
        const user = await client.users.fetch(ticket.userId);
        await user.send({
          embeds: [
            {
              title: "\u{1F3AB} Ticket Closed",
              description: `Your ticket in **${guild.name}** has been closed.`,
              fields: reason ? [{ name: "Reason", value: reason }] : [],
              color: 16711680,
              timestamp: (/* @__PURE__ */ new Date()).toISOString()
            }
          ]
        });
      } catch (error) {
        logger.warn(`Could not DM user about ticket closure: ${error}`);
      }
    }
    logger.info(`Dashboard closed ticket ${ticket.id}`);
    return res.json({
      success: true,
      message: "Ticket closed successfully",
      ticket: updatedTicket
    });
  } catch (error) {
    logger.error("Error closing ticket via dashboard:", error);
    return res.status(500).json({ error: "Internal Server Error", message: "Failed to close ticket" });
  }
};
router.post("/close", handleClose);
router.patch("/close", handleClose);
const handleLock = async (req, res) => {
  const { ticketId, guildId, reason, userId } = getTicketParams(req);
  if (!ticketId) {
    return res.status(400).json({ error: "Bad Request", message: "ticketId is required" });
  }
  try {
    const db = getDatabase();
    const whereClause = guildId ? and(eq(tickets.id, ticketId), eq(tickets.guildId, guildId)) : eq(tickets.id, ticketId);
    const [ticket] = await db.select().from(tickets).where(whereClause).limit(1);
    if (!ticket) {
      return res.status(404).json({ error: "Not Found", message: "Ticket not found" });
    }
    if (ticket.status === "closed") {
      return res.status(400).json({ error: "Bad Request", message: "Cannot lock a closed ticket" });
    }
    const [updatedTicket] = await db.update(tickets).set({
      status: "locked",
      lockedAt: /* @__PURE__ */ new Date(),
      lockedBy: userId || null,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq(tickets.id, ticket.id)).returning();
    const guild = await crossShardService.fetchGuild(client, ticket.guildId);
    if (guild) {
      try {
        const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
        if (channel && channel.isTextBased()) {
          await channel.permissionOverwrites.edit(ticket.userId, { SendMessages: false });
          const embed = new EmbedBuilder().setTitle("\u{1F512} Ticket Locked").setDescription(
            reason ? `This ticket has been locked. Reason: ${reason}` : "This ticket has been locked by a moderator."
          ).setColor(16753920).setTimestamp();
          await channel.send({ embeds: [embed] });
        }
      } catch (error) {
        logger.warn(`Could not lock ticket channel permissions: ${error}`);
      }
    }
    logger.info(`Dashboard locked ticket ${ticket.id}`);
    return res.json({
      success: true,
      message: "Ticket locked successfully",
      ticket: updatedTicket
    });
  } catch (error) {
    logger.error("Error locking ticket via dashboard:", error);
    return res.status(500).json({ error: "Internal Server Error", message: "Failed to lock ticket" });
  }
};
router.post("/lock", handleLock);
router.patch("/lock", handleLock);
const handleFreeze = async (req, res) => {
  const { ticketId, guildId, reason, userId } = getTicketParams(req);
  if (!ticketId) {
    return res.status(400).json({ error: "Bad Request", message: "ticketId is required" });
  }
  try {
    const db = getDatabase();
    const whereClause = guildId ? and(eq(tickets.id, ticketId), eq(tickets.guildId, guildId)) : eq(tickets.id, ticketId);
    const [ticket] = await db.select().from(tickets).where(whereClause).limit(1);
    if (!ticket) {
      return res.status(404).json({ error: "Not Found", message: "Ticket not found" });
    }
    if (ticket.status === "closed") {
      return res.status(400).json({ error: "Bad Request", message: "Cannot freeze a closed ticket" });
    }
    const [updatedTicket] = await db.update(tickets).set({
      status: "frozen",
      frozenAt: /* @__PURE__ */ new Date(),
      frozenBy: userId || null,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq(tickets.id, ticket.id)).returning();
    const guild = await crossShardService.fetchGuild(client, ticket.guildId);
    if (guild) {
      try {
        const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
        if (channel && channel.isTextBased()) {
          await channel.permissionOverwrites.edit(ticket.userId, {
            SendMessages: false,
            AddReactions: false
          });
          const embed = new EmbedBuilder().setTitle("\u2744\uFE0F Ticket Frozen").setDescription(
            reason ? `This ticket has been frozen. Reason: ${reason}` : "This ticket has been frozen pending further administrative review."
          ).setColor(65535).setTimestamp();
          await channel.send({ embeds: [embed] });
        }
      } catch (error) {
        logger.warn(`Could not freeze ticket channel permissions: ${error}`);
      }
    }
    logger.info(`Dashboard frozen ticket ${ticket.id}`);
    return res.json({
      success: true,
      message: "Ticket frozen successfully",
      ticket: updatedTicket
    });
  } catch (error) {
    logger.error("Error freezing ticket via dashboard:", error);
    return res.status(500).json({ error: "Internal Server Error", message: "Failed to freeze ticket" });
  }
};
router.post("/freeze", handleFreeze);
router.patch("/freeze", handleFreeze);
const handleClaim = async (req, res) => {
  const { ticketId, guildId, userId } = getTicketParams(req);
  if (!ticketId) {
    return res.status(400).json({ error: "Bad Request", message: "ticketId is required" });
  }
  if (!userId) {
    return res.status(400).json({ error: "Bad Request", message: "userId / claimedBy is required to claim a ticket" });
  }
  try {
    const db = getDatabase();
    const whereClause = guildId ? and(eq(tickets.id, ticketId), eq(tickets.guildId, guildId)) : eq(tickets.id, ticketId);
    const [ticket] = await db.select().from(tickets).where(whereClause).limit(1);
    if (!ticket) {
      return res.status(404).json({ error: "Not Found", message: "Ticket not found" });
    }
    if (ticket.status === "closed") {
      return res.status(400).json({ error: "Bad Request", message: "Cannot claim a closed ticket" });
    }
    const [updatedTicket] = await db.update(tickets).set({
      status: "claimed",
      claimedBy: userId,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq(tickets.id, ticket.id)).returning();
    const guild = await crossShardService.fetchGuild(client, ticket.guildId);
    if (guild) {
      try {
        const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
        if (channel && channel.isTextBased()) {
          const embed = new EmbedBuilder().setTitle("\u{1F44B} Ticket Claimed").setDescription(
            `This ticket has been claimed by <@${userId}>. They will be assisting you shortly.`
          ).setColor(5793266).setTimestamp();
          await channel.send({ embeds: [embed] });
        }
      } catch (error) {
        logger.warn(`Could not send claim message to ticket channel: ${error}`);
      }
    }
    logger.info(`Dashboard user ${userId} claimed ticket ${ticket.id}`);
    return res.json({
      success: true,
      message: "Ticket claimed successfully",
      ticket: updatedTicket
    });
  } catch (error) {
    logger.error("Error claiming ticket via dashboard:", error);
    return res.status(500).json({ error: "Internal Server Error", message: "Failed to claim ticket" });
  }
};
router.post("/claim", handleClaim);
router.patch("/claim", handleClaim);
export const ticketsApiRouter = router;
