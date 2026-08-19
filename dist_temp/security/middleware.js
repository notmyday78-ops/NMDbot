"use strict";
import {
  PermissionFlagsBits,
  EmbedBuilder,
  ApplicationCommandOptionType
} from "discord.js";
import { checkCommandRateLimit } from "./rateLimiter";
import { PermissionManager } from "./permissions";
import { Validator, CommandSchemas, ValidationError } from "./validator";
import { Sanitizer } from "./sanitizer";
import { auditLogger } from "./audit";
import { logger } from "../utils/logger";
import { t } from "../i18n";
import { securityService } from "../services/securityService";
export async function securityMiddleware(interaction, command) {
  const context = {
    userId: interaction.user.id,
    guildId: interaction.guildId || "",
    channelId: interaction.channelId,
    commandName: `${command.data.name}`,
    timestamp: Date.now(),
    isOwner: PermissionManager.isBotOwner(interaction.user.id),
    permissions: interaction.member && "permissions" in interaction.member ? interaction.member.permissions.bitfield : 0n
  };
  try {
    if (process.env.MAINTENANCE_MODE === "true" && !context.isOwner) {
      return {
        passed: false,
        error: t("security.maintenance"),
        code: "MAINTENANCE"
      };
    }
    const blacklistCheck = await checkBlacklist(context);
    if (!blacklistCheck.passed) {
      return blacklistCheck;
    }
    const rateLimitCheck = await checkRateLimit(context);
    if (!rateLimitCheck.passed) {
      await handleRateLimit(interaction, rateLimitCheck.details);
      return rateLimitCheck;
    }
    if (command.permissions && command.permissions.length > 0) {
      const permissionBits = command.permissions.map((p) => {
        if (typeof p === "bigint") return p;
        if (typeof p === "string") {
          const permissionFlag = PermissionFlagsBits[p];
          if (permissionFlag !== void 0) {
            return permissionFlag;
          }
          try {
            return BigInt(p);
          } catch {
            return 0n;
          }
        }
        if (typeof p === "number") return BigInt(p);
        if (Array.isArray(p)) {
          return p.reduce((acc, perm) => {
            if (typeof perm === "bigint") return acc | perm;
            if (typeof perm === "string") {
              const flag = PermissionFlagsBits[perm];
              return flag ? acc | flag : acc;
            }
            if (typeof perm === "number") return acc | BigInt(perm);
            return acc;
          }, 0n);
        }
        return 0n;
      });
      const permissionCheck = await PermissionManager.checkCommandPermissions(
        interaction,
        permissionBits
      );
      if (!permissionCheck.allowed) {
        await handlePermissionDenied(interaction, permissionCheck);
        return {
          passed: false,
          error: permissionCheck.reason,
          code: "PERMISSION",
          details: permissionCheck
        };
      }
    }
    const validationCheck = validateCommandInput(interaction, command);
    if (!validationCheck.passed) {
      const error = validationCheck.error || "Validation failed";
      await handleValidationError(interaction, error);
      return validationCheck;
    }
    await auditLogger.logAction({
      action: "COMMAND_EXECUTE",
      userId: context.userId,
      guildId: context.guildId,
      targetId: context.channelId,
      details: {
        command: context.commandName,
        options: sanitizeOptions([...interaction.options.data])
      }
    });
    return { passed: true };
  } catch (error) {
    logger.error("Security middleware error:", error);
    return {
      passed: false,
      error: t("security.error"),
      code: "VALIDATION"
    };
  }
}
async function checkBlacklist(context) {
  const userBlacklisted = await securityService.isBlacklisted("user", context.userId);
  if (userBlacklisted) {
    return {
      passed: false,
      error: t("security.blacklisted.user"),
      code: "BLACKLIST"
    };
  }
  const guildBlacklisted = await securityService.isBlacklisted("guild", context.guildId);
  if (guildBlacklisted) {
    return {
      passed: false,
      error: t("security.blacklisted.guild"),
      code: "BLACKLIST"
    };
  }
  return { passed: true };
}
async function checkRateLimit(context) {
  if (context.isOwner) {
    return { passed: true };
  }
  if ((context.permissions & PermissionFlagsBits.Administrator) === PermissionFlagsBits.Administrator) {
    return { passed: true };
  }
  const result = await checkCommandRateLimit(context.userId, context.guildId, context.commandName);
  if (!result.allowed) {
    return {
      passed: false,
      error: t("security.rateLimit", {
        seconds: Math.ceil(result.msBeforeNext / 1e3)
      }),
      code: "RATE_LIMIT",
      details: result
    };
  }
  return { passed: true };
}
function validateCommandInput(interaction, command) {
  const commandName = command.data.name;
  const subcommand = interaction.options.getSubcommand(false);
  const subcommandGroup = interaction.options.getSubcommandGroup(false);
  let schema = null;
  const commandSchemas = CommandSchemas;
  if (subcommandGroup && subcommand) {
    const groupSchemas = commandSchemas[commandName];
    if (groupSchemas && typeof groupSchemas === "object") {
      const subcommandSchemas = groupSchemas[subcommandGroup];
      if (subcommandSchemas && typeof subcommandSchemas === "object") {
        schema = subcommandSchemas[subcommand];
      }
    }
  } else if (subcommand) {
    const subcommandSchemas = commandSchemas[commandName];
    if (subcommandSchemas && typeof subcommandSchemas === "object") {
      schema = subcommandSchemas[subcommand];
    }
  } else {
    const defaultSchemas = commandSchemas[commandName];
    if (defaultSchemas && typeof defaultSchemas === "object") {
      schema = defaultSchemas["default"];
    }
  }
  if (!schema) {
    return { passed: true };
  }
  try {
    const options = {};
    let targetOptions = interaction.options.data;
    if (subcommandGroup) {
      const group = targetOptions.find(
        (opt) => opt.name === subcommandGroup && opt.type === ApplicationCommandOptionType.SubcommandGroup
      );
      if (group?.options) {
        targetOptions = group.options;
      }
    }
    if (subcommand) {
      const sub = targetOptions.find(
        (opt) => opt.name === subcommand && opt.type === ApplicationCommandOptionType.Subcommand
      );
      if (sub?.options) {
        targetOptions = sub.options;
      }
    }
    targetOptions.forEach((opt) => {
      if (opt.name === "user" && commandName === "warn") {
        options["userId"] = opt.value;
      } else if (opt.name === "user" && (commandName === "moderation" || commandName === "blacklist")) {
        options["userId"] = opt.value;
      } else {
        options[opt.name] = opt.value;
      }
    });
    Validator.validate(schema, options);
    performSecurityChecks(options);
    return { passed: true };
  } catch (error) {
    if (error instanceof ValidationError) {
      return {
        passed: false,
        error: error.message,
        code: "VALIDATION"
      };
    }
    throw error;
  }
}
function performSecurityChecks(options) {
  for (const value of Object.values(options)) {
    if (typeof value === "string") {
      if (Sanitizer.hasMassMentions(value)) {
        throw new ValidationError("Mass mentions are not allowed");
      }
      if (value.length > 100 && Sanitizer.isSpam(value)) {
        throw new ValidationError("Message appears to be spam");
      }
      const urlMatch = value.match(/https?:\/\/[^\s]+/gi);
      if (urlMatch) {
        for (const url of urlMatch) {
          if (!Validator.isUrlSafe(url)) {
            throw new ValidationError("Unsafe URL detected");
          }
        }
      }
    }
  }
}
async function handleRateLimit(interaction, result) {
  const embed = new EmbedBuilder().setColor(16711680).setTitle("Rate Limit").setDescription(t("security.rateLimit.description")).addFields(
    {
      name: "Time Remaining",
      value: `${Math.ceil(result.msBeforeNext / 1e3)} seconds`,
      inline: true
    },
    {
      name: "Status",
      value: result.isBlocked ? "Temporarily Blocked" : "Rate Limited",
      inline: true
    }
  ).setFooter({ text: "Please slow down and try again later" }).setTimestamp();
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp({ embeds: [embed], ephemeral: true });
  } else {
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}
async function handlePermissionDenied(interaction, check) {
  const embed = new EmbedBuilder().setColor(16711680).setTitle("Permission Denied").setDescription(check.reason || t("security.permission.denied")).setTimestamp();
  if (check.missingPermissions && check.missingPermissions.length > 0) {
    embed.addFields({
      name: "Missing Permissions",
      value: check.missingPermissions.join(", "),
      inline: false
    });
  }
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp({ embeds: [embed], ephemeral: true });
  } else {
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}
async function handleValidationError(interaction, error) {
  const embed = new EmbedBuilder().setColor(16711680).setTitle("Invalid Input").setDescription(error).setFooter({ text: "Please check your input and try again" }).setTimestamp();
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp({ embeds: [embed], ephemeral: true });
  } else {
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}
function sanitizeOptions(options) {
  return options.map((opt) => {
    if (typeof opt === "object" && opt !== null && "name" in opt && "type" in opt) {
      const option = opt;
      return {
        name: option.name,
        type: option.type,
        value: typeof option.value === "string" ? Sanitizer.removeSensitive(option.value) : option.value,
        options: option.options ? sanitizeOptions(option.options) : void 0
      };
    }
    return opt;
  });
}
export async function messageSecurityMiddleware(message) {
  if (message.author.bot) {
    return { passed: true };
  }
  if (!message.guild) {
    return { passed: true };
  }
  const content = message.content;
  if (Sanitizer.isSpam(content)) {
    await message.delete().catch(() => {
    });
    return {
      passed: false,
      error: "Message detected as spam",
      code: "VALIDATION"
    };
  }
  if (Sanitizer.hasMassMentions(content)) {
    await message.delete().catch(() => {
    });
    await message.member?.timeout(3e5, "Mass mention spam").catch(() => {
    });
    return {
      passed: false,
      error: "Mass mentions detected",
      code: "VALIDATION"
    };
  }
  return { passed: true };
}
export function createSecurityReport(title, severity, details, actions) {
  const colors = {
    low: 65280,
    medium: 16776960,
    high: 16753920,
    critical: 16711680
  };
  const embed = new EmbedBuilder().setColor(colors[severity]).setTitle(`Security Alert: ${title}`).setDescription(details).addFields({
    name: "Severity",
    value: severity.toUpperCase(),
    inline: true
  }).setTimestamp();
  if (actions && actions.length > 0) {
    embed.addFields({
      name: "Recommended Actions",
      value: actions.map((a, i) => `${i + 1}. ${a}`).join("\n"),
      inline: false
    });
  }
  return embed;
}
