import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, ChannelType } from 'discord.js';
import { CommandCategory } from '../../types/command';
import { guildService } from '../../services/guildService';
import { cacheService } from '../../services/cacheService';
import { EmbedFactory } from '../../utils/EmbedFactory';
import { logger } from '../../utils/logger';

export const data = new SlashCommandBuilder()
  .setName('honeypot')
  .setDescription('Configure a honeypot channel to trap scammers.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption(option => 
    option.setName('channel')
      .setDescription('The channel to use as a honeypot (leave empty to disable)')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(false)
  );

export const category = CommandCategory.Moderation;

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) return;

  const channel = interaction.options.getChannel('channel');

  try {
    // Save to database
    await guildService.updateGuildSettings(interaction.guildId, {
      honeypotChannelId: (channel?.id || null) as any
    });

    // Invalidate the cache to ensure messageCreate uses the new settings instantly
    await cacheService.invalidateGuildSettings(interaction.guildId);

    const embed = channel 
      ? EmbedFactory.success(
          `Honeypot channel has been set to <#${channel.id}>.\nAny normal user sending messages here will be instantly timed out for 24 hours.`,
          '🍯 Honeypot Configured'
        )
      : EmbedFactory.success(
          'Honeypot channel has been disabled.',
          '🍯 Honeypot Disabled'
        );

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    logger.error(`Error configuring honeypot for guild ${interaction.guildId}:`, error);
    await interaction.reply({ 
      embeds: [EmbedFactory.error('An error occurred while configuring the honeypot.')], 
      ephemeral: true 
    });
  }
}
