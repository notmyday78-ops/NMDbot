"use strict";
import {
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} from "discord.js";
import { TicketService } from "../../services/ticketService";
import { TicketRepository } from "../../repositories/ticketRepository";
import { GuildService } from "../../services/guildService";
import { t } from "../../i18n";
export async function handleTicketButton(interaction) {
  if (!interaction.isRepliable()) {
    return;
  }
  const [action, id] = interaction.customId.split(":");
  const ticketService = new TicketService();
  const ticketRepository = new TicketRepository();
  const guildService = new GuildService();
  const locale = await guildService.getGuildLanguage(interaction.guildId);
  try {
    switch (action) {
      case "ticket_create":
        await handleTicketCreate(interaction, id, ticketService, ticketRepository, locale);
        break;
      case "ticket_close":
        await handleTicketClose(interaction, id, ticketService, ticketRepository, locale);
        break;
      case "ticket_close_reason":
        await handleTicketCloseWithReason(interaction, id, ticketService, locale);
        break;
      case "ticket_lock":
        await handleTicketLock(interaction, id, ticketService, ticketRepository, locale);
        break;
      case "ticket_freeze":
        await handleTicketFreeze(interaction, id, ticketService, ticketRepository, locale);
        break;
      case "ticket_claim":
        await handleTicketClaim(interaction, id, ticketService, ticketRepository, locale);
        break;
    }
  } catch (error) {
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: t("common.error", { error: error.message }),
          ephemeral: true
        });
      } catch (replyError) {
        console.error("Failed to reply to ticket button interaction:", replyError);
      }
    }
  }
}
async function handleTicketCreate(interaction, panelId, ticketService, ticketRepository, locale) {
  const panel = await ticketRepository.getPanelById(panelId);
  if (!panel || !panel.isActive) {
    await interaction.reply({
      content: t("tickets.panelNotFound"),
      ephemeral: true
    });
    return;
  }
  const openTickets = await ticketRepository.getUserOpenTicketsByPanel(
    interaction.user.id,
    panel.id
  );
  if (openTickets.length >= panel.maxTicketsPerUser) {
    await interaction.reply({
      content: t("tickets.maxTicketsReached", { max: panel.maxTicketsPerUser }),
      ephemeral: true
    });
    return;
  }
  const modal = ticketService.createTicketModal(panelId, locale);
  await interaction.showModal(modal);
}
async function handleTicketClose(interaction, ticketId, ticketService, ticketRepository, locale) {
  await interaction.deferReply();
  const ticket = await ticketRepository.getTicket(ticketId);
  if (!ticket) {
    await interaction.editReply({
      content: t("tickets.ticketNotFound")
    });
    return;
  }
  const member = interaction.member;
  const hasPermission = member.permissions.has(PermissionFlagsBits.ManageChannels) || ticket.userId === interaction.user.id;
  if (!hasPermission) {
    await interaction.editReply({
      content: t("common.noPermission")
    });
    return;
  }
  try {
    await ticketService.closeTicket(ticketId, member, void 0, locale);
    await interaction.editReply({
      content: t("tickets.closing")
    });
    setTimeout(async () => {
      try {
        await interaction.channel.delete();
      } catch (error) {
      }
    }, 5e3);
  } catch (error) {
    await interaction.editReply({
      content: t("common.error", { error: error.message })
    });
  }
}
async function handleTicketCloseWithReason(interaction, ticketId, ticketService, locale) {
  const modal = ticketService.createCloseReasonModal(ticketId, locale);
  await interaction.showModal(modal);
}
async function handleTicketLock(interaction, ticketId, ticketService, ticketRepository, locale) {
  await interaction.deferReply();
  const ticket = await ticketRepository.getTicket(ticketId);
  if (!ticket) {
    await interaction.editReply({
      content: t("tickets.ticketNotFound")
    });
    return;
  }
  const member = interaction.member;
  if (!member.permissions.has(PermissionFlagsBits.ManageChannels)) {
    await interaction.editReply({
      content: t("common.noPermission")
    });
    return;
  }
  try {
    await ticketService.lockTicket(ticketId, member, interaction.guild, locale);
    const embed = new EmbedBuilder().setTitle(t("tickets.ticketLocked")).setDescription(t("tickets.ticketLockedDesc")).setColor(16753920).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
    const originalMessage = interaction.message;
    if (originalMessage.editable) {
      const actionRows = originalMessage.components;
      const updatedRows = actionRows.map((row) => {
        const newRow = new ActionRowBuilder();
        for (const component of row.components) {
          if (component.type !== ComponentType.Button) {
            continue;
          }
          const buttonComponent = component;
          const button = ButtonBuilder.from(buttonComponent);
          if (buttonComponent.customId === `ticket_lock:${ticketId}`) {
            button.setDisabled(true).setStyle(ButtonStyle.Secondary);
          }
          newRow.addComponents(button);
        }
        return newRow;
      }).filter((row) => row.components.length > 0);
      if (updatedRows.length > 0) {
        await originalMessage.edit({ components: updatedRows });
      }
    }
  } catch (error) {
    await interaction.editReply({
      content: t("common.error", { error: error.message })
    });
  }
}
async function handleTicketFreeze(interaction, ticketId, ticketService, ticketRepository, locale) {
  await interaction.deferReply();
  const ticket = await ticketRepository.getTicket(ticketId);
  if (!ticket) {
    await interaction.editReply({
      content: t("tickets.ticketNotFound")
    });
    return;
  }
  const member = interaction.member;
  if (!member.permissions.has(PermissionFlagsBits.ManageChannels)) {
    await interaction.editReply({
      content: t("common.noPermission")
    });
    return;
  }
  try {
    await ticketService.freezeTicket(ticketId, member, interaction.guild, locale);
    const embed = new EmbedBuilder().setTitle(t("tickets.ticketFrozen")).setDescription(t("tickets.ticketFrozenDesc")).setColor(49151).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await interaction.editReply({
      content: t("common.error", { error: error.message })
    });
  }
}
async function handleTicketClaim(interaction, ticketId, ticketService, ticketRepository, locale) {
  await interaction.deferReply();
  const ticket = await ticketRepository.getTicket(ticketId);
  if (!ticket) {
    await interaction.editReply({
      content: t("tickets.ticketNotFound")
    });
    return;
  }
  const member = interaction.member;
  const panel = ticket.panelId ? await ticketRepository.getPanelById(ticket.panelId) : null;
  if (panel && panel.supportRoles) {
    const hasSupportRole = panel.supportRoles.some(
      (roleId) => member.roles.cache.has(roleId)
    );
    if (!hasSupportRole && !member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      await interaction.editReply({
        content: t("tickets.notSupportStaff")
      });
      return;
    }
  }
  try {
    await ticketService.claimTicket(ticketId, member, locale);
    const embed = new EmbedBuilder().setTitle(t("tickets.ticketClaimed")).setDescription(t("tickets.claimedBy", { user: member.user.tag })).setColor(65280).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await interaction.editReply({
      content: t("common.error", { error: error.message })
    });
  }
}
