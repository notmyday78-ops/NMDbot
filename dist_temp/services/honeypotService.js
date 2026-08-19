"use strict";
import { modLogService } from "./modLogService";
import { logger } from "../utils/logger";
import { EmbedFactory } from "../utils/EmbedFactory";
export async function evaluateHoneypot(message, settings) {
  if (!settings || !settings.honeypotChannelId) {
    return false;
  }
  if (message.channel.id !== settings.honeypotChannelId) {
    return false;
  }
  if (message.member?.permissions.has("Administrator") || message.author.bot) {
    return false;
  }
  try {
    const timeoutDurationMs = 24 * 60 * 60 * 1e3;
    await message.member?.timeout(timeoutDurationMs, "Triggered Scammer Honeypot");
    if (message.deletable) {
      await message.delete();
    }
    if (message.guild) {
      const embed = EmbedFactory.error(
        `User ${message.author} (\`${message.author.id}\`) triggered the honeypot in <#${message.channel.id}>.
They have been automatically timed out for 24 hours.

**Message Content:**
\`\`\`
${message.content}
\`\`\``,
        "\u{1F36F} Honeypot Triggered"
      );
      await modLogService.sendLog(message.guild, "moderation", { embeds: [embed] });
    }
    return true;
  } catch (error) {
    logger.error(`Failed to execute honeypot action on ${message.author.id}:`, error);
    return false;
  }
}
