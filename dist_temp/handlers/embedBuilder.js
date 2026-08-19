"use strict";
import { EmbedBuilder } from "discord.js";
export function createEmbed(title, description, color) {
  const embed = new EmbedBuilder();
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  if (color) embed.setColor(color);
  return embed;
}
export function createSuccessEmbed(title, description) {
  return createEmbed(title, description, 65280);
}
export function createErrorEmbed(title, description) {
  return createEmbed(title, description, 16711680);
}
export function createInfoEmbed(title, description) {
  return createEmbed(title, description, 39423);
}
export function createWarningEmbed(title, description) {
  return createEmbed(title, description, 16776960);
}
export const embedBuilder = {
  createEmbed,
  createSuccessEmbed,
  createErrorEmbed,
  createInfoEmbed,
  createWarningEmbed
};
