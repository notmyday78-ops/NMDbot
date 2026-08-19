"use strict";
import { eq, and, desc, count, sql, or } from "drizzle-orm";
import { getDatabase } from "../database/connection";
import { ticketPanels, tickets, ticketMessages } from "../database/schema/tickets";
export class TicketRepository {
  get db() {
    return getDatabase();
  }
  // Panel operations
  async createPanel(data) {
    const [panel] = await this.db.insert(ticketPanels).values({
      ...data,
      supportRoles: data.supportRoles || []
    }).returning();
    return panel;
  }
  async updatePanel(panelId, guildId, updates) {
    const [panel] = await this.db.update(ticketPanels).set(updates).where(and(eq(ticketPanels.panelId, panelId), eq(ticketPanels.guildId, guildId))).returning();
    return panel;
  }
  async getPanel(panelId, guildId) {
    const [panel] = await this.db.select().from(ticketPanels).where(and(eq(ticketPanels.panelId, panelId), eq(ticketPanels.guildId, guildId)));
    return panel;
  }
  async getPanelById(id) {
    const [panel] = await this.db.select().from(ticketPanels).where(eq(ticketPanels.id, id));
    return panel;
  }
  async getPanelByMessage(messageId, channelId) {
    const [panel] = await this.db.select().from(ticketPanels).where(and(eq(ticketPanels.messageId, messageId), eq(ticketPanels.channelId, channelId)));
    return panel;
  }
  async getGuildPanels(guildId) {
    return await this.db.select().from(ticketPanels).where(eq(ticketPanels.guildId, guildId)).orderBy(desc(ticketPanels.createdAt));
  }
  async deletePanel(panelId, guildId) {
    const [deleted] = await this.db.delete(ticketPanels).where(and(eq(ticketPanels.panelId, panelId), eq(ticketPanels.guildId, guildId))).returning();
    return deleted;
  }
  async setPanelMessage(panelId, guildId, messageId, channelId) {
    const [panel] = await this.db.update(ticketPanels).set({ messageId, channelId }).where(and(eq(ticketPanels.panelId, panelId), eq(ticketPanels.guildId, guildId))).returning();
    return panel;
  }
  // Ticket operations
  async createTicket(data) {
    const [ticket] = await this.db.insert(tickets).values(data).returning();
    return ticket;
  }
  async getTicket(ticketId) {
    const [ticket] = await this.db.select().from(tickets).where(eq(tickets.id, ticketId));
    return ticket;
  }
  async getTicketByChannel(channelId) {
    const [ticket] = await this.db.select().from(tickets).where(eq(tickets.channelId, channelId));
    return ticket;
  }
  async getUserOpenTickets(userId, guildId) {
    return await this.db.select().from(tickets).where(
      and(
        eq(tickets.userId, userId),
        eq(tickets.guildId, guildId),
        or(eq(tickets.status, "open"), eq(tickets.status, "claimed"))
      )
    );
  }
  async getUserOpenTicketsByPanel(userId, panelId) {
    return await this.db.select().from(tickets).where(
      and(
        eq(tickets.userId, userId),
        eq(tickets.panelId, panelId),
        or(eq(tickets.status, "open"), eq(tickets.status, "claimed"))
      )
    );
  }
  async getNextTicketNumber(guildId) {
    const [result] = await this.db.select({ max: sql`COALESCE(MAX(ticket_number), 0)` }).from(tickets).where(eq(tickets.guildId, guildId));
    return (result?.max || 0) + 1;
  }
  async updateTicketStatus(ticketId, status, updatedBy) {
    const updates = { status };
    const now = /* @__PURE__ */ new Date();
    switch (status) {
      case "claimed":
        updates.claimedBy = updatedBy;
        break;
      case "closed":
        updates.closedBy = updatedBy;
        updates.closedAt = now;
        break;
      case "locked":
        updates.lockedBy = updatedBy;
        updates.lockedAt = now;
        break;
      case "frozen":
        updates.frozenBy = updatedBy;
        updates.frozenAt = now;
        break;
    }
    const [ticket] = await this.db.update(tickets).set(updates).where(eq(tickets.id, ticketId)).returning();
    return ticket;
  }
  async closeTicket(ticketId, closedBy, reason) {
    const [ticket] = await this.db.update(tickets).set({
      status: "closed",
      closedBy,
      closedAt: /* @__PURE__ */ new Date(),
      closedReason: reason
    }).where(eq(tickets.id, ticketId)).returning();
    return ticket;
  }
  async setTicketTranscript(ticketId, transcript) {
    const [ticket] = await this.db.update(tickets).set({ transcript }).where(eq(tickets.id, ticketId)).returning();
    return ticket;
  }
  // Message operations
  async addTicketMessage(ticketId, userId, content, attachments = []) {
    const [message] = await this.db.insert(ticketMessages).values({
      ticketId,
      userId,
      content,
      attachments
    }).returning();
    return message;
  }
  async getTicketMessages(ticketId) {
    return await this.db.select().from(ticketMessages).where(eq(ticketMessages.ticketId, ticketId)).orderBy(ticketMessages.createdAt);
  }
  // Stats
  async getTicketStats(guildId) {
    const [stats] = await this.db.select({
      total: count(),
      open: sql`COUNT(*) FILTER (WHERE status = 'open')`,
      claimed: sql`COUNT(*) FILTER (WHERE status = 'claimed')`,
      closed: sql`COUNT(*) FILTER (WHERE status = 'closed')`,
      locked: sql`COUNT(*) FILTER (WHERE status = 'locked')`,
      frozen: sql`COUNT(*) FILTER (WHERE status = 'frozen')`
    }).from(tickets).where(eq(tickets.guildId, guildId));
    return stats;
  }
}
export const ticketRepository = new TicketRepository();
