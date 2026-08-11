/* eslint-disable @typescript-eslint/unbound-method */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  createMockCommandInteraction,
  createMockGuild,
  createMockUser,
} from '../../../test-utils/mockDiscord';

type WarningServiceMock = {
  createWarning: jest.Mock;
  getWarningEmbed: jest.Mock;
  deleteAutomation: jest.Mock;
};

type WarningRepositoryMock = {
  getWarningById: jest.Mock;
  getUserWarnings: jest.Mock;
  getUserWarningStats: jest.Mock;
  getGuildAutomations: jest.Mock;
};

const mockWarningService: WarningServiceMock = {
  createWarning: jest.fn(),
  getWarningEmbed: jest.fn(),
  deleteAutomation: jest.fn(),
};

const mockWarningRepository: WarningRepositoryMock = {
  getWarningById: jest.fn(),
  getUserWarnings: jest.fn(),
  getUserWarningStats: jest.fn(),
  getGuildAutomations: jest.fn(),
};


jest.mock('../../../services/warningService', () => ({
  warningService: mockWarningService,
}));

jest.mock('../../../repositories/warningRepository', () => ({
  warningRepository: mockWarningRepository,
}));

jest.mock('../../../i18n', () => ({
  t: (key: string) => key,
}));

describe('Warn command', () => {
  let interaction: ReturnType<typeof createMockCommandInteraction>;
  let execute: typeof import('../../../commands/moderation/warn').execute;

  beforeEach(async () => {
    jest.clearAllMocks();
    interaction = createMockCommandInteraction();
    interaction.guild = createMockGuild();
    const module = await import('../../../commands/moderation/warn');
    execute = module.execute;
  });

  it('rejects when used outside of a guild', async () => {
    interaction.guild = null;

    await execute(interaction);

    expect(jest.mocked(interaction.reply)).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'common.guildOnly',
        ephemeral: true,
      })
    );
  });

  it('creates a warning for a user', async () => {
    const targetUser = createMockUser({ id: 'target', bot: false } as unknown as import('discord.js').User);
    const sendMock = jest.fn();
    sendMock.mockReturnValue(Promise.resolve(undefined));
    targetUser.send = sendMock as unknown as typeof targetUser.send;
    const options = interaction.options as unknown as Record<string, jest.Mock>;
    options.getSubcommand.mockReturnValue('create');
    options.getUser.mockReturnValue(targetUser);
    options.getString
      .mockImplementationOnce(() => 'Test Title')
      .mockImplementationOnce(() => 'Description');
    options.getInteger.mockReturnValue(2);
    options.getAttachment.mockReturnValue({
      url: 'https://example.com/proof.png',
    } as unknown as import('discord.js').Attachment);

    mockWarningService.createWarning.mockResolvedValueOnce({ warnId: 'W123' });
    await execute(interaction);

    expect(mockWarningService.createWarning).toHaveBeenCalledWith(
      interaction.guild,
      targetUser,
      interaction.user,
      'Test Title',
      'Description',
      2,
      'https://example.com/proof.png'
    );
    expect(jest.mocked(interaction.editReply)).toHaveBeenCalled();
  });

  it('shows warning details when viewing warnings', async () => {
    const targetUser = createMockUser({ id: 'target' } as unknown as import('discord.js').User);
    const options = interaction.options as unknown as Record<string, jest.Mock>;
    options.getSubcommand.mockReturnValue('view');
    options.getUser.mockReturnValue(targetUser);

    mockWarningRepository.getUserWarnings.mockResolvedValueOnce([
      {
        warnId: 'W1',
        guildId: interaction.guild?.id ?? 'guild',
        title: 'Warning title',
        description: 'Warning description',
        level: 1,
        createdAt: new Date(),
      },
    ]);
    mockWarningRepository.getUserWarningStats.mockResolvedValueOnce({ count: 1, totalLevel: 1 });

    await execute(interaction);

    expect(jest.mocked(interaction.editReply)).toHaveBeenCalledWith({
      embeds: expect.any(Array),
    });
  });

  it('returns not found when looking up missing warning', async () => {
    const options = interaction.options as unknown as Record<string, jest.Mock>;
    options.getSubcommand.mockReturnValue('lookup');
    options.getString.mockReturnValue('W999');
    mockWarningRepository.getWarningById.mockResolvedValueOnce(null);

    await execute(interaction);

    expect(jest.mocked(interaction.editReply)).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('commands.warn.subcommands.lookup.notFound'),
      })
    );
  });

  it('handles automation view subcommand', async () => {
    const options = interaction.options as unknown as Record<string, jest.Mock>;
    options.getSubcommandGroup.mockReturnValue('automation');
    options.getSubcommand.mockReturnValue('view');
    mockWarningRepository.getGuildAutomations.mockResolvedValueOnce([]);

    await execute(interaction);

    expect(mockWarningRepository.getGuildAutomations).toHaveBeenCalledWith(interaction.guild?.id ?? 'guild');
    expect(jest.mocked(interaction.editReply)).toHaveBeenCalled();
  });
});
