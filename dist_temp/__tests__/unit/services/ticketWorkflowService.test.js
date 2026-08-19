"use strict";
import { ticketWorkflowService } from "../../../services/ticketWorkflowService";
import { ticketWorkflowRepository } from "../../../repositories/ticketWorkflowRepository";
import { ticketRepository } from "../../../repositories/ticketRepository";
jest.mock("../../../repositories/ticketWorkflowRepository");
jest.mock("../../../repositories/ticketRepository");
jest.mock("../../../utils/logger");
describe("TicketWorkflowService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  describe("sendPanelWithDepartments", () => {
    it("should throw an error if panel is not found or inactive", async () => {
      const mockGuild = { id: "guild123" };
      const mockChannel = { id: "channel123" };
      ticketWorkflowRepository.getPanelByCustomId.mockResolvedValue(null);
      await expect(
        ticketWorkflowService.sendPanelWithDepartments(mockGuild, mockChannel, "invalid_panel")
      ).rejects.toThrow();
    });
    it("should send embed with select menu if departments exist", async () => {
      const mockGuild = { id: "guild123" };
      const mockChannel = {
        id: "channel123",
        send: jest.fn().mockResolvedValue({ id: "msg123" })
      };
      ticketWorkflowRepository.getPanelByCustomId.mockResolvedValue({
        id: "panel_uuid",
        panelId: "panel1",
        guildId: "guild123",
        title: "Support Panel",
        description: "Select a dept",
        isActive: true
      });
      ticketWorkflowRepository.listDepartmentsByPanel.mockResolvedValue([
        {
          id: "dept_uuid",
          departmentId: "support",
          name: "General Support",
          description: "Help with general issues"
        }
      ]);
      await ticketWorkflowService.sendPanelWithDepartments(mockGuild, mockChannel, "panel1");
      expect(mockChannel.send).toHaveBeenCalled();
      expect(ticketRepository.setPanelMessage).toHaveBeenCalledWith(
        "panel1",
        "guild123",
        "msg123",
        "channel123"
      );
    });
  });
  describe("handleDepartmentSelect", () => {
    it("should show modal for selected department", async () => {
      const mockInteraction = {
        guild: { id: "guild123" },
        showModal: jest.fn().mockResolvedValue(true),
        reply: jest.fn().mockResolvedValue(true)
      };
      ticketWorkflowRepository.getDepartment.mockResolvedValue({
        id: "dept_uuid",
        departmentId: "support",
        name: "General Support",
        modalFields: [
          { customId: "reason", label: "Describe issue", style: "Paragraph", required: true }
        ]
      });
      await ticketWorkflowService.handleDepartmentSelect(mockInteraction, "panel_uuid", "support");
      expect(mockInteraction.showModal).toHaveBeenCalled();
    });
  });
});
