"use strict";
import { EmbedBuilder, Events, AttachmentBuilder } from "discord.js";
import { modLogService } from "../services/modLogService";
import { configurationService } from "../services/configurationService";
import { t } from "../i18n";
import { logger } from "../utils/logger";
import { generateWelcomeImage } from "../utils/canvas";
export const name = Events.GuildMemberAdd;
export const once = false;
function formatMessage(text, member) {
  return text.replace(/{user}/gi, member.toString()).replace(/{user\.tag}/gi, member.user.tag).replace(/{user\.name}/gi, member.user.username).replace(/{server}/gi, member.guild.name).replace(/{memberCount}/gi, member.guild.memberCount.toString());
}
export async function execute(member) {
  try {
    const welcomeConfig = await configurationService.getWelcomeConfig(member.guild.id);
    if (welcomeConfig.enabled) {
      if (welcomeConfig.channel) {
        const channel = member.guild.channels.cache.get(welcomeConfig.channel);
        if (channel && channel.isTextBased()) {
          const content = welcomeConfig.message ? formatMessage(welcomeConfig.message, member) : void 0;
          let attachment;
          if (welcomeConfig.imageEnabled) {
            try {
              const buffer = await generateWelcomeImage(member, welcomeConfig.embedImage);
              attachment = new AttachmentBuilder(buffer, { name: "welcome.png" });
            } catch (err) {
              logger.error("Failed to generate welcome image:", err);
            }
          }
          if (welcomeConfig.embedEnabled) {
            const embed2 = new EmbedBuilder().setColor(
              welcomeConfig.embedColor || 39423
            );
            if (welcomeConfig.embedTitle) {
              embed2.setTitle(formatMessage(welcomeConfig.embedTitle, member));
            }
            if (content) {
              embed2.setDescription(content);
            }
            if (attachment) {
              embed2.setImage("attachment://welcome.png");
            } else if (welcomeConfig.embedImage) {
              embed2.setImage(welcomeConfig.embedImage);
            }
            if (welcomeConfig.embedThumbnail) {
              embed2.setThumbnail(welcomeConfig.embedThumbnail);
            } else {
              embed2.setThumbnail(member.user.displayAvatarURL());
            }
            await channel.send({
              content: !welcomeConfig.embedEnabled ? content : void 0,
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
      if (welcomeConfig.dmEnabled && welcomeConfig.dmMessage) {
        try {
          const dmContent = formatMessage(welcomeConfig.dmMessage, member);
          await member.send({ content: dmContent });
        } catch (err) {
        }
      }
    }
    const embed = new EmbedBuilder().setColor(5763719).setTitle(t("modLogs.member.join.title")).setDescription(
      t("modLogs.member.join.description", {
        user: member.user.tag
      })
    ).setThumbnail(member.user.displayAvatarURL()).addFields(
      {
        name: t("modLogs.fields.user"),
        value: `${member.user.tag} (${member.id})`,
        inline: false
      },
      {
        name: t("modLogs.fields.accountCreated"),
        value: `<t:${Math.floor(member.user.createdTimestamp / 1e3)}:R>`,
        inline: true
      },
      {
        name: t("modLogs.fields.joinedAt"),
        value: member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1e3)}:F>` : t("common.unknown"),
        inline: true
      }
    ).setTimestamp();
    await modLogService.sendLog(member.guild, "member", {
      embeds: [embed]
    });
  } catch (error) {
    logger.error("Failed to log member join:", error);
  }
}
