"use strict";
import express from "express";
import cors from "cors";
import { Server as SocketIOServer } from "socket.io";
import { statusRouter } from "./routes/status";
import { statsRouter } from "./routes/stats";
import { guildsRouter } from "./routes/guilds";
import { economyRouter } from "./routes/economy";
import { moderationRouter } from "./routes/moderation";
import { xpRouter } from "./routes/xp";
import { ticketsRouter } from "./routes/tickets";
import { giveawaysRouter } from "./routes/giveaways";
import { settingsRouter } from "./routes/settings";
import { batchRouter } from "./routes/batch";
import { monitoringRouter } from "./routes/monitoring";
import { dashboardRouter } from "./routes/dashboard";
import { ticketsApiRouter } from "./routes/ticketsApi";
import { jtcApiRouter } from "./routes/jtcApi";
import { logger } from "../utils/logger";
import { config } from "../config/env";
import {
  cacheMiddleware,
  cacheStatsMiddleware,
  CacheTTL,
  invalidateCache,
  cacheManager
} from "./middleware/cache";
import {
  ipRateLimiter,
  guildRateLimiter,
  createRateLimiter,
  RateLimitPresets
} from "./middleware/rateLimiter";
import { statsAggregator } from "./services/statsAggregator";
const app = express();
const PORT = config.API_PORT || 2e3;
const normalizeOrigin = (origin) => {
  try {
    const parsed = new URL(origin);
    return parsed.origin;
  } catch {
    return null;
  }
};
const allowedOriginsSet = new Set(
  (config.API_ALLOWED_ORIGINS ?? []).map((origin) => normalizeOrigin(origin)).filter((origin) => Boolean(origin))
);
if (config.DASHBOARD_BASE_URL) {
  const normalizedDashboardOrigin = normalizeOrigin(config.DASHBOARD_BASE_URL);
  if (normalizedDashboardOrigin) {
    allowedOriginsSet.add(normalizedDashboardOrigin);
  }
}
if (config.NODE_ENV === "development") {
  allowedOriginsSet.add("http://localhost:3000");
  allowedOriginsSet.add("http://127.0.0.1:3000");
}
if (allowedOriginsSet.size === 0) {
  logger.warn("No API_ALLOWED_ORIGINS configured; browser-based requests will be blocked by CORS.");
}
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      const normalized = normalizeOrigin(origin);
      if (normalized && allowedOriginsSet.has(normalized)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin not allowed by CORS policy"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders: [
      "X-Cache",
      "X-Cache-TTL",
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
      "X-RateLimit-Reset"
    ]
  })
);
app.use(express.json());
app.use(ipRateLimiter(200, 6e4));
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      error: "Unauthorized",
      message: "Missing or invalid Authorization header"
    });
    return;
  }
  const token = authHeader.replace("Bearer ", "");
  if (token !== config.BOT_API_TOKEN) {
    res.status(401).json({
      error: "Unauthorized",
      message: "Invalid API token"
    });
    return;
  }
  next();
};
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    cache: cacheManager.getStats(),
    aggregator: {
      running: true,
      age: statsAggregator.getStatsAge()
    }
  });
});
app.get("/cache/stats", authenticateToken, cacheStatsMiddleware);
app.use("/status", authenticateToken, cacheMiddleware(CacheTTL.STATS), statusRouter);
app.use(
  "/stats",
  authenticateToken,
  createRateLimiter(RateLimitPresets.stats),
  // Match dashboard refresh rate
  cacheMiddleware(CacheTTL.STATS),
  statsRouter
);
app.use("/dashboard", authenticateToken, cacheMiddleware(CacheTTL.STATS), dashboardRouter);
app.use(
  "/api/tickets",
  authenticateToken,
  invalidateCache(() => `*tickets*`),
  ticketsApiRouter
);
app.use(
  "/api/jtc",
  authenticateToken,
  invalidateCache(() => `*jtc*`),
  jtcApiRouter
);
app.use(
  "/api/j2c",
  authenticateToken,
  invalidateCache(() => `*jtc*`),
  jtcApiRouter
);
app.use(
  "/batch",
  authenticateToken,
  createRateLimiter({ windowMs: 1e3, maxRequests: 5 }),
  // 5 batch requests per second
  batchRouter
);
app.use("/monitoring", authenticateToken, monitoringRouter);
app.use(
  "/guilds",
  authenticateToken,
  (req, res, next) => {
    if (req.params.guildId) {
      guildRateLimiter(10, 1e3)(req, res, next);
    } else {
      next();
    }
  },
  guildsRouter
);
app.use(
  "/guilds/:guildId/economy",
  authenticateToken,
  invalidateCache(() => `*economy*`),
  (req, res, next) => {
    req.url = req.baseUrl + req.url;
    economyRouter(req, res, next);
  }
);
app.use(
  "/guilds/:guildId/moderation",
  authenticateToken,
  invalidateCache(() => `*moderation*`),
  (req, res, next) => {
    req.url = req.baseUrl + req.url;
    moderationRouter(req, res, next);
  }
);
app.use(
  "/guilds/:guildId/xp",
  authenticateToken,
  invalidateCache(() => `*xp*`),
  (req, res, next) => {
    req.url = req.baseUrl + req.url;
    xpRouter(req, res, next);
  }
);
app.use(
  "/guilds/:guildId/tickets",
  authenticateToken,
  invalidateCache(() => `*tickets*`),
  (req, res, next) => {
    req.url = req.baseUrl + req.url;
    ticketsRouter(req, res, next);
  }
);
app.use(
  "/guilds/:guildId/giveaways",
  authenticateToken,
  invalidateCache(() => `*giveaways*`),
  (req, res, next) => {
    req.url = req.baseUrl + req.url;
    giveawaysRouter(req, res, next);
  }
);
app.use(
  "/guilds/:guildId/settings",
  authenticateToken,
  invalidateCache(() => `*settings*`),
  (req, res, next) => {
    req.url = req.baseUrl + req.url;
    settingsRouter(req, res, next);
  }
);
app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: `Route ${req.path} not found`
  });
});
app.use((err, _req, res, _next) => {
  logger.error("API Error:", err);
  res.status(500).json({
    error: "Internal Server Error",
    message: err.message
  });
});
export function startApiServer() {
  const statsInterval = parseInt(process.env.STATS_AGGREGATION_INTERVAL || "5000", 10);
  statsAggregator.start(statsInterval);
  const server = app.listen(PORT, () => {
    logger.info(`API server running on port ${PORT}`);
    logger.info(`API authentication enabled with Bearer token`);
    logger.info(
      `Caching enabled with TTLs: Stats=${CacheTTL.STATS}ms, Guild=${CacheTTL.GUILD_DATA}ms, Members=${CacheTTL.MEMBER_LIST}ms`
    );
    logger.info(`Rate limiting enabled: Global=200/min, Per-guild=10/sec`);
    logger.info(`Stats aggregator running with ${statsInterval}ms update interval`);
  });
  const io = new SocketIOServer(server, {
    cors: {
      origin: Array.from(allowedOriginsSet),
      methods: ["GET", "POST"],
      credentials: true
    }
  });
  io.on("connection", (socket) => {
    logger.info(`WebSocket client connected: ${socket.id}`);
    socket.on("subscribe_guild", (guildId) => {
      socket.join(`guild_${guildId}`);
      logger.info(`Socket ${socket.id} subscribed to guild_${guildId}`);
    });
    socket.on("disconnect", () => {
      logger.info(`WebSocket client disconnected: ${socket.id}`);
    });
  });
  process.on("SIGTERM", () => {
    logger.info("SIGTERM signal received: closing API server");
    statsAggregator.stop();
    io.close();
    server.close(() => {
      logger.info("API server closed");
    });
  });
  return server;
}
export { app, statsAggregator };
