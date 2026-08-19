"use strict";
import { autoModService } from "../../../services/autoModService";
import { autoModRepository } from "../../../repositories/autoModRepository";
jest.mock("../../../repositories/autoModRepository");
jest.mock("../../../utils/logger");
describe("AutoModService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  describe("evaluateMessage", () => {
    it("should return false if message is not in a guild or author is bot", async () => {
      const mockMessage = {
        guild: null,
        author: { bot: true }
      };
      const result = await autoModService.evaluateMessage(mockMessage);
      expect(result).toBe(false);
    });
    it("should return false if no rules match", async () => {
      const mockMessage = {
        guild: { id: "guild123" },
        author: { bot: false, id: "user123" },
        member: { roles: { cache: { has: () => false } } },
        channel: { id: "channel123" },
        content: "hello world",
        mentions: { users: { size: 0 }, roles: { size: 0 } },
        attachments: { size: 0 }
      };
      autoModRepository.getRulesByEvent.mockResolvedValue([
        {
          id: "rule1",
          triggerType: "KEYWORD",
          triggerMetadata: { keywords: ["badword"] },
          actions: [],
          exemptChannels: [],
          exemptRoles: []
        }
      ]);
      const result = await autoModService.evaluateMessage(mockMessage);
      expect(result).toBe(false);
    });
    it("should return true and execute actions if rule matches", async () => {
      const mockDelete = jest.fn().mockResolvedValue(true);
      const mockMessage = {
        id: "msg123",
        guild: { id: "guild123" },
        author: { bot: false, id: "user123" },
        member: { roles: { cache: { has: () => false } } },
        channel: { id: "channel123", send: jest.fn().mockResolvedValue(true) },
        content: "this is a badword",
        deletable: true,
        delete: mockDelete,
        mentions: { users: { size: 0 }, roles: { size: 0 } },
        attachments: { size: 0 }
      };
      autoModRepository.getRulesByEvent.mockResolvedValue([
        {
          id: "rule1",
          triggerType: "KEYWORD",
          triggerMetadata: { keywords: ["badword"] },
          actions: [{ type: "DELETE_MESSAGE" }, { type: "WARN_USER" }],
          exemptChannels: [],
          exemptRoles: []
        }
      ]);
      const result = await autoModService.evaluateMessage(mockMessage);
      expect(result).toBe(true);
      expect(mockDelete).toHaveBeenCalled();
    });
  });
  describe("quarantineUser", () => {
    it("should quarantine a user successfully", async () => {
      const mockVaultRecord = {
        id: "vault1",
        guildId: "guild123",
        userId: "user123",
        originalRoles: ["role1"],
        reason: "Spam",
        quarantinedAt: /* @__PURE__ */ new Date()
      };
      autoModRepository.getQuarantineStatus.mockResolvedValue(null);
      autoModRepository.quarantineUser.mockResolvedValue(mockVaultRecord);
      const result = await autoModService.quarantineUser(
        "guild123",
        "user123",
        null,
        "Spam",
        "admin123"
      );
      expect(result).toEqual(mockVaultRecord);
      expect(autoModRepository.quarantineUser).toHaveBeenCalledWith({
        guildId: "guild123",
        userId: "user123",
        originalRoles: [],
        reason: "Spam",
        jailedBy: "admin123"
      });
    });
  });
});
