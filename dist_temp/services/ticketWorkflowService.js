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
  TextInputStyle,
  StringSelectMenuBuilder
} from "discord.js";
import { ticketWorkflowRepository } from "../repositories/ticketWorkflowRepository";
import { ticketRepository } from "../repositories/ticketRepository";
import { t } from "../i18n";
export class TicketWorkflowService {
  creationLocks = /* @__PURE__ */ new Set();
  async sendPanelWithDepartments(guild, channel, panelCustomId) {
    const panel = await ticketWorkflowRepository.getPanelByCustomId(guild.id, panelCustomId);
    if (!panel || !panel.isActive) {
      throw new Error(t("tickets.panelNotFound"));
    }
    const departments = await ticketWorkflowRepository.listDepartmentsByPanel(guild.id, panel.id);
    const embed = new EmbedBuilder().setTitle(panel.title).setDescription(panel.description).setColor(5793266);
    if (panel.imageUrl) embed.setImage(panel.imageUrl);
    if (panel.footer) embed.setFooter({ text: panel.footer });
    const components = [];
    if (departments.length > 0) {
      const selectMenu = new StringSelectMenuBuilder().setCustomId(`ticket_dept_select:${panel.id}`).setPlaceholder(t("tickets.selectDepartment")).addOptions(
        departments.map((dept) => ({
          label: dept.name,
          description: dept.description,
          value: dept.departmentId,
          emoji: dept.emoji || void 0
        }))
      );
      components.push(new ActionRowBuilder().addComponents(selectMenu));
    } else {
      const button = new ButtonBuilder().setCustomId(`ticket_create:${panel.id}`).setLabel(panel.buttonLabel).setStyle(panel.buttonStyle);
      components.push(new ActionRowBuilder().addComponents(button));
    }
    const message = await channel.send({
      embeds: [embed],
      components
    });
    await ticketRepository.setPanelMessage(panel.panelId, guild.id, message.id, channel.id);
  }
  async handleDepartmentSelect(interaction, panelDbId, departmentId) {
    const guild = interaction.guild;
    const department = await ticketWorkflowRepository.getDepartment(
      guild.id,
      panelDbId,
      departmentId
    );
    if (!department) {
      await interaction.reply({ content: t("tickets.departmentNotFound"), ephemeral: true });
      return;
    }
    const modal = new ModalBuilder().setCustomId(`ticket_modal_dept:${panelDbId}:${department.departmentId}`).setTitle(t("tickets.createTicketDept", { dept: department.name }));
    const modalFields = department.modalFields && department.modalFields.length > 0 ? department.modalFields : [
      {
        customId: "reason",
        label: t("tickets.reasonLabel"),
        style: TextInputStyle.Paragraph,
        placeholder: t("tickets.reasonPlaceholder"),
        required: true,
        minLength: 10,
        maxLength: 1e3
      }
    ];
    for (const field of modalFields) {
      const input = new TextInputBuilder().setCustomId(field.customId).setLabel(field.label).setStyle(field.style === "Short" ? TextInputStyle.Short : TextInputStyle.Paragraph).setPlaceholder(field.placeholder || "").setRequired(field.required ?? true);
      if (field.minLength) input.setMinLength(field.minLength);
      if (field.maxLength) input.setMaxLength(field.maxLength);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
    }
    await interaction.showModal(modal);
  }
  async createDepartmentTicket(interaction, panelDbId, departmentId, reason) {
    const guild = interaction.guild;
    const member = interaction.member;
    const panel = await ticketRepository.getPanelById(panelDbId);
    if (!panel) throw new Error(t("tickets.panelNotFound"));
    const department = await ticketWorkflowRepository.getDepartment(
      guild.id,
      panel.id,
      departmentId
    );
    if (!department) throw new Error(t("tickets.departmentNotFound"));
    const lockKey = `${panel.id}:${member.id}`;
    if (this.creationLocks.has(lockKey)) {
      throw new Error("Please wait, a ticket is already being created for you.");
    }
    this.creationLocks.add(lockKey);
    try {
      const openTickets = await ticketRepository.getUserOpenTicketsByPanel(member.id, panel.id);
      if (openTickets.length >= panel.maxTicketsPerUser) {
        throw new Error(t("tickets.maxTicketsReached", { max: panel.maxTicketsPerUser }));
      }
      const ticketNumber = await ticketRepository.getNextTicketNumber(guild.id);
      const ticketName = (panel.ticketNameFormat ?? "ticket-{number}").replace(
        "{number}",
        ticketNumber.toString()
      );
      let category = null;
      const categoryId = department.categoryId || panel.categoryId;
      if (categoryId) {
        try {
          category = await guild.channels.fetch(categoryId);
        } catch (error) {
        }
      }
      const supportRoles = Array.from(
        /* @__PURE__ */ new Set([...department.supportRoles ?? [], ...panel.supportRoles ?? []])
      ).filter((roleId) => guild.roles.cache.has(roleId));
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
          ...supportRoles.map((roleId) => ({
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
      const ticket = await ticketRepository.createTicket({
        guildId: guild.id,
        panelId: panel.id,
        userId: member.id,
        channelId: ticketChannel.id,
        reason,
        ticketNumber
      });
      await ticketWorkflowRepository.updateTicketDepartment(ticket.id, department.id);
      const ticketEmbed = new EmbedBuilder().setTitle(t("tickets.ticketCreatedDept", { number: ticketNumber, dept: department.name })).setDescription(
        department.welcomeMessage || panel.welcomeMessage || t("tickets.welcomeMessage")
      ).addFields([
        { name: t("tickets.createdBy"), value: `<@${member.id}>`, inline: true },
        { name: t("tickets.department"), value: department.name, inline: true },
        { name: t("tickets.reason"), value: reason || t("tickets.noReason"), inline: false }
      ]).setColor(65280).setTimestamp();
      const controlButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ticket_close:${ticket.id}`).setLabel(t("tickets.close")).setStyle(ButtonStyle.Danger).setEmoji("\u{1F512}"),
        new ButtonBuilder().setCustomId(`ticket_close_reason:${ticket.id}`).setLabel(t("tickets.closeWithReason")).setStyle(ButtonStyle.Danger).setEmoji("\u{1F4DD}"),
        new ButtonBuilder().setCustomId(`ticket_lock:${ticket.id}`).setLabel(t("tickets.lock")).setStyle(ButtonStyle.Secondary).setEmoji("\u{1F510}"),
        new ButtonBuilder().setCustomId(`ticket_freeze:${ticket.id}`).setLabel(t("tickets.freeze")).setStyle(ButtonStyle.Secondary).setEmoji("\u2744\uFE0F"),
        new ButtonBuilder().setCustomId(`ticket_claim:${ticket.id}`).setLabel(t("tickets.claim")).setStyle(ButtonStyle.Primary).setEmoji("\u{1F64B}")
      );
      const ratingButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ticket_rate:${ticket.id}:5`).setLabel("\u2B50\u2B50\u2B50\u2B50\u2B50").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`ticket_rate:${ticket.id}:4`).setLabel("\u2B50\u2B50\u2B50\u2B50").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`ticket_rate:${ticket.id}:3`).setLabel("\u2B50\u2B50\u2B50").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`ticket_rate:${ticket.id}:2`).setLabel("\u2B50\u2B50").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`ticket_rate:${ticket.id}:1`).setLabel("\u2B50").setStyle(ButtonStyle.Danger)
      );
      const supportPings = supportRoles.map((roleId) => `<@&${roleId}>`).join(" ");
      await ticketChannel.send({
        content: supportPings,
        embeds: [ticketEmbed],
        components: [controlButtons, ratingButtons]
      });
      await ticketRepository.addTicketMessage(
        ticket.id,
        member.id,
        t("tickets.ticketCreatedLog", { user: member.user.tag, reason })
      );
      return { ticket, channel: ticketChannel };
    } finally {
      this.creationLocks.delete(lockKey);
    }
  }
  async handleTicketRating(interaction, ticketId, rating) {
    const ticket = await ticketWorkflowRepository.getTicket(ticketId);
    if (!ticket) {
      await interaction.reply({ content: t("tickets.ticketNotFound"), ephemeral: true });
      return;
    }
    if (ticket.userId !== interaction.user.id) {
      await interaction.reply({ content: t("tickets.creatorOnlyRate"), ephemeral: true });
      return;
    }
    const existingRating = await ticketWorkflowRepository.getTicketRating(ticketId);
    if (existingRating) {
      await interaction.reply({ content: t("tickets.alreadyRated"), ephemeral: true });
      return;
    }
    await ticketWorkflowRepository.createTicketRating({
      guildId: ticket.guildId,
      ticketId,
      userId: interaction.user.id,
      claimedBy: ticket.claimedBy ?? void 0,
      rating
    });
    await interaction.reply({ content: t("tickets.ratingSuccess", { rating }), ephemeral: true });
  }
  async checkSlaTimeouts(_guild) {
  }
}
export const ticketWorkflowService = new TicketWorkflowService();
