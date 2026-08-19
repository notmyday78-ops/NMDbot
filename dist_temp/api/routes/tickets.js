"use strict";
import { Router } from "express";
import { client } from "../../index";
import { getDatabase } from "../../database/connection";
import { tickets, ticketPanels } from "../../database/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "../../utils/logger";
import { z } from "zod";
import {
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} from "discord.js";
import { crossShardService } from "../../services/crossShardService";
const router = Router();
const createPanelSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().min(1).max(1e3),
  categoryId: z.string(),
  channelId: z.string(),
  welcomeMessage: z.string().max(2e3).optional(),
  buttonLabel: z.string().max(80).optional(),
  buttonEmoji: z.string().optional(),
  buttonStyle: z.number().min(1).max(4).optional(),
  supportRoles: z.array(z.string()).optional(),
  maxTicketsPerUser: z.number().min(1).max(10).optional()
});
const updatePanelSchema = createPanelSchema.partial();
router.post("/:guildId/tickets/panels", async (req, res) => {
  const { guildId } = req.params;
  try {
    const validation = createPanelSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: "Validation Error",
        message: "Invalid request body",
        details: validation.error.errors
      });
    }
    const data = validation.data;
    const guild = await crossShardService.fetchGuild(client, guildId);
    if (!guild) {
      return res.status(404).json({
        error: "Not Found",
        message: "Guild not found"
      });
    }
    const channel = await client.channels.fetch(data.channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Invalid channel ID or channel is not text-based"
      });
    }
    const category = await client.channels.fetch(data.categoryId).catch(() => null);
    if (!category || category.type !== ChannelType.GuildCategory) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Invalid category ID"
      });
    }
    const db = getDatabase();
    const panelId = `panel_${Date.now()}`;
    const [panel] = await db.insert(ticketPanels).values({
      guildId,
      panelId,
      title: data.title,
      description: data.description,
      categoryId: data.categoryId,
      channelId: data.channelId,
      welcomeMessage: data.welcomeMessage || "Thank you for creating a ticket! Support will be with you shortly.",
      buttonLabel: data.buttonLabel || "Create Ticket",
      buttonStyle: data.buttonStyle || 1,
      supportRoles: data.supportRoles || [],
      maxTicketsPerUser: data.maxTicketsPerUser || 3,
      isActive: true,
      createdAt: /* @__PURE__ */ new Date()
    }).returning();
    const embed = new EmbedBuilder().setTitle(data.title).setDescription(data.description).setColor(5793266).setFooter({ text: "Click the button below to create a ticket" });
    const button = new ButtonBuilder().setCustomId(`ticket_create_${panelId}`).setLabel(data.buttonLabel || "Create Ticket").setStyle(data.buttonStyle || ButtonStyle.Primary);
    if (data.buttonEmoji) {
      button.setEmoji(data.buttonEmoji);
    }
    const row = new ActionRowBuilder().addComponents(button);
    try {
      const message = await channel.send({
        embeds: [embed],
        components: [row]
      });
      await db.update(ticketPanels).set({ messageId: message.id }).where(eq(ticketPanels.id, panelId));
      logger.info(`Created ticket panel ${panelId} in guild ${guildId}`);
      return res.status(201).json({
        success: true,
        panel: {
          id: panel.id,
          title: panel.title,
          description: panel.description,
          categoryId: panel.categoryId,
          channelId: panel.channelId,
          messageId: message.id
        }
      });
    } catch (error) {
      await db.delete(ticketPanels).where(eq(ticketPanels.id, panelId));
      throw error;
    }
  } catch (error) {
    logger.error("Error creating ticket panel:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to create ticket panel"
    });
  }
});
router.patch("/:guildId/tickets/panels/:panelId", async (req, res) => {
  const { guildId, panelId } = req.params;
  try {
    const validation = updatePanelSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: "Validation Error",
        message: "Invalid request body",
        details: validation.error.errors
      });
    }
    const db = getDatabase();
    const updates = validation.data;
    const [existingPanel] = await db.select().from(ticketPanels).where(and(eq(ticketPanels.id, panelId), eq(ticketPanels.guildId, guildId))).limit(1);
    if (!existingPanel) {
      return res.status(404).json({
        error: "Not Found",
        message: "Ticket panel not found"
      });
    }
    const [updatedPanel] = await db.update(ticketPanels).set({
      ...updates,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(and(eq(ticketPanels.id, panelId), eq(ticketPanels.guildId, guildId))).returning();
    if ((updates.title || updates.description) && existingPanel.messageId && existingPanel.channelId) {
      const channel = await client.channels.fetch(existingPanel.channelId).catch(() => null);
      if (channel) {
        try {
          const message = await channel.messages.fetch(existingPanel.messageId);
          const embed = new EmbedBuilder().setTitle(updatedPanel.title).setDescription(updatedPanel.description).setColor(5793266).setFooter({ text: "Click the button below to create a ticket" });
          await message.edit({ embeds: [embed] });
        } catch (error) {
          logger.warn(`Could not update panel message: ${error}`);
        }
      }
    }
    logger.info(`Updated ticket panel ${panelId} in guild ${guildId}`);
    return res.json({
      success: true,
      panel: {
        id: updatedPanel.id,
        title: updatedPanel.title,
        description: updatedPanel.description,
        categoryId: updatedPanel.categoryId,
        channelId: updatedPanel.channelId
      }
    });
  } catch (error) {
    logger.error("Error updating ticket panel:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to update ticket panel"
    });
  }
});
router.delete("/:guildId/tickets/panels/:panelId", async (req, res) => {
  const { guildId, panelId } = req.params;
  try {
    const db = getDatabase();
    const [existingPanel] = await db.select().from(ticketPanels).where(and(eq(ticketPanels.id, panelId), eq(ticketPanels.guildId, guildId))).limit(1);
    if (!existingPanel) {
      return res.status(404).json({
        error: "Not Found",
        message: "Ticket panel not found"
      });
    }
    if (existingPanel.messageId && existingPanel.channelId) {
      const channel = await client.channels.fetch(existingPanel.channelId).catch(() => null);
      if (channel) {
        try {
          const message = await channel.messages.fetch(existingPanel.messageId);
          await message.delete();
        } catch (error) {
          logger.warn(`Could not delete panel message: ${error}`);
        }
      }
    }
    await db.delete(ticketPanels).where(and(eq(ticketPanels.id, panelId), eq(ticketPanels.guildId, guildId)));
    logger.info(`Deleted ticket panel ${panelId} from guild ${guildId}`);
    return res.json({
      success: true,
      message: "Ticket panel deleted successfully"
    });
  } catch (error) {
    logger.error("Error deleting ticket panel:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to delete ticket panel"
    });
  }
});
router.post("/:guildId/tickets/:ticketId/close", async (req, res) => {
  const { guildId, ticketId } = req.params;
  const { closedBy, reason } = req.body;
  try {
    const db = getDatabase();
    const [ticket] = await db.select().from(tickets).where(and(eq(tickets.id, ticketId), eq(tickets.guildId, guildId))).limit(1);
    if (!ticket) {
      return res.status(404).json({
        error: "Not Found",
        message: "Ticket not found"
      });
    }
    if (ticket.status === "closed") {
      return res.status(400).json({
        error: "Bad Request",
        message: "Ticket is already closed"
      });
    }
    const guild = await crossShardService.fetchGuild(client, guildId);
    if (!guild) {
      return res.status(404).json({
        error: "Not Found",
        message: "Guild not found"
      });
    }
    await db.update(tickets).set({
      status: "closed",
      closedAt: /* @__PURE__ */ new Date(),
      closedBy: closedBy || null,
      closedReason: reason || null
    }).where(and(eq(tickets.id, ticketId), eq(tickets.guildId, guildId)));
    const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
    if (channel) {
      try {
        if (channel.isTextBased()) {
          const embed = new EmbedBuilder().setTitle("\u{1F512} Ticket Closed").setDescription(reason || "This ticket has been closed.").setColor(16711680).setTimestamp();
          await channel.send({ embeds: [embed] });
          await new Promise((resolve) => setTimeout(resolve, 3e3));
        }
        await channel.delete("Ticket closed");
      } catch (error) {
        logger.warn(`Could not delete ticket channel: ${error}`);
      }
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
    logger.info(`Closed ticket ${ticketId} in guild ${guildId}`);
    return res.json({
      success: true,
      message: "Ticket closed successfully"
    });
  } catch (error) {
    logger.error("Error closing ticket:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to close ticket"
    });
  }
});
router.get("/:guildId/tickets/:ticketId", async (req, res) => {
  const { guildId, ticketId } = req.params;
  try {
    const db = getDatabase();
    const [ticket] = await db.select().from(tickets).where(and(eq(tickets.id, ticketId), eq(tickets.guildId, guildId))).limit(1);
    if (!ticket) {
      return res.status(404).json({
        error: "Not Found",
        message: "Ticket not found"
      });
    }
    return res.json({
      id: ticket.id,
      userId: ticket.userId,
      channelId: ticket.channelId,
      panelId: ticket.panelId,
      status: ticket.status,
      createdAt: ticket.createdAt.toISOString(),
      closedAt: ticket.closedAt?.toISOString() || null,
      closedBy: ticket.closedBy,
      closedReason: ticket.closedReason
    });
  } catch (error) {
    logger.error("Error fetching ticket:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch ticket"
    });
  }
});
export const ticketsRouter = router;
