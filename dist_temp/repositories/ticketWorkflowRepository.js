"use strict";
import { and, eq } from "drizzle-orm";
import { BaseRepository } from "./baseRepository";
import { ticketDepartments, ticketRatings } from "../database/schema/ticket_workflows";
import { tickets, ticketPanels } from "../database/schema/tickets";
export class TicketWorkflowRepository extends BaseRepository {
  async createDepartment(data) {
    return this.executeQuery("createDepartment", async () => {
      const [record] = await this.db.insert(ticketDepartments).values({
        guildId: data.guildId,
        panelId: data.panelId,
        departmentId: data.departmentId,
        name: data.name,
        description: data.description,
        emoji: data.emoji,
        categoryId: data.categoryId,
        supportRoles: data.supportRoles ?? [],
        modalFields: data.modalFields ?? [],
        welcomeMessage: data.welcomeMessage,
        slaTimeoutMinutes: data.slaTimeoutMinutes ?? 60
      }).returning();
      return record;
    });
  }
  async getDepartment(guildId, panelId, departmentId) {
    return this.executeQuery("getDepartment", async () => {
      const [record] = await this.db.select().from(ticketDepartments).where(
        and(
          eq(ticketDepartments.guildId, guildId),
          eq(ticketDepartments.panelId, panelId),
          eq(ticketDepartments.departmentId, departmentId)
        )
      ).limit(1);
      return record || null;
    });
  }
  async listDepartmentsByPanel(guildId, panelDbId) {
    return this.executeQuery("listDepartmentsByPanel", async () => {
      const records = await this.db.select().from(ticketDepartments).where(
        and(eq(ticketDepartments.guildId, guildId), eq(ticketDepartments.panelId, panelDbId))
      );
      return records;
    });
  }
  async createTicketRating(data) {
    return this.executeQuery("createTicketRating", async () => {
      const [record] = await this.db.insert(ticketRatings).values({
        guildId: data.guildId,
        ticketId: data.ticketId,
        userId: data.userId,
        claimedBy: data.claimedBy,
        rating: data.rating,
        feedback: data.feedback
      }).returning();
      await this.db.update(tickets).set({ ratingId: record.id, updatedAt: /* @__PURE__ */ new Date() }).where(eq(tickets.id, data.ticketId));
      return record;
    });
  }
  async getTicketRating(ticketId) {
    return this.executeQuery("getTicketRating", async () => {
      const [record] = await this.db.select().from(ticketRatings).where(eq(ticketRatings.ticketId, ticketId)).limit(1);
      return record || null;
    });
  }
  async getTicket(ticketId) {
    return this.executeQuery("getTicket", async () => {
      const [record] = await this.db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1);
      return record || null;
    });
  }
  async getPanelByCustomId(guildId, panelCustomId) {
    return this.executeQuery("getPanelByCustomId", async () => {
      const [record] = await this.db.select().from(ticketPanels).where(and(eq(ticketPanels.guildId, guildId), eq(ticketPanels.panelId, panelCustomId))).limit(1);
      return record || null;
    });
  }
  async updateTicketDepartment(ticketId, departmentId) {
    return this.executeQuery("updateTicketDepartment", async () => {
      const [record] = await this.db.update(tickets).set({ departmentId, updatedAt: /* @__PURE__ */ new Date() }).where(eq(tickets.id, ticketId)).returning();
      return record || null;
    });
  }
  async updateTicketSlaBreached(ticketId, slaBreached) {
    return this.executeQuery("updateTicketSlaBreached", async () => {
      const [record] = await this.db.update(tickets).set({ slaBreached, updatedAt: /* @__PURE__ */ new Date() }).where(eq(tickets.id, ticketId)).returning();
      return record || null;
    });
  }
  async deleteDepartment(guildId, panelId, departmentId) {
    return this.executeQuery("deleteDepartment", async () => {
      const [record] = await this.db.delete(ticketDepartments).where(
        and(
          eq(ticketDepartments.guildId, guildId),
          eq(ticketDepartments.panelId, panelId),
          eq(ticketDepartments.departmentId, departmentId)
        )
      ).returning();
      return Boolean(record);
    });
  }
}
export const ticketWorkflowRepository = new TicketWorkflowRepository();
