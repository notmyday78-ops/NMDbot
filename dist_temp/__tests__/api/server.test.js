"use strict";
import { beforeAll, describe, expect, it, jest } from "@jest/globals";
import request from "supertest";
import express from "express";
jest.mock("../../config/env", () => ({
  config: {
    API_PORT: 2e3,
    BOT_API_TOKEN: "test_api_token"
  }
}));
jest.mock("../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));
jest.mock("../../api/middleware/cache", () => ({
  cacheMiddleware: () => (_req, _res, next) => next(),
  cacheStatsMiddleware: (_req, res) => res.json({ cache: true }),
  invalidateCache: () => (_req, _res, next) => next(),
  CacheTTL: { STATS: 1e3, GUILD_DATA: 1e3, MEMBER_LIST: 1e3 },
  cacheManager: {
    getStats: () => ({ hits: 0, misses: 0, size: 0 }),
    set: jest.fn(),
    get: jest.fn(),
    stats: jest.fn()
  }
}));
jest.mock("../../api/middleware/rateLimiter", () => ({
  ipRateLimiter: () => (_req, _res, next) => next(),
  guildRateLimiter: () => (_req, _res, next) => next(),
  createRateLimiter: () => (_req, _res, next) => next(),
  RateLimitPresets: { stats: { windowMs: 1e3, maxRequests: 10 } }
}));
jest.mock("../../api/services/statsAggregator", () => {
  const statsAggregator = {
    start: jest.fn(),
    stop: jest.fn(),
    getStats: jest.fn().mockReturnValue(null),
    refresh: jest.fn(),
    getStatsAge: jest.fn().mockReturnValue(0),
    incrementCommand: jest.fn()
  };
  statsAggregator.refresh.mockResolvedValue({
    bot: {
      status: "online",
      uptime: 1e3,
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      latency: 42,
      shardCount: 1
    },
    guilds: { total: 0, large: 0, voiceActive: 0 },
    users: { total: 0, unique: 0, activeToday: 0, online: 0 },
    commands: {
      totalExecuted: 0,
      today: 0,
      thisHour: 0,
      perMinute: 0,
      topCommands: []
    },
    system: { memoryUsage: 0, memoryTotal: 0, cpuUsage: 0 },
    features: {
      economy: { active: 0, transactions: 0 },
      moderation: { cases: 0, activeWarnings: 0 },
      tickets: { open: 0, total: 0 },
      giveaways: { active: 0, participants: 0 },
      xp: { activeUsers: 0 }
    }
  });
  return { statsAggregator };
});
jest.mock("../../api/routes/status", () => {
  const router = express.Router();
  router.get("/", (_req, res) => res.json({ status: "ok" }));
  return { statusRouter: router };
});
jest.mock("../../api/routes/stats", () => {
  const router = express.Router();
  router.get("/", (_req, res) => res.json({ status: "online" }));
  return { statsRouter: router };
});
jest.mock("../../api/routes/guilds", () => ({ guildsRouter: express.Router() }));
jest.mock("../../api/routes/economy", () => ({ economyRouter: express.Router() }));
jest.mock("../../api/routes/moderation", () => ({ moderationRouter: express.Router() }));
jest.mock("../../api/routes/xp", () => ({ xpRouter: express.Router() }));
jest.mock("../../api/routes/tickets", () => ({ ticketsRouter: express.Router() }));
jest.mock("../../api/routes/giveaways", () => ({ giveawaysRouter: express.Router() }));
jest.mock("../../api/routes/settings", () => ({ settingsRouter: express.Router() }));
jest.mock("../../api/routes/batch", () => ({ batchRouter: express.Router() }));
jest.mock("../../api/routes/monitoring", () => ({ monitoringRouter: express.Router() }));
describe("API server", () => {
  let app;
  beforeAll(async () => {
    process.env.BOT_API_TOKEN = "test_api_token";
    const serverModule = await import("../../api/server");
    app = serverModule.app;
  });
  it("returns health information", async () => {
    const response = await request(app).get("/health").expect(200);
    expect(response.body).toHaveProperty("status", "ok");
    expect(response.body).toHaveProperty("timestamp");
  });
  it("requires authentication for protected routes", async () => {
    await request(app).get("/stats").expect(401);
  });
  it("allows access to protected routes with valid token", async () => {
    const response = await request(app).get("/stats").set("Authorization", "Bearer test_api_token").expect(200);
    expect(response.body).toHaveProperty("status", "online");
  });
});
