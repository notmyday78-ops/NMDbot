"use strict";
import { EmbedBuilder, Events } from "discord.js";
import { modLogService } from "../services/modLogService";
import { t } from "../i18n";
import { logger } from "../utils/logger";
export const name = Events.MessageDelete;
export const once = false;
export async function execute(message) {
  if (!message.guild) {
    return;
  }
  try {
    if (message.partial) {
      try {
        await message.fetch();
      } catch (error) {
        logger.debug(`Failed to fetch partial message ${message.id}:`, error);
      }
    }
    const authorTag = message.author ? `${message.author.tag} (${message.author.id})` : t("modLogs.message.unknownAuthor");
    const channelMention = message.channelId ? `<#${message.channelId}>` : t("common.unknown");
    const content = message.content && message.content.trim().length > 0 ? message.content.trim().slice(0, 1024) : t("modLogs.message.empty");
    const attachments = message.attachments && message.attachments.size > 0 ? Array.from(message.attachments.values()) : [];
    const embed = new EmbedBuilder().setColor(16731469).setTitle(t("modLogs.message.delete.title")).setDescription(
      t("modLogs.message.delete.description", {
        channel: channelMention
      })
    ).addFields(
      {
        name: t("modLogs.fields.user"),
        value: authorTag,
        inline: false
      },
      {
        name: t("modLogs.fields.channel"),
        value: channelMention,
        inline: true
      },
      {
        name: t("modLogs.fields.messageId"),
        value: message.id ?? t("common.unknown"),
        inline: true
      },
      {
        name: t("modLogs.fields.content"),
        value: content,
        inline: false
      }
    ).setTimestamp(message.createdAt ?? /* @__PURE__ */ new Date());
    if (attachments.length > 0) {
      const attachmentList = attachments.slice(0, 5).map((attachment) => attachment.url).join("\n");
      embed.addFields({
        name: t("modLogs.fields.attachments"),
        value: attachmentList,
        inline: false
      });
    }
    await modLogService.sendLog(message.guild, "message", {
      embeds: [embed]
    });
  } catch (error) {
    logger.error("Failed to log deleted message:", error);
  }
}
