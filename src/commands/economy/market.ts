import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { CommandCategory } from '../../types/command';
import { economyMarketService } from '../../services/economyMarketService';
import { embedBuilder } from '../../handlers/embedBuilder';

export const data = new SlashCommandBuilder()
  .setName('market')
  .setDescription('Interact with the stock market')
  .addSubcommand(subcommand =>
    subcommand
      .setName('view')
      .setDescription('View available stocks')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('buy')
      .setDescription('Buy a stock')
      .addStringOption(option => 
        option.setName('symbol').setDescription('Stock symbol to buy').setRequired(true)
      )
      .addIntegerOption(option =>
        option.setName('quantity').setDescription('Amount to buy').setRequired(true).setMinValue(1)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('sell')
      .setDescription('Sell a stock')
      .addStringOption(option => 
        option.setName('symbol').setDescription('Stock symbol to sell').setRequired(true)
      )
      .addIntegerOption(option =>
        option.setName('quantity').setDescription('Amount to sell').setRequired(true).setMinValue(1)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('portfolio')
      .setDescription('View your current stock portfolio')
  );

export const category = CommandCategory.Economy;
export const cooldown = 5;

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.editReply('This command can only be used in a server.');
    return;
  }
  const userId = interaction.user.id;
  const subcommand = interaction.options.getSubcommand();

  try {
    if (subcommand === 'view') {
      const stocks = await economyMarketService.getStocks(guildId);
      
      if (stocks.length === 0) {
        return interaction.editReply('There are currently no stocks available in this market.');
      }

      const embed = embedBuilder.createInfoEmbed('Stock Market', 'Current available stocks');
      
      for (const stock of stocks) {
        const change = stock.currentPrice - stock.previousPrice;
        const trendIcon = change >= 0 ? '📈' : '📉';
        const sign = change > 0 ? '+' : '';
        embed.addFields({
          name: `${stock.name} (${stock.symbol})`,
          value: `Price: **${stock.currentPrice}** 💰\nChange: ${trendIcon} ${sign}${change}\nTrend: ${stock.trend}`,
          inline: true
        });
      }

      await interaction.editReply({ embeds: [embed] });

    } else if (subcommand === 'buy') {
      const symbol = interaction.options.getString('symbol', true).toUpperCase();
      const quantity = interaction.options.getInteger('quantity', true);

      await economyMarketService.buyStock(userId, guildId, symbol, quantity);
      await interaction.editReply(`Successfully bought ${quantity} shares of **${symbol}**.`);

    } else if (subcommand === 'sell') {
      const symbol = interaction.options.getString('symbol', true).toUpperCase();
      const quantity = interaction.options.getInteger('quantity', true);

      await economyMarketService.sellStock(userId, guildId, symbol, quantity);
      await interaction.editReply(`Successfully sold ${quantity} shares of **${symbol}**.`);

    } else if (subcommand === 'portfolio') {
      const userStocks = await economyMarketService.getUserStocks(userId, guildId);
      
      if (userStocks.length === 0) {
        return interaction.editReply('You do not own any stocks.');
      }

      const embed = embedBuilder.createInfoEmbed(`${interaction.user.username}'s Portfolio`, 'Your current investments');
      
      for (const inv of userStocks) {
        const stock = await economyMarketService.getStock(guildId, inv.symbol);
        const currentPrice = stock ? stock.currentPrice : 0;
        const totalValue = currentPrice * inv.shares;
        const profit = totalValue - (inv.averageCost * inv.shares);
        const sign = profit >= 0 ? '+' : '';
        
        embed.addFields({
          name: `${inv.symbol}`,
          value: `Shares: ${inv.shares}\nAvg Cost: ${inv.averageCost} 💰\nCurrent Value: ${totalValue} 💰\nProfit: ${sign}${profit} 💰`,
          inline: true
        });
      }

      await interaction.editReply({ embeds: [embed] });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    await interaction.editReply(`Error: ${message}`);
  }
  return;
}
