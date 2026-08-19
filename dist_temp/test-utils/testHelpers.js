"use strict";
import {
  PermissionsBitField
} from "discord.js";
import { createMockDb } from "./mockDatabase";
import { createMockClient } from "./mockDiscord";
export const expectEmbed = (embed) => ({
  toHaveTitle: (title) => {
    expect(embed.data.title).toBe(title);
  },
  toHaveDescription: (description) => {
    expect(embed.data.description).toBe(description);
  },
  toHaveColor: (color) => {
    expect(embed.data.color).toBe(color);
  },
  toHaveField: (name, value) => {
    const field = embed.data.fields?.find((f) => f.name === name);
    expect(field).toBeDefined();
    if (value !== void 0) {
      expect(field?.value).toBe(value);
    }
  },
  toHaveFooter: (text) => {
    expect(embed.data.footer?.text).toBe(text);
  },
  toHaveAuthor: (name) => {
    expect(embed.data.author?.name).toBe(name);
  },
  toHaveTimestamp: () => {
    expect(embed.data.timestamp).toBeDefined();
  }
});
export const expectInteractionReply = (interaction) => ({
  toHaveBeenCalledWithEmbed: (matcher) => {
    expect(interaction.reply).toHaveBeenCalled();
    const payload = interaction.reply.mock.calls[0]?.[0];
    expect(payload?.embeds).toBeDefined();
    expect(payload?.embeds?.length ?? 0).toBeGreaterThan(0);
    const firstEmbed = payload?.embeds?.[0];
    expect(firstEmbed).toBeDefined();
    expect(matcher(firstEmbed)).toBe(true);
  },
  toHaveBeenCalledWithContent: (content) => {
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content }));
  },
  toHaveBeenCalledEphemeral: () => {
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  },
  toHaveBeenDeferred: () => {
    expect(interaction.deferReply).toHaveBeenCalled();
  }
});
export const createMockPermissions = (permissions) => {
  return new PermissionsBitField(permissions);
};
export const waitFor = async (condition, timeout = 5e3) => {
  const startTime = Date.now();
  while (!condition()) {
    if (Date.now() - startTime > timeout) {
      throw new Error("Timeout waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
};
export const mockI18n = () => {
  const t = jest.fn((key, options) => {
    const translations = {
      "common.error": "An error occurred",
      "common.success": "Success!",
      "common.noPermission": "You do not have permission to use this command",
      "common.invalidUser": "Invalid user specified",
      "common.userNotFound": "User not found",
      "commands.warn.success": "Warning issued successfully",
      "commands.warn.invalidLevel": "Invalid warning level",
      "commands.eco.insufficientFunds": "Insufficient funds",
      "commands.eco.dailyClaimed": "Daily reward claimed!",
      "commands.gw.created": "Giveaway created successfully",
      "commands.gw.ended": "Giveaway ended",
      "commands.ticket.created": "Ticket created",
      "commands.ticket.closed": "Ticket closed"
    };
    let result = translations[key] || key;
    if (options) {
      Object.entries(options).forEach(([placeholder, value]) => {
        result = result.replace(`{${placeholder}}`, String(value));
      });
    }
    return result;
  });
  return { t };
};
export const mockLogger = () => ({
  info: jest.fn(() => void 0),
  warn: jest.fn(() => void 0),
  error: jest.fn(() => void 0),
  debug: jest.fn(() => void 0),
  verbose: jest.fn(() => void 0)
});
export const mockCache = () => {
  const cache = /* @__PURE__ */ new Map();
  return {
    get: jest.fn((key) => cache.get(key)),
    set: jest.fn((key, value, ttl) => {
      cache.set(key, value);
      if (ttl) {
        setTimeout(() => cache.delete(key), ttl);
      }
    }),
    delete: jest.fn((key) => cache.delete(key)),
    clear: jest.fn(() => cache.clear()),
    has: jest.fn((key) => cache.has(key))
  };
};
export const mockRateLimiter = () => ({
  consume: jest.fn().mockResolvedValue({ remainingPoints: 10, msBeforeNext: 0 }),
  penalty: jest.fn().mockResolvedValue(void 0),
  reward: jest.fn().mockResolvedValue(void 0),
  block: jest.fn().mockResolvedValue(void 0),
  delete: jest.fn().mockResolvedValue(void 0),
  get: jest.fn().mockResolvedValue({ points: 0, msBeforeNext: 0 })
});
export const createTestContext = () => ({
  db: createMockDb(),
  client: createMockClient(),
  i18n: mockI18n(),
  logger: mockLogger(),
  cache: mockCache(),
  rateLimiter: mockRateLimiter()
});
export const cleanupMocks = () => {
  jest.clearAllMocks();
  jest.resetModules();
};
export const suppressConsole = () => {
  const spies = [];
  beforeAll(() => {
    spies.push(jest.spyOn(console, "log").mockImplementation(() => void 0));
    spies.push(jest.spyOn(console, "error").mockImplementation(() => void 0));
    spies.push(jest.spyOn(console, "warn").mockImplementation(() => void 0));
    spies.push(jest.spyOn(console, "info").mockImplementation(() => void 0));
    spies.push(jest.spyOn(console, "debug").mockImplementation(() => void 0));
  });
  afterAll(() => {
    spies.forEach((spy) => spy.mockRestore());
  });
};
export const mockEnvironment = (overrides = {}) => {
  const originalEnv = process.env;
  beforeAll(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      DISCORD_TOKEN: "test_token",
      DATABASE_URL: "postgresql://test:test@localhost:5432/pegasus_test",
      BOT_API_TOKEN: "test_api_token",
      DEVELOPER_IDS: '["123456789012345678"]',
      DEFAULT_LANGUAGE: "en",
      LOG_LEVEL: "error",
      ...overrides
    };
  });
  afterAll(() => {
    process.env = originalEnv;
  });
};
