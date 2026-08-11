import { ActionRow, MessageActionRowComponent,  GuildMember,
  ButtonInteraction,
  TextChannel,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import { TicketService } from '../../services/ticketService';
import { TicketRepository } from '../../repositories/ticketRepository';
import { GuildService } from '../../services/guildService';
import { t } from '../../i18n';

export async function handleTicketButton(interaction: ButtonInteraction): Promise<void> {
  // Check if interaction is still valid (not timed out)
  if (!interaction.isRepliable()) {
    return; // Interaction has expired, silently fail
  }

  const [action, id] = interaction.customId.split(':');
  const ticketService = new TicketService();
  const ticketRepository = new TicketRepository();
  const guildService = new GuildService();
  const locale = await guildService.getGuildLanguage(interaction.guildId!);

  try {
    switch (action) {
      case 'ticket_create':
        await handleTicketCreate(interaction, id, ticketService, ticketRepository, locale);
        break;
      case 'ticket_close':
        await handleTicketClose(interaction, id, ticketService, ticketRepository, locale);
        break;
      case 'ticket_close_reason':
        await handleTicketCloseWithReason(interaction, id, ticketService, locale);
        break;
      case 'ticket_lock':
        await handleTicketLock(interaction, id, ticketService, ticketRepository, locale);
        break;
      case 'ticket_freeze':
        await handleTicketFreeze(interaction, id, ticketService, ticketRepository, locale);
        break;
      case 'ticket_claim':
        await handleTicketClaim(interaction, id, ticketService, ticketRepository, locale);
        break;
      case 'ticket_escalate':
        await handleTicketEscalate(interaction, id, ticketService, ticketRepository, locale);
        break;
    }
  } catch (error: unknown) {
    // Check if we can still respond to the interaction
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: t('common.error', { error: (error as Error).message }),
          ephemeral: true,
        });
      } catch (replyError) {
        // Interaction may have expired while handling
        console.error('Failed to reply to ticket button interaction:', replyError);
      }
    }
  }
}

async function handleTicketCreate(
  interaction: ButtonInteraction,
  panelId: string,
  ticketService: TicketService,
  ticketRepository: TicketRepository,
  locale: string
) {
  // Get panel
  const panel = await ticketRepository.getPanelById(panelId);
  if (!panel || !panel.isActive) {
    await interaction.reply({
      content: t('tickets.panelNotFound'),
      ephemeral: true,
    });
    return;
  }

  // Check user's open tickets
  const openTickets = await ticketRepository.getUserOpenTicketsByPanel(
    interaction.user.id,
    panel.id
  );
  if (openTickets.length >= panel.maxTicketsPerUser) {
    await interaction.reply({
      content: t('tickets.maxTicketsReached', { max: panel.maxTicketsPerUser }),
      ephemeral: true,
    });
    return;
  }

  // Show modal
  const modal = ticketService.createTicketModal(panelId, locale);
  await interaction.showModal(modal);
}

async function handleTicketClose(
  interaction: ButtonInteraction,
  ticketId: string,
  ticketService: TicketService,
  ticketRepository: TicketRepository,
  locale: string
) {
  await interaction.deferReply();

  const ticket = await ticketRepository.getTicket(ticketId);
  if (!ticket) {
    await interaction.editReply({
      content: t('tickets.ticketNotFound'),
    });
    return;
  }

  // Check permissions
  const member = interaction.member as GuildMember;
  const hasPermission =
    member.permissions.has(PermissionFlagsBits.ManageChannels) ||
    ticket.userId === interaction.user.id;

  if (!hasPermission) {
    await interaction.editReply({
      content: t('common.noPermission'),
    });
    return;
  }

  try {
    await ticketService.closeTicket(ticketId, member, undefined, locale);

    await interaction.editReply({
      content: t('tickets.closing'),
    });

    // Delete channel after 5 seconds
    setTimeout(() => { (interaction.channel as TextChannel)?.delete().catch(() => {}); }, 5000);
  } catch (error: unknown) {
    await interaction.editReply({
      content: t('common.error', { error: (error as Error).message }),
    });
  }
}

async function handleTicketCloseWithReason(
  interaction: ButtonInteraction,
  ticketId: string,
  ticketService: TicketService,
  locale: string
) {
  // Show modal for close reason
  const modal = ticketService.createCloseReasonModal(ticketId, locale);
  await interaction.showModal(modal);
}

async function handleTicketLock(
  interaction: ButtonInteraction,
  ticketId: string,
  ticketService: TicketService,
  ticketRepository: TicketRepository,
  locale: string
) {
  await interaction.deferReply();

  const ticket = await ticketRepository.getTicket(ticketId);
  if (!ticket) {
    await interaction.editReply({
      content: t('tickets.ticketNotFound'),
    });
    return;
  }

  // Check permissions
  const member = interaction.member as GuildMember;
  if (!member.permissions.has(PermissionFlagsBits.ManageChannels)) {
    await interaction.editReply({
      content: t('common.noPermission'),
    });
    return;
  }

  try {
    await ticketService.lockTicket(ticketId, member, interaction.guild!, locale);

    const embed = new EmbedBuilder()
      .setTitle(t('tickets.ticketLocked'))
      .setDescription(t('tickets.ticketLockedDesc'))
      .setColor(0xffa500)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    const originalMessage = interaction.message;
    if (originalMessage.editable) {
      const actionRows = originalMessage.components as ActionRow<MessageActionRowComponent>[];

      const updatedRows = actionRows
        .map(row => {
          const newRow = new ActionRowBuilder<ButtonBuilder>();

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
        })
        .filter(row => row.components.length > 0);

      if (updatedRows.length > 0) {
        await originalMessage.edit({ components: updatedRows });
      }
    }
  } catch (error: unknown) {
    await interaction.editReply({
      content: t('common.error', { error: (error as Error).message }),
    });
  }
}

async function handleTicketFreeze(
  interaction: ButtonInteraction,
  ticketId: string,
  ticketService: TicketService,
  ticketRepository: TicketRepository,
  locale: string
) {
  await interaction.deferReply();

  const ticket = await ticketRepository.getTicket(ticketId);
  if (!ticket) {
    await interaction.editReply({
      content: t('tickets.ticketNotFound'),
    });
    return;
  }

  // Check permissions
  const member = interaction.member as GuildMember;
  if (!member.permissions.has(PermissionFlagsBits.ManageChannels)) {
    await interaction.editReply({
      content: t('common.noPermission'),
    });
    return;
  }

  try {
    await ticketService.freezeTicket(ticketId, member, interaction.guild!, locale);

    const embed = new EmbedBuilder()
      .setTitle(t('tickets.ticketFrozen'))
      .setDescription(t('tickets.ticketFrozenDesc'))
      .setColor(0x00bfff)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error: unknown) {
    await interaction.editReply({
      content: t('common.error', { error: (error as Error).message }),
    });
  }
}

async function handleTicketClaim(
  interaction: ButtonInteraction,
  ticketId: string,
  ticketService: TicketService,
  ticketRepository: TicketRepository,
  locale: string
) {
  await interaction.deferReply();

  const ticket = await ticketRepository.getTicket(ticketId);
  if (!ticket) {
    await interaction.editReply({
      content: t('tickets.ticketNotFound'),
    });
    return;
  }

  // Check if user has support role
  const member = interaction.member as GuildMember;
  const panel = ticket.panelId ? await ticketRepository.getPanelById(ticket.panelId) : null;

  if (panel && panel.supportRoles) {
    const hasSupportRole = (panel.supportRoles as string[]).some(roleId =>
      member.roles.cache.has(roleId)
    );

    if (!hasSupportRole && !member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      await interaction.editReply({
        content: t('tickets.notSupportStaff'),
      });
      return;
    }
  }

  try {
    await ticketService.claimTicket(ticketId, member, locale);

    const embed = new EmbedBuilder()
      .setTitle(t('tickets.ticketClaimed'))
      .setDescription(t('tickets.claimedBy', { user: member.user.tag }))
      .setColor(0x00ff00)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error: unknown) {
    await interaction.editReply({
      content: t('common.error', { error: (error as Error).message }),
    });
  }
}

async function handleTicketEscalate(
  interaction: ButtonInteraction,
  ticketId: string,
  ticketService: TicketService,
  ticketRepository: TicketRepository,
  locale: string
) {
  await interaction.deferReply();

  const ticket = await ticketRepository.getTicket(ticketId);
  if (!ticket) {
    await interaction.editReply({
      content: t('tickets.ticketNotFound'),
    });
    return;
  }

  // Check permissions - must be support staff to escalate
  const member = interaction.member as GuildMember;
  const panel = ticket.panelId ? await ticketRepository.getPanelById(ticket.panelId) : null;

  if (panel && panel.supportRoles) {
    const hasSupportRole = (panel.supportRoles as string[]).some(roleId =>
      member.roles.cache.has(roleId)
    );

    if (!hasSupportRole && !member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      await interaction.editReply({
        content: t('tickets.notSupportStaff'),
      });
      return;
    }
  }

  try {
    await ticketService.escalateTicket(ticketId, member, interaction.guild!, locale);

    const embed = new EmbedBuilder()
      .setTitle('Ticket Escalated')
      .setDescription(`Ticket has been escalated by ${member.user.tag}. It requires higher tier support.`)
      .setColor(0xff0000)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    
    // Disable the escalate button on the original message
    const originalMessage = interaction.message;
    if (originalMessage.editable) {
      const actionRows = originalMessage.components as ActionRow<MessageActionRowComponent>[];

      const updatedRows = actionRows
        .map(row => {
          const newRow = new ActionRowBuilder<ButtonBuilder>();

          for (const component of row.components) {
            if (component.type !== ComponentType.Button) {
              continue;
            }

            const buttonComponent = component;
            const button = ButtonBuilder.from(buttonComponent);
            if (buttonComponent.customId === `ticket_escalate:${ticketId}`) {
              button.setDisabled(true).setStyle(ButtonStyle.Secondary);
            }
            newRow.addComponents(button);
          }

          return newRow;
        })
        .filter(row => row.components.length > 0);

      if (updatedRows.length > 0) {
        await originalMessage.edit({ components: updatedRows });
      }
    }
  } catch (error: unknown) {
    await interaction.editReply({
      content: t('common.error', { error: (error as Error).message }),
    });
  }
}
