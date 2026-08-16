import { Router, Request, Response } from 'express';
import { getDatabase } from '../../database/connection';
import { autoModRules, autoModInfractions, quarantineVault } from '../../database/schema';
import { eq, and, desc } from 'drizzle-orm';
import { logger } from '../../utils/logger';

const router = Router();

// GET /automod/rules/:guildId - Get all automod rules for a guild
router.get('/rules/:guildId', async (req: Request, res: Response) => {
  const { guildId } = req.params;

  try {
    const db = getDatabase();
    const rules = await db
      .select()
      .from(autoModRules)
      .where(eq(autoModRules.guildId, guildId))
      .orderBy(desc(autoModRules.createdAt));

    return res.json(rules);
  } catch (error) {
    logger.error('Error fetching automod rules:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch automod rules',
    });
  }
});

// POST /automod/rules - Create a new automod rule
router.post('/rules', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const {
      guildId,
      name,
      description,
      eventType,
      triggerType,
      triggerMetadata,
      conditions,
      exemptRoles,
      exemptChannels,
      actions,
      enabled,
      createdBy,
    } = req.body;

    if (!guildId || !name || !eventType || !triggerType) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required fields for automod rule',
      });
    }

    const [rule] = await db
      .insert(autoModRules)
      .values({
        guildId,
        name,
        description: description || null,
        eventType,
        triggerType,
        triggerMetadata: triggerMetadata || {},
        conditions: conditions || {},
        exemptRoles: exemptRoles || [],
        exemptChannels: exemptChannels || [],
        actions: actions || [],
        enabled: enabled ?? true,
        createdBy: createdBy || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    logger.info(`Created automod rule ${rule.id} for guild ${guildId}`);

    return res.status(201).json({
      success: true,
      rule,
    });
  } catch (error) {
    logger.error('Error creating automod rule:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create automod rule',
    });
  }
});

// PATCH /automod/rules/:ruleId/toggle - Toggle rule enabled status
router.patch('/rules/:ruleId/toggle', async (req: Request, res: Response) => {
  const { ruleId } = req.params;
  const { guildId, enabled } = req.body;

  try {
    const db = getDatabase();
    const whereClause = guildId
      ? and(eq(autoModRules.id, ruleId), eq(autoModRules.guildId, guildId))
      : eq(autoModRules.id, ruleId);

    const [updatedRule] = await db
      .update(autoModRules)
      .set({
        enabled: Boolean(enabled),
        updatedAt: new Date(),
      })
      .where(whereClause)
      .returning();

    if (!updatedRule) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Rule not found',
      });
    }

    logger.info(`Toggled automod rule ${ruleId} to ${enabled}`);

    return res.json({
      success: true,
      rule: updatedRule,
    });
  } catch (error) {
    logger.error('Error toggling automod rule:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to toggle automod rule',
    });
  }
});

// DELETE /automod/rules/:ruleId - Delete an automod rule
router.delete('/rules/:ruleId', async (req: Request, res: Response) => {
  const { ruleId } = req.params;
  const guildId = (req.body?.guildId || req.query?.guildId) as string | undefined;

  try {
    const db = getDatabase();
    const whereClause = guildId
      ? and(eq(autoModRules.id, ruleId), eq(autoModRules.guildId, guildId))
      : eq(autoModRules.id, ruleId);

    await db.delete(autoModRules).where(whereClause);

    logger.info(`Deleted automod rule ${ruleId}`);

    return res.json({
      success: true,
      message: 'Rule deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting automod rule:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete automod rule',
    });
  }
});

// GET /automod/infractions/:guildId - Get recent infractions for a guild
router.get('/infractions/:guildId', async (req: Request, res: Response) => {
  const { guildId } = req.params;

  try {
    const db = getDatabase();
    const infractions = await db
      .select()
      .from(autoModInfractions)
      .where(eq(autoModInfractions.guildId, guildId))
      .orderBy(desc(autoModInfractions.createdAt))
      .limit(100);

    return res.json(infractions);
  } catch (error) {
    logger.error('Error fetching automod infractions:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch automod infractions',
    });
  }
});

// GET /automod/quarantine/:guildId - Get quarantine records for a guild
router.get('/quarantine/:guildId', async (req: Request, res: Response) => {
  const { guildId } = req.params;

  try {
    const db = getDatabase();
    const records = await db
      .select()
      .from(quarantineVault)
      .where(eq(quarantineVault.guildId, guildId))
      .orderBy(desc(quarantineVault.createdAt));

    return res.json(records);
  } catch (error) {
    logger.error('Error fetching quarantine vault:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch quarantine vault records',
    });
  }
});

// PATCH /automod/quarantine/:vaultId/release - Release user from quarantine
router.patch('/quarantine/:vaultId/release', async (req: Request, res: Response) => {
  const { vaultId } = req.params;
  const { guildId, releasedBy } = req.body;

  try {
    const db = getDatabase();
    const whereClause = guildId
      ? and(eq(quarantineVault.id, vaultId), eq(quarantineVault.guildId, guildId))
      : eq(quarantineVault.id, vaultId);

    const [updated] = await db
      .update(quarantineVault)
      .set({
        released: true,
        releasedBy: releasedBy || null,
        releasedAt: new Date(),
      })
      .where(whereClause)
      .returning();

    if (!updated) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Quarantine record not found',
      });
    }

    logger.info(`Released user from quarantine vault ${vaultId}`);

    return res.json({
      success: true,
      record: updated,
    });
  } catch (error) {
    logger.error('Error releasing user from quarantine:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to release user from quarantine',
    });
  }
});

export const automodRouter = router;
