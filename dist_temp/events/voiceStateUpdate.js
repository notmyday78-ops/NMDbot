"use strict";
import { Events } from "discord.js";
import { xpService } from "../services/xpService";
import { configurationService } from "../services/configurationService";
import { guildService } from "../services/guildService";
import { logger } from "../utils/logger";
import { jtcService } from "../services/jtcService";
import { engagementService } from "../services/engagementService";
export const name = Events.VoiceStateUpdate;
export const once = false;
export async function execute(oldState, newState) {
  if (newState.member?.user.bot) return;
  try {
    if (!oldState.channel && newState.channel) {
      await handleVoiceJoin(newState);
    } else if (oldState.channel && !newState.channel) {
      await handleVoiceLeave(oldState);
    } else if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
      await handleVoiceLeave(oldState);
      await handleVoiceJoin(newState);
    } else if (oldState.channel && newState.channel && oldState.channel.id === newState.channel.id) {
      const wasMuted = oldState.mute || oldState.deaf || oldState.selfMute || oldState.selfDeaf;
      const isMuted = newState.mute || newState.deaf || newState.selfMute || newState.selfDeaf;
      if (!wasMuted && isMuted) {
        await handleVoiceLeave(newState);
      } else if (wasMuted && !isMuted) {
        await handleVoiceJoin(newState);
      }
    }
  } catch (error) {
    logger.error("Error in voiceStateUpdate event:", error);
  }
}
async function handleVoiceJoin(state) {
  if (!state.guild || !state.member) return;
  await jtcService.handleVoiceJoin(state);
  try {
    await guildService.ensureGuild(state.guild);
    const config = await configurationService.getXPConfig(state.guild.id);
    if (!config.enabled) return;
    if (state.channel && config.ignoredChannels.includes(state.channel.id)) return;
    if (state.mute || state.deaf || state.selfMute || state.selfDeaf) return;
    xpService.startVoiceTracking(state.member.id, state.guild.id);
  } catch (error) {
    logger.error("Failed to handle voice join:", error);
  }
}
async function handleVoiceLeave(state) {
  if (!state.guild || !state.member) return;
  await jtcService.handleVoiceLeave(state);
  try {
    const voiceStates = xpService.getAllVoiceStates();
    const startTime = voiceStates.get(`${state.member.id}-${state.guild.id}`);
    if (startTime) {
      const minutes = Math.floor((Date.now() - startTime) / 6e4);
      if (minutes > 0) {
        await engagementService.trackVoiceActivity(
          state.member.id,
          state.guild.id,
          state.member,
          minutes
        );
      }
    }
    const result = await xpService.stopVoiceTracking(state.member.id, state.guild.id, state.member);
    if (result && result.leveledUp) {
      if (result.rewardRoles && result.rewardRoles.length > 0) {
        for (const roleId of result.rewardRoles) {
          try {
            const role = state.guild.roles.cache.get(roleId);
            if (role && !state.member.roles.cache.has(roleId)) {
              await state.member.roles.add(role);
            }
          } catch (error) {
            logger.error(`Failed to add role ${roleId} to member ${state.member.id}:`, error);
          }
        }
      }
      if (result.rolesToRemove && result.rolesToRemove.length > 0) {
        for (const roleId of result.rolesToRemove) {
          try {
            if (state.member.roles.cache.has(roleId)) {
              await state.member.roles.remove(roleId);
            }
          } catch (error) {
            logger.error(`Failed to remove role ${roleId} from member ${state.member.id}:`, error);
          }
        }
      }
    }
  } catch (error) {
    logger.error("Failed to handle voice leave:", error);
  }
}
export function cleanup() {
  const voiceStates = xpService.getAllVoiceStates();
  if (voiceStates.size > 0) {
    logger.info(`Cleaning up ${voiceStates.size} voice states on shutdown`);
  }
}
