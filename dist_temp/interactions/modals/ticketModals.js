"use strict";
import { EmbedBuilder } from "discord.js";
import { TicketService } from "../../services/ticketService";
import { TicketRepository } from "../../repositories/ticketRepository";
import { GuildService } from "../../services/guildService";
import { t } from "../../i18n";
export async function handleTicketModal(interaction) {
  const [action, id] = interaction.customId.split(":");
  const ticketService = new TicketService();
  const ticketRepository = new TicketRepository();
  const guildService = new GuildService();
  const locale = await guildService.getGuildLanguage(interaction.guildId);
  try {
    switch (action) {
      case "ticket_modal":
        await handleTicketCreation(interaction, id, ticketService, ticketRepository, locale);
        break;
      case "ticket_close_modal":
        await handleTicketCloseReason(interaction, id, ticketService, ticketRepository, locale);
        break;
    }
  } catch (error) {
    await interaction.reply({
      content: t("common.error", { error: error.message }),
      ephemeral: true
    });
  }
}
async function handleTicketCreation(interaction, panelId, ticketService, ticketRepository, _locale) {
  await interaction.deferReply({ ephemeral: true });
  const reason = interaction.fields.getTextInputValue("reason");
  const panel = await ticketRepository.getPanelById(panelId);
  if (!panel || !panel.isActive) {
    await interaction.editReply({
      content: t("tickets.panelNotFound")
    });
    return;
  }
  try {
    const { ticket, channel } = await ticketService.createTicket(
      interaction,
      {
        ...panel,
        supportRoles: panel.supportRoles || []
      },
      reason
    );
    const embed = new EmbedBuilder().setTitle(t("tickets.ticketCreated", { number: ticket.ticketNumber })).setDescription(t("tickets.ticketCreatedDesc", { channel: channel.toString() })).setColor(65280).setTimestamp();
    await interaction.editReply({
      embeds: [embed]
    });
  } catch (error) {
    await interaction.editReply({
      content: t("common.error", { error: error.message })
    });
  }
}
async function handleTicketCloseReason(interaction, ticketId, ticketService, ticketRepository, locale) {
  await interaction.deferReply();
  const closeReason = interaction.fields.getTextInputValue("closeReason");
  const ticket = await ticketRepository.getTicket(ticketId);
  if (!ticket) {
    await interaction.editReply({
      content: t("tickets.ticketNotFound")
    });
    return;
  }
  try {
    await ticketService.closeTicket(
      ticketId,
      interaction.member,
      closeReason || void 0,
      locale
    );
    await interaction.editReply({
      content: t("tickets.closingWithReason", {
        reason: closeReason || t("common.noReasonProvided")
      })
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
