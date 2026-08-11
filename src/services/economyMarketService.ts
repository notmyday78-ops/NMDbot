import { getDatabase } from '../database/connection';
import { economyStocks, economyUserStocks, economyBalances } from '../database/schema';
import { eq, and, sql } from 'drizzle-orm';
import { logger } from '../utils/logger';

export class EconomyMarketService {
  async getStocks(guildId: string) {
    const db = getDatabase();
    return db.select().from(economyStocks).where(eq(economyStocks.guildId, guildId));
  }

  async getStock(guildId: string, symbol: string) {
    const db = getDatabase();
    const stocks = await db
      .select()
      .from(economyStocks)
      .where(and(eq(economyStocks.guildId, guildId), eq(economyStocks.symbol, symbol.toUpperCase())));
    return stocks[0] || null;
  }

  async getUserStocks(userId: string, guildId: string) {
    const db = getDatabase();
    return db
      .select()
      .from(economyUserStocks)
      .where(and(eq(economyUserStocks.guildId, guildId), eq(economyUserStocks.userId, userId)));
  }

  async buyStock(userId: string, guildId: string, symbol: string, quantity: number) {
    const db = getDatabase();
    const stock = await this.getStock(guildId, symbol);
    if (!stock) throw new Error('Stock not found');
    if (quantity <= 0) throw new Error('Invalid quantity');

    const cost = stock.currentPrice * quantity;

    return await db.transaction(async (tx) => {
      const balanceRecords = await tx
        .select()
        .from(economyBalances)
        .where(and(eq(economyBalances.guildId, guildId), eq(economyBalances.userId, userId)));
      
      const balance = balanceRecords[0];
      if (!balance) {
        throw new Error('No economy balance found');
      }

      if (balance.balance < cost) {
        throw new Error('Insufficient balance');
      }

      // Deduct balance
      await tx
        .update(economyBalances)
        .set({ balance: balance.balance - cost })
        .where(and(eq(economyBalances.guildId, guildId), eq(economyBalances.userId, userId)));

      // Add stocks
      const userStockRecords = await tx
        .select()
        .from(economyUserStocks)
        .where(
          and(
            eq(economyUserStocks.guildId, guildId),
            eq(economyUserStocks.userId, userId),
            eq(economyUserStocks.symbol, symbol.toUpperCase())
          )
        );

      if (userStockRecords.length > 0) {
        const current = userStockRecords[0];
        const newTotalShares = current.shares + quantity;
        const totalCost = (current.shares * current.averageCost) + cost;
        const newAverageCost = Math.floor(totalCost / newTotalShares);

        await tx
          .update(economyUserStocks)
          .set({ shares: newTotalShares, averageCost: newAverageCost })
          .where(and(
            eq(economyUserStocks.guildId, guildId),
            eq(economyUserStocks.userId, userId),
            eq(economyUserStocks.symbol, symbol.toUpperCase())
          ));
      } else {
        await tx.insert(economyUserStocks).values({
          userId,
          guildId,
          symbol: symbol.toUpperCase(),
          shares: quantity,
          averageCost: stock.currentPrice,
        });
      }
      return true;
    });
  }

  async sellStock(userId: string, guildId: string, symbol: string, quantity: number) {
    const db = getDatabase();
    const stock = await this.getStock(guildId, symbol);
    if (!stock) throw new Error('Stock not found');
    if (quantity <= 0) throw new Error('Invalid quantity');

    return await db.transaction(async (tx) => {
      const userStockRecords = await tx
        .select()
        .from(economyUserStocks)
        .where(
          and(
            eq(economyUserStocks.guildId, guildId),
            eq(economyUserStocks.userId, userId),
            eq(economyUserStocks.symbol, symbol.toUpperCase())
          )
        );

      if (userStockRecords.length === 0 || userStockRecords[0].shares < quantity) {
        throw new Error('Insufficient shares');
      }

      const revenue = stock.currentPrice * quantity;

      // Add to balance
      await tx
        .update(economyBalances)
        .set({ balance: sql`${economyBalances.balance} + ${revenue}` })
        .where(and(eq(economyBalances.guildId, guildId), eq(economyBalances.userId, userId)));

      // Remove shares
      const currentShares = userStockRecords[0].shares;
      if (currentShares === quantity) {
        await tx
          .delete(economyUserStocks)
          .where(and(
            eq(economyUserStocks.guildId, guildId),
            eq(economyUserStocks.userId, userId),
            eq(economyUserStocks.symbol, symbol.toUpperCase())
          ));
      } else {
        await tx
          .update(economyUserStocks)
          .set({ shares: currentShares - quantity })
          .where(and(
            eq(economyUserStocks.guildId, guildId),
            eq(economyUserStocks.userId, userId),
            eq(economyUserStocks.symbol, symbol.toUpperCase())
          ));
      }
      return true;
    });
  }

  async fluctuateMarket() {
    try {
      const db = getDatabase();
      const allStocks = await db.select().from(economyStocks);

      for (const stock of allStocks) {
        const volatility = stock.volatility || 10;
        const changePercent = (Math.random() * volatility * 2) - volatility + stock.trend;
        const changeAmount = Math.floor(stock.currentPrice * (changePercent / 100));
        let newPrice = stock.currentPrice + changeAmount;
        
        if (newPrice < 1) newPrice = 1; // Minimum price of 1

        // Randomly update trend
        let newTrend = stock.trend;
        if (Math.random() > 0.8) {
          newTrend = Math.floor(Math.random() * 5) - 2; // -2 to +2
        }

        await db
          .update(economyStocks)
          .set({
            previousPrice: stock.currentPrice,
            currentPrice: newPrice,
            trend: newTrend,
            updatedAt: new Date()
          })
          .where(and(eq(economyStocks.guildId, stock.guildId), eq(economyStocks.symbol, stock.symbol)));
      }
    } catch (e) {
      logger.error('Error fluctuating market:', e);
    }
  }
}

export const economyMarketService = new EconomyMarketService();
