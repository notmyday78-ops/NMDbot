"use strict";
import {
  PermissionFlagsBits
} from "discord.js";
import { logger } from "../utils/logger";
export const PermissionPresets = {
  // Owner only
  OWNER_ONLY: {
    users: process.env.BOT_OWNER_ID ? [process.env.BOT_OWNER_ID] : [],
    allowOwner: true
  },
  // Admin only
  ADMIN_ONLY: {
    permissions: [PermissionFlagsBits.Administrator],
    allowOwner: true,
    allowAdmin: true
  },
  // Moderator permissions
  MODERATOR: {
    permissions: [
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.ModerateMembers
    ],
    requireAll: false,
    allowAdmin: true
  },
  // Server manager
  SERVER_MANAGER: {
    permissions: [
      PermissionFlagsBits.ManageGuild,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ManageRoles
    ],
    requireAll: false,
    allowAdmin: true
  },
  // Member management
  MEMBER_MANAGER: {
    permissions: [
      PermissionFlagsBits.ManageNicknames,
      PermissionFlagsBits.ManageRoles,
      PermissionFlagsBits.KickMembers
    ],
    requireAll: false,
    allowAdmin: true
  },
  // Channel management
  CHANNEL_MANAGER: {
    permissions: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageWebhooks],
    requireAll: false,
    allowAdmin: true
  },
  // Voice permissions
  VOICE_MANAGER: {
    permissions: [
      PermissionFlagsBits.MoveMembers,
      PermissionFlagsBits.MuteMembers,
      PermissionFlagsBits.DeafenMembers
    ],
    requireAll: false,
    allowAdmin: true
  },
  // Basic user
  BASIC_USER: {
    permissions: [PermissionFlagsBits.SendMessages],
    denyBots: true
  },
  // Premium user
  PREMIUM_USER: {
    requiredBoosts: 1,
    denyBots: true
  },
  // Trusted user (30 days in server)
  TRUSTED_USER: {
    minServerAge: 30,
    minAccountAge: 30,
    denyBots: true
  }
};
export class PermissionChecker {
  static botOwners = new Set(
    (process.env.BOT_OWNERS || process.env.BOT_OWNER_ID || "").split(",").filter(Boolean)
  );
  /**
   * Main permission check function
   */
  static async check(interaction, requirements) {
    const member = interaction.member;
    const guild = interaction.guild;
    if (!guild) {
      return { allowed: false, reason: "This command can only be used in a server" };
    }
    if (requirements.allowOwner !== false && this.isBotOwner(interaction.user.id)) {
      return { allowed: true };
    }
    if (requirements.denyBots && interaction.user.bot) {
      return {
        allowed: false,
        reason: "Bots are not allowed to use this command"
      };
    }
    if (requirements.allowAdmin && member.permissions.has(PermissionFlagsBits.Administrator)) {
      return { allowed: true };
    }
    if (requirements.users && requirements.users.length > 0) {
      if (!requirements.users.includes(interaction.user.id)) {
        return {
          allowed: false,
          reason: "You are not authorized to use this command"
        };
      }
    }
    if (requirements.channels && requirements.channels.length > 0) {
      if (!requirements.channels.includes(interaction.channelId)) {
        return {
          allowed: false,
          reason: "This command cannot be used in this channel"
        };
      }
    }
    if (requirements.categories && requirements.categories.length > 0) {
      const channel = interaction.channel;
      if (!channel.parentId || !requirements.categories.includes(channel.parentId)) {
        return {
          allowed: false,
          reason: "This command cannot be used in this category"
        };
      }
    }
    if (requirements.permissions && requirements.permissions.length > 0) {
      const missingPerms = this.checkPermissions(
        member,
        requirements.permissions,
        requirements.requireAll
      );
      if (missingPerms.length > 0) {
        return {
          allowed: false,
          reason: "You lack the required permissions",
          missingPermissions: missingPerms
        };
      }
    }
    if (requirements.roles && requirements.roles.length > 0) {
      const missingRoles = this.checkRoles(member, requirements.roles);
      if (missingRoles.length > 0) {
        return {
          allowed: false,
          reason: "You lack the required roles",
          missingRoles
        };
      }
    }
    if (requirements.minAccountAge) {
      const accountAge = (Date.now() - interaction.user.createdTimestamp) / 864e5;
      if (accountAge < requirements.minAccountAge) {
        return {
          allowed: false,
          reason: `Your account must be at least ${requirements.minAccountAge} days old`
        };
      }
    }
    if (requirements.minServerAge) {
      const joinedTimestamp = member.joinedTimestamp;
      if (!joinedTimestamp) {
        return {
          allowed: false,
          reason: "Unable to verify server membership duration"
        };
      }
      const serverAge = (Date.now() - joinedTimestamp) / 864e5;
      if (serverAge < requirements.minServerAge) {
        return {
          allowed: false,
          reason: `You must be in this server for at least ${requirements.minServerAge} days`
        };
      }
    }
    if (requirements.requiredBoosts) {
      const boostLevel = guild.premiumTier;
      if (boostLevel < requirements.requiredBoosts) {
        return {
          allowed: false,
          reason: `This server needs to be boost level ${requirements.requiredBoosts}`
        };
      }
    }
    if (requirements.requireHierarchy) {
      const targetUser = interaction.options.getUser("user") || interaction.options.getUser("target");
      if (targetUser) {
        const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
        if (targetMember) {
          if (!this.checkHierarchy(member, targetMember)) {
            return {
              allowed: false,
              reason: "You cannot perform this action on someone with a higher or equal role"
            };
          }
        }
      }
    }
    if (requirements.customCheck) {
      try {
        const customResult = await requirements.customCheck(interaction);
        if (!customResult) {
          return {
            allowed: false,
            reason: "Custom permission check failed"
          };
        }
      } catch (error) {
        logger.error("Custom permission check error:", error);
        return {
          allowed: false,
          reason: "Permission check failed"
        };
      }
    }
    return { allowed: true };
  }
  /**
   * Check if user is bot owner
   */
  static isBotOwner(userId) {
    return this.botOwners.has(userId);
  }
  /**
   * Check Discord permissions
   */
  static checkPermissions(member, required, requireAll = true) {
    const missing = [];
    const memberPerms = member.permissions.bitfield;
    for (const perm of required) {
      if ((memberPerms & perm) !== perm) {
        missing.push(this.getPermissionName(perm));
      }
    }
    if (requireAll) {
      return missing;
    } else {
      return missing.length === required.length ? missing : [];
    }
  }
  /**
   * Check role requirements
   */
  static checkRoles(member, required) {
    const missing = [];
    for (const roleId of required) {
      if (!member.roles.cache.has(roleId)) {
        const role = member.guild.roles.cache.get(roleId);
        missing.push(role?.name || roleId);
      }
    }
    return missing;
  }
  /**
   * Check role hierarchy
   */
  static checkHierarchy(executor, target) {
    if (this.isBotOwner(executor.id)) {
      return true;
    }
    if (this.isBotOwner(target.id)) {
      return false;
    }
    if (executor.id === executor.guild.ownerId) {
      return true;
    }
    if (target.id === target.guild.ownerId) {
      return false;
    }
    const executorHighest = executor.roles.highest;
    const targetHighest = target.roles.highest;
    return executorHighest.comparePositionTo(targetHighest) > 0;
  }
  /**
   * Get permission name from bitfield
   */
  static getPermissionName(permission) {
    const perms = {
      [PermissionFlagsBits.Administrator.toString()]: "Administrator",
      [PermissionFlagsBits.ManageGuild.toString()]: "Manage Server",
      [PermissionFlagsBits.ManageRoles.toString()]: "Manage Roles",
      [PermissionFlagsBits.ManageChannels.toString()]: "Manage Channels",
      [PermissionFlagsBits.KickMembers.toString()]: "Kick Members",
      [PermissionFlagsBits.BanMembers.toString()]: "Ban Members",
      [PermissionFlagsBits.ManageMessages.toString()]: "Manage Messages",
      [PermissionFlagsBits.ManageWebhooks.toString()]: "Manage Webhooks",
      [PermissionFlagsBits.ManageNicknames.toString()]: "Manage Nicknames",
      [PermissionFlagsBits.ModerateMembers.toString()]: "Timeout Members",
      [PermissionFlagsBits.MoveMembers.toString()]: "Move Members",
      [PermissionFlagsBits.MuteMembers.toString()]: "Mute Members",
      [PermissionFlagsBits.DeafenMembers.toString()]: "Deafen Members"
    };
    return perms[permission.toString()] || "Unknown Permission";
  }
  /**
   * Check if member can act on target role
   */
  static canManageRole(member, role) {
    if (this.isBotOwner(member.id)) {
      return true;
    }
    if (member.id === member.guild.ownerId) {
      return true;
    }
    if (!member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return false;
    }
    return member.roles.highest.comparePositionTo(role) > 0;
  }
  /**
   * Check if member can act in channel
   */
  static canActInChannel(member, channel, permission) {
    if (this.isBotOwner(member.id)) {
      return true;
    }
    const perms = channel.permissionsFor(member);
    return perms ? perms.has(permission) : false;
  }
  /**
   * Create a permission requirement from command options
   */
  static createRequirement(options) {
    const requirement = {
      allowOwner: true,
      denyBots: true
    };
    if (options.ownerOnly) {
      return PermissionPresets.OWNER_ONLY;
    }
    if (options.adminOnly) {
      return PermissionPresets.ADMIN_ONLY;
    }
    if (options.modOnly) {
      return PermissionPresets.MODERATOR;
    }
    if (options.permissions) {
      requirement.permissions = options.permissions;
      requirement.allowAdmin = true;
    }
    if (options.roles) {
      requirement.roles = options.roles;
    }
    if (options.users) {
      requirement.users = options.users;
    }
    if (options.trusted) {
      requirement.minServerAge = 30;
      requirement.minAccountAge = 30;
    }
    if (options.premium) {
      requirement.requiredBoosts = 1;
    }
    return requirement;
  }
}
export async function checkPermissions(interaction, requirements) {
  if (typeof requirements === "string") {
    const preset = PermissionPresets[requirements];
    if (!preset) {
      logger.error(`Unknown permission preset: ${requirements}`);
      return {
        allowed: false,
        reason: "Invalid permission configuration"
      };
    }
    requirements = preset;
  }
  try {
    const result = await PermissionChecker.check(interaction, requirements);
    if (!result.allowed) {
      logger.debug(
        `Permission denied for ${interaction.user.tag} (${interaction.user.id}) in ${interaction.guild?.name} (${interaction.guildId}) for command ${interaction.commandName}: ${result.reason}`
      );
    }
    return result;
  } catch (error) {
    logger.error("Permission check error:", error);
    return {
      allowed: false,
      reason: "Permission check failed"
    };
  }
}
export class DynamicPermissions {
  static customPermissions = /* @__PURE__ */ new Map();
  /**
   * Register custom permission set
   */
  static register(name, requirements) {
    this.customPermissions.set(name, requirements);
    logger.debug(`Registered custom permission set: ${name}`);
  }
  /**
   * Get custom permission set
   */
  static get(name) {
    return this.customPermissions.get(name);
  }
  /**
   * Check custom permission
   */
  static async check(name, interaction) {
    const requirements = this.customPermissions.get(name);
    if (!requirements) {
      return {
        allowed: false,
        reason: `Unknown permission set: ${name}`
      };
    }
    return PermissionChecker.check(interaction, requirements);
  }
}
export const permissionChecker = new PermissionChecker();
export default PermissionChecker;
