"use strict";
import { EmbedBuilder, Events, AttachmentBuilder } from "discord.js";
import { modLogService } from "../services/modLogService";
import { configurationService } from "../services/configurationService";
import { t } from "../i18n";
import { logger } from "../utils/logger";
import { generateGoodbyeImage } from "../utils/canvas";
export const name = Events.GuildMemberRemove;
export const once = false;
function formatMessage(text, member) {
  return text.replace(/{user}/gi, member.user.tag).replace(/{user\.tag}/gi, member.user.tag).replace(/{user\.name}/gi, member.user.username).replace(/{server}/gi, member.guild.name).replace(/{memberCount}/gi, member.guild.memberCount.toString());
}
export async function execute(member) {
  try {
    const goodbyeConfig = await configurationService.getGoodbyeConfig(member.guild.id);
    if (goodbyeConfig.enabled && goodbyeConfig.channel) {
      const channel = member.guild.channels.cache.get(goodbyeConfig.channel);
      if (channel && channel.isTextBased()) {
        const content = goodbyeConfig.message ? formatMessage(goodbyeConfig.message, member) : void 0;
        let attachment;
        if (goodbyeConfig.imageEnabled) {
          try {
            const buffer = await generateGoodbyeImage(member, goodbyeConfig.embedImage);
            attachment = new AttachmentBuilder(buffer, { name: "goodbye.png" });
          } catch (err) {
            logger.error("Failed to generate goodbye image:", err);
          }
        }
        if (goodbyeConfig.embedEnabled) {
          const embed2 = new EmbedBuilder().setColor(goodbyeConfig.embedColor || 16711680);
          if (goodbyeConfig.embedTitle) {
            embed2.setTitle(formatMessage(goodbyeConfig.embedTitle, member));
          }
          if (content) {
            embed2.setDescription(content);
          }
          if (attachment) {
            embed2.setImage("attachment://goodbye.png");
          } else if (goodbyeConfig.embedImage) {
            embed2.setImage(goodbyeConfig.embedImage);
          }
          if (goodbyeConfig.embedThumbnail) {
            embed2.setThumbnail(goodbyeConfig.embedThumbnail);
          } else {
            embed2.setThumbnail(member.user.displayAvatarURL());
          }
          await channel.send({
            content: !goodbyeConfig.embedEnabled ? content : void 0,
            embeds: [embed2],
            files: attachment ? [attachment] : void 0
          }).catch(() => null);
        } else if (content || attachment) {
          await channel.send({
            content,
            files: attachment ? [attachment] : void 0
          }).catch(() => null);
        }
      }
    }
    const embed = new EmbedBuilder().setColor(15548997).setTitle(t("modLogs.member.leave.title")).setDescription(
      t("modLogs.member.leave.description", {
        user: member.user.tag
      })
    ).setThumbnail(member.user.displayAvatarURL()).addFields(
      {
        name: t("modLogs.fields.user"),
        value: `${member.user.tag} (${member.id})`,
        inline: false
      },
      {
        name: t("modLogs.fields.joinedAt"),
        value: member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1e3)}:F>` : t("common.unknown"),
        inline: true
      },
      {
        name: t("modLogs.fields.leftAt"),
        value: `<t:${Math.floor(Date.now() / 1e3)}:F>`,
        inline: true
      }
    ).setTimestamp();
    await modLogService.sendLog(member.guild, "member", {
      embeds: [embed]
    });
  } catch (error) {
    logger.error("Failed to log member leave:", error);
  }
}
