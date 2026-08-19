"use strict";
import { EmbedBuilder, Events } from "discord.js";
import { modLogService } from "../services/modLogService";
import { t } from "../i18n";
import { logger } from "../utils/logger";
export const name = Events.MessageUpdate;
export const once = false;
export async function execute(oldMessage, newMessage) {
  if (!newMessage.guild) {
    return;
  }
  try {
    if (oldMessage.partial) {
      try {
        await oldMessage.fetch();
      } catch (error) {
        logger.debug(`Failed to fetch partial old message ${oldMessage.id}:`, error);
      }
    }
    if (newMessage.partial) {
      try {
        await newMessage.fetch();
      } catch (error) {
        logger.debug(`Failed to fetch partial new message ${newMessage.id}:`, error);
      }
    }
    const oldContent = oldMessage.content ?? "";
    const newContent = newMessage.content ?? "";
    if (oldContent === newContent) {
      return;
    }
    const authorTag = newMessage.author ? `${newMessage.author.tag} (${newMessage.author.id})` : t("modLogs.message.unknownAuthor");
    const channelMention = newMessage.channelId ? `<#${newMessage.channelId}>` : t("common.unknown");
    const messageLink = newMessage.url || `https://discord.com/channels/${newMessage.guild.id}/${newMessage.channelId}/${newMessage.id}`;
    const embed = new EmbedBuilder().setColor(16761095).setTitle(t("modLogs.message.update.title")).setDescription(
      t("modLogs.message.update.description", {
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
        value: newMessage.id ?? t("common.unknown"),
        inline: true
      },
      {
        name: t("modLogs.fields.oldContent"),
        value: formatContent(oldContent),
        inline: false
      },
      {
        name: t("modLogs.fields.newContent"),
        value: formatContent(newContent),
        inline: false
      },
      {
        name: t("modLogs.fields.messageLink"),
        value: messageLink,
        inline: false
      }
    ).setTimestamp(newMessage.editedAt ?? /* @__PURE__ */ new Date());
    await modLogService.sendLog(newMessage.guild, "message", {
      embeds: [embed]
    });
  } catch (error) {
    logger.error("Failed to log message update:", error);
  }
}
function formatContent(content) {
  if (!content || content.trim().length === 0) {
    return t("modLogs.message.empty");
  }
  const trimmed = content.trim();
  return trimmed.length > 1024 ? `${trimmed.slice(0, 1021)}...` : trimmed;
}
