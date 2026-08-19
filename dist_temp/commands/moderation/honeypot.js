"use strict";
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from "discord.js";
import { CommandCategory } from "../../types/command";
import { guildService } from "../../services/guildService";
import { cacheService } from "../../services/cacheService";
import { EmbedFactory } from "../../utils/EmbedFactory";
import { logger } from "../../utils/logger";
export const data = new SlashCommandBuilder().setName("honeypot").setDescription("Configure a honeypot channel to trap scammers.").setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addChannelOption(
  (option) => option.setName("channel").setDescription("The channel to use as a honeypot").addChannelTypes(ChannelType.GuildText).setRequired(true)
);
export const category = CommandCategory.Moderation;
export async function execute(interaction) {
  if (!interaction.guildId) return;
  const channel = interaction.options.getChannel("channel");
  try {
    const settings = await guildService.getGuildSettings(interaction.guildId);
    await guildService.updateGuildSettings(interaction.guildId, {
      ...settings,
      honeypotChannelId: channel?.id
    });
    await cacheService.invalidateGuildSettings(interaction.guildId);
    const embed = EmbedFactory.success(
      `Honeypot channel has been set to <#${channel?.id}>.
Any normal user sending messages here will be instantly timed out for 24 hours.`,
      "\u{1F36F} Honeypot Configured"
    );
    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    logger.error(`Error configuring honeypot for guild ${interaction.guildId}:`, error);
    await interaction.reply({
      embeds: [EmbedFactory.error("An error occurred while configuring the honeypot.")],
      ephemeral: true
    });
  }
}
