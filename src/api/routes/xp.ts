import { Router, Request, Response } from 'express';
import { getDatabase } from '../../database/connection';
import { xpSettings, xpRewards, xpMultipliers, userXp } from '../../database/schema';
import { eq, and, desc } from 'drizzle-orm';
import { logger } from '../../utils/logger';

const router = Router();

// GET /guilds/{guildId}/xp/settings - Get XP settings
router.get('/:guildId/xp/settings', async (req: Request, res: Response) => {
  const { guildId } = req.params;

  try {
    const db = getDatabase();
    const [settings] = await db
      .select()
      .from(xpSettings)
      .where(eq(xpSettings.guildId, guildId))
      .limit(1);

    return res.json(settings || null);
  } catch (error) {
    logger.error('Error fetching XP settings:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch XP settings',
    });
  }
});

// PATCH /guilds/{guildId}/xp/settings - Update XP settings
router.patch('/:guildId/xp/settings', async (req: Request, res: Response) => {
  const { guildId } = req.params;

  try {
    const db = getDatabase();
    const data = req.body;

    await db
      .insert(xpSettings)
      .values({
        guildId,
        ...data,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: xpSettings.guildId,
        set: {
          ...data,
          updatedAt: new Date(),
        },
      });

    logger.info(`Updated XP settings for guild ${guildId}`);

    return res.json({
      success: true,
      message: 'XP settings updated successfully',
    });
  } catch (error) {
    logger.error('Error updating XP settings:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update XP settings',
    });
  }
});

// GET /guilds/{guildId}/xp/rewards - Get all role rewards
router.get('/:guildId/xp/rewards', async (req: Request, res: Response) => {
  const { guildId } = req.params;

  try {
    const db = getDatabase();
    const rewards = await db
      .select()
      .from(xpRewards)
      .where(eq(xpRewards.guildId, guildId))
      .orderBy(xpRewards.level);

    return res.json(rewards);
  } catch (error) {
    logger.error('Error fetching role rewards:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch role rewards',
    });
  }
});

// POST /guilds/{guildId}/xp/rewards - Add role reward
router.post('/:guildId/xp/rewards', async (req: Request, res: Response) => {
  const { guildId } = req.params;
  const { level, roleId } = req.body;

  if (level === undefined || !roleId) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Missing level or roleId',
    });
  }

  try {
    const db = getDatabase();

    const [newReward] = await db
      .insert(xpRewards)
      .values({
        guildId,
        level: Number(level),
        roleId,
        createdAt: new Date(),
      })
      .returning();

    logger.info(`Created XP role reward for level ${level} in guild ${guildId}`);

    return res.status(201).json({
      success: true,
      reward: newReward,
    });
  } catch (error) {
    logger.error('Error creating role reward:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create role reward',
    });
  }
});

// DELETE /guilds/{guildId}/xp/rewards/:level - Remove role reward
router.delete('/:guildId/xp/rewards/:level', async (req: Request, res: Response) => {
  const { guildId, level } = req.params;
  const { roleId } = req.body || {};

  try {
    const db = getDatabase();
    const whereClause = roleId
      ? and(
          eq(xpRewards.guildId, guildId),
          eq(xpRewards.level, parseInt(level, 10)),
          eq(xpRewards.roleId, roleId)
        )
      : and(eq(xpRewards.guildId, guildId), eq(xpRewards.level, parseInt(level, 10)));

    await db.delete(xpRewards).where(whereClause);

    logger.info(`Deleted XP role reward for level ${level} from guild ${guildId}`);

    return res.json({
      success: true,
      message: 'Role reward deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting role reward:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete role reward',
    });
  }
});

// GET /guilds/{guildId}/xp/multipliers - Get XP multipliers
router.get('/:guildId/xp/multipliers', async (req: Request, res: Response) => {
  const { guildId } = req.params;

  try {
    const db = getDatabase();
    const multipliers = await db
      .select()
      .from(xpMultipliers)
      .where(eq(xpMultipliers.guildId, guildId));

    return res.json(multipliers);
  } catch (error) {
    logger.error('Error fetching XP multipliers:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch XP multipliers',
    });
  }
});

// POST /guilds/{guildId}/xp/multipliers - Create XP multiplier
router.post('/:guildId/xp/multipliers', async (req: Request, res: Response) => {
  const { guildId } = req.params;
  const { targetId, targetType, multiplier } = req.body;

  if (!targetId || !targetType || multiplier === undefined) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Missing targetId, targetType, or multiplier',
    });
  }

  try {
    const db = getDatabase();
    const [created] = await db
      .insert(xpMultipliers)
      .values({
        guildId,
        targetId,
        targetType,
        multiplier: Number(multiplier),
        createdAt: new Date(),
      })
      .returning();

    logger.info(`Created XP multiplier for ${targetType} ${targetId} in guild ${guildId}`);

    return res.status(201).json({
      success: true,
      multiplier: created,
    });
  } catch (error) {
    logger.error('Error creating XP multiplier:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create XP multiplier',
    });
  }
});

// DELETE /guilds/{guildId}/xp/multipliers/:targetType/:targetId - Delete XP multiplier
router.delete(
  '/:guildId/xp/multipliers/:targetType/:targetId',
  async (req: Request, res: Response) => {
    const { guildId, targetType, targetId } = req.params;

    try {
      const db = getDatabase();
      await db
        .delete(xpMultipliers)
        .where(
          and(
            eq(xpMultipliers.guildId, guildId),
            eq(xpMultipliers.targetId, targetId),
            eq(xpMultipliers.targetType, targetType)
          )
        );

      logger.info(`Deleted XP multiplier for ${targetType} ${targetId} from guild ${guildId}`);

      return res.json({
        success: true,
        message: 'Multiplier deleted successfully',
      });
    } catch (error) {
      logger.error('Error deleting XP multiplier:', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to delete XP multiplier',
      });
    }
  }
);

// GET /guilds/{guildId}/xp/users - Get top XP users leaderboard
router.get('/:guildId/xp/users', async (req: Request, res: Response) => {
  const { guildId } = req.params;

  try {
    const db = getDatabase();
    const users = await db
      .select()
      .from(userXp)
      .where(eq(userXp.guildId, guildId))
      .orderBy(desc(userXp.xp))
      .limit(100);

    return res.json(users);
  } catch (error) {
    logger.error('Error fetching XP users:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch XP users',
    });
  }
});

// PATCH /guilds/{guildId}/xp/user/:userId - Update / override user XP
router.patch('/:guildId/xp/user/:userId', async (req: Request, res: Response) => {
  const { guildId, userId } = req.params;
  const { xp, level, prestigeLevel } = req.body;

  try {
    const db = getDatabase();
    await db
      .insert(userXp)
      .values({
        userId,
        guildId,
        xp: xp ?? 0,
        level: level ?? 0,
        prestigeLevel: prestigeLevel ?? 0,
        lastXpGain: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [userXp.userId, userXp.guildId],
        set: {
          ...(xp !== undefined ? { xp: Number(xp) } : {}),
          ...(level !== undefined ? { level: Number(level) } : {}),
          ...(prestigeLevel !== undefined ? { prestigeLevel: Number(prestigeLevel) } : {}),
          updatedAt: new Date(),
        },
      });

    logger.info(`Updated XP override for user ${userId} in guild ${guildId}`);

    return res.json({
      success: true,
      message: 'User XP updated successfully',
    });
  } catch (error) {
    logger.error('Error updating user XP:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update user XP',
    });
  }
});

export const xpRouter = router;

