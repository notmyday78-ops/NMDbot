"use strict";
import {
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  OverwriteType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";
import { TicketRepository } from "../repositories/ticketRepository";
import { ticketWorkflowRepository } from "../repositories/ticketWorkflowRepository";
import { t } from "../i18n";
export class TicketService {
  ticketRepository;
  creationLocks = /* @__PURE__ */ new Set();
  constructor() {
    this.ticketRepository = new TicketRepository();
  }
  // Panel management
  async createPanel(guild, data) {
    const existing = await this.ticketRepository.getPanel(data.panelId, guild.id);
    if (existing) {
      throw new Error(t("common.error"));
    }
    return await this.ticketRepository.createPanel({
      ...data,
      guildId: guild.id
    });
  }
  async getPanel(guild, panelId) {
    return await this.ticketRepository.getPanel(panelId, guild.id);
  }
  async updatePanel(guild, panelId, updates) {
    const updated = await this.ticketRepository.updatePanel(panelId, guild.id, updates);
    if (!updated) {
      throw new Error(t("tickets.panelNotFound"));
    }
    return updated;
  }
  async loadPanel(guild, panelId, channel, _locale) {
    const panel = await this.ticketRepository.getPanel(panelId, guild.id);
    if (!panel) {
      throw new Error(t("tickets.panelNotFound"));
    }
    if (!panel.isActive) {
      throw new Error(t("tickets.panelNotFound"));
    }
    const embed = new EmbedBuilder().setTitle(panel.title).setDescription(panel.description).setColor(5793266);
    if (panel.imageUrl) {
      embed.setImage(panel.imageUrl);
    }
    if (panel.footer) {
      embed.setFooter({ text: panel.footer });
    }
    const button = new ButtonBuilder().setCustomId(`ticket_create:${panel.id}`).setLabel(panel.buttonLabel).setStyle(panel.buttonStyle);
    const row = new ActionRowBuilder().addComponents(button);
    const message = await channel.send({
      embeds: [embed],
      components: [row]
    });
    await this.ticketRepository.setPanelMessage(panelId, guild.id, message.id, channel.id);
    return message;
  }
  async deletePanel(guild, panelId) {
    const panel = await this.ticketRepository.getPanel(panelId, guild.id);
    if (!panel) {
      throw new Error(t("tickets.panelNotFound"));
    }
    if (panel.messageId && panel.channelId) {
      try {
        const channel = await guild.channels.fetch(panel.channelId);
        const message = await channel.messages.fetch(panel.messageId);
        await message.delete();
      } catch (error) {
      }
    }
    return await this.ticketRepository.deletePanel(panelId, guild.id);
  }
  // Ticket creation
  async createTicket(interaction, panel, reason) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error(t("common.guildOnly"));
    }
    const member = interaction.member;
    const lockKey = `${panel.id}:${member.id}`;
    if (this.creationLocks.has(lockKey)) {
      throw new Error("Please wait, a ticket is already being created for you.");
    }
    this.creationLocks.add(lockKey);
    try {
      const openTickets = await this.ticketRepository.getUserOpenTicketsByPanel(
        member.id,
        panel.id
      );
      if (openTickets.length >= panel.maxTicketsPerUser) {
        throw new Error(t("tickets.maxTicketsReached", { max: panel.maxTicketsPerUser }));
      }
      const ticketNumber = await this.ticketRepository.getNextTicketNumber(guild.id);
      const ticketName = (panel.ticketNameFormat ?? "ticket-{number}").replace(
        "{number}",
        ticketNumber.toString()
      );
      let category = null;
      if (panel.categoryId) {
        try {
          category = await guild.channels.fetch(panel.categoryId);
        } catch (error) {
        }
      }
      const ticketChannel = await guild.channels.create({
        name: ticketName,
        type: ChannelType.GuildText,
        parent: category?.id,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [PermissionFlagsBits.ViewChannel],
            type: OverwriteType.Role
          },
          {
            id: member.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.EmbedLinks
            ],
            type: OverwriteType.Member
          },
          // Add support roles
          ...Array.from(new Set(panel.supportRoles ?? [])).filter((roleId) => guild.roles.cache.has(roleId)).map((roleId) => ({
            id: roleId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.EmbedLinks,
              PermissionFlagsBits.ManageMessages
            ],
            type: OverwriteType.Role
          }))
        ]
      });
      const ticket = await this.ticketRepository.createTicket({
        guildId: guild.id,
        panelId: panel.id,
        userId: member.id,
        channelId: ticketChannel.id,
        reason,
        ticketNumber
      });
      const ticketEmbed = new EmbedBuilder().setTitle(t("tickets.ticketCreated", { number: ticketNumber })).setDescription(panel.welcomeMessage || t("tickets.welcomeMessage")).addFields([
        {
          name: t("tickets.createdBy"),
          value: `<@${member.id}>`,
          inline: true
        },
        {
          name: t("tickets.reason"),
          value: reason || t("tickets.noReason"),
          inline: false
        }
      ]).setColor(65280).setTimestamp();
      const controlButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ticket_close:${ticket.id}`).setLabel(t("tickets.close")).setStyle(ButtonStyle.Danger).setEmoji("\u{1F512}"),
        new ButtonBuilder().setCustomId(`ticket_close_reason:${ticket.id}`).setLabel(t("tickets.closeWithReason")).setStyle(ButtonStyle.Danger).setEmoji("\u{1F4DD}"),
        new ButtonBuilder().setCustomId(`ticket_lock:${ticket.id}`).setLabel(t("tickets.lock")).setStyle(ButtonStyle.Secondary).setEmoji("\u{1F510}"),
        new ButtonBuilder().setCustomId(`ticket_freeze:${ticket.id}`).setLabel(t("tickets.freeze")).setStyle(ButtonStyle.Secondary).setEmoji("\u2744\uFE0F"),
        new ButtonBuilder().setCustomId(`ticket_claim:${ticket.id}`).setLabel(t("tickets.claim")).setStyle(ButtonStyle.Primary).setEmoji("\u{1F64B}")
      );
      const supportPings = (panel.supportRoles ?? []).map((roleId) => `<@&${roleId}>`).join(" ");
      await ticketChannel.send({
        content: supportPings,
        embeds: [ticketEmbed],
        components: [controlButtons]
      });
      await this.ticketRepository.addTicketMessage(
        ticket.id,
        member.id,
        t("tickets.ticketCreatedLog", { user: member.user.tag, reason })
      );
      return { ticket, channel: ticketChannel };
    } finally {
      this.creationLocks.delete(lockKey);
    }
  }
  // Ticket actions
  async claimTicket(ticketId, claimedBy, _locale) {
    const ticket = await this.ticketRepository.getTicket(ticketId);
    if (!ticket) {
      throw new Error(t("tickets.ticketNotFound"));
    }
    if (ticket.status !== "open") {
      throw new Error(t("tickets.alreadyClaimed"));
    }
    await this.ticketRepository.updateTicketStatus(ticketId, "claimed", claimedBy.id);
    await this.ticketRepository.addTicketMessage(
      ticketId,
      claimedBy.id,
      t("tickets.claimedBy", { user: claimedBy.user.tag })
    );
    return ticket;
  }
  async closeTicket(ticketId, closedBy, reason, _locale) {
    const ticket = await this.ticketRepository.getTicket(ticketId);
    if (!ticket) {
      throw new Error(t("tickets.ticketNotFound"));
    }
    if (ticket.status === "closed") {
      throw new Error(t("common.error"));
    }
    const messages = await this.ticketRepository.getTicketMessages(ticketId);
    const transcript = this.generateTranscript(messages, ticket);
    await this.ticketRepository.closeTicket(ticketId, closedBy.id, reason);
    await this.ticketRepository.setTicketTranscript(ticketId, transcript);
    await this.ticketRepository.addTicketMessage(
      ticketId,
      closedBy.id,
      t("tickets.closedBy", {
        user: closedBy.user.tag,
        reason: reason || "No reason provided"
      })
    );
    return { ticket, transcript };
  }
  async lockTicket(ticketId, lockedBy, guild, _locale) {
    const ticket = await this.ticketRepository.getTicket(ticketId);
    if (!ticket) {
      throw new Error(t("tickets.ticketNotFound"));
    }
    if (ticket.status === "closed") {
      throw new Error(t("common.error"));
    }
    const channel = await guild.channels.fetch(ticket.channelId);
    await channel.permissionOverwrites.edit(ticket.userId, {
      SendMessages: false
    });
    await this.ticketRepository.updateTicketStatus(ticketId, "locked", lockedBy.id);
    await this.ticketRepository.addTicketMessage(
      ticketId,
      lockedBy.id,
      t("tickets.lockedBy", { user: lockedBy.user.tag })
    );
    return ticket;
  }
  async freezeTicket(ticketId, frozenBy, guild, _locale) {
    const ticket = await this.ticketRepository.getTicket(ticketId);
    if (!ticket) {
      throw new Error(t("tickets.ticketNotFound"));
    }
    if (ticket.status === "closed") {
      throw new Error(t("common.error"));
    }
    const channel = await guild.channels.fetch(ticket.channelId);
    const panel = ticket.panelId ? await this.ticketRepository.getPanelById(ticket.panelId) : null;
    await channel.permissionOverwrites.edit(ticket.userId, {
      SendMessages: false
    });
    const rolesToFreeze = /* @__PURE__ */ new Set();
    if (panel && panel.supportRoles) {
      for (const roleId of panel.supportRoles) {
        rolesToFreeze.add(roleId);
      }
    }
    if (ticket.departmentId && panel) {
      const department = await ticketWorkflowRepository.getDepartment(
        guild.id,
        panel.id,
        ticket.departmentId
      );
      if (department && department.supportRoles) {
        for (const roleId of department.supportRoles) {
          rolesToFreeze.add(roleId);
        }
      }
    }
    for (const roleId of rolesToFreeze) {
      if (guild.roles.cache.has(roleId)) {
        await channel.permissionOverwrites.edit(roleId, {
          SendMessages: false
        });
      }
    }
    await this.ticketRepository.updateTicketStatus(ticketId, "frozen", frozenBy.id);
    await this.ticketRepository.addTicketMessage(
      ticketId,
      frozenBy.id,
      t("tickets.frozenBy", { user: frozenBy.user.tag })
    );
    return ticket;
  }
  // Helper methods
  generateTranscript(messages, ticket) {
    let transcript = `Ticket #${ticket.ticketNumber} Transcript
`;
    transcript += `Created: ${ticket.createdAt instanceof Date ? ticket.createdAt.toISOString() : ticket.createdAt}
`;
    transcript += `Closed: ${(/* @__PURE__ */ new Date()).toISOString()}
`;
    transcript += `User: ${ticket.userId}
`;
    transcript += `Reason: ${ticket.reason || "No reason provided"}

`;
    transcript += `Messages:
`;
    transcript += `${"=".repeat(50)}

`;
    for (const msg of messages) {
      transcript += `[${msg.createdAt instanceof Date ? msg.createdAt.toISOString() : msg.createdAt}] ${msg.userId}: ${msg.content}
`;
      if (msg.attachments && Array.isArray(msg.attachments) && msg.attachments.length > 0) {
        transcript += `Attachments: ${JSON.stringify(msg.attachments)}
`;
      }
      transcript += "\n";
    }
    return transcript;
  }
  // Modal builders
  createTicketModal(panelId, _locale) {
    const modal = new ModalBuilder().setCustomId(`ticket_modal:${panelId}`).setTitle(t("tickets.createTicket"));
    const reasonInput = new TextInputBuilder().setCustomId("reason").setLabel(t("tickets.reasonLabel")).setStyle(TextInputStyle.Paragraph).setPlaceholder(t("tickets.reasonPlaceholder")).setRequired(true).setMinLength(10).setMaxLength(1e3);
    const row = new ActionRowBuilder().addComponents(reasonInput);
    modal.addComponents(row);
    return modal;
  }
  createCloseReasonModal(ticketId, _locale) {
    const modal = new ModalBuilder().setCustomId(`ticket_close_modal:${ticketId}`).setTitle(t("tickets.closeTicket"));
    const reasonInput = new TextInputBuilder().setCustomId("closeReason").setLabel(t("tickets.closeReasonLabel")).setStyle(TextInputStyle.Paragraph).setPlaceholder(t("tickets.closeReasonPlaceholder")).setRequired(false).setMaxLength(1e3);
    const row = new ActionRowBuilder().addComponents(reasonInput);
    modal.addComponents(row);
    return modal;
  }
}
