"use strict";
import { Collection, EmbedBuilder } from "discord.js";
import { t, withLocale } from "../i18n";
import { CommandCategory } from "../types/command";
import { logger } from "../utils/logger";
const OPT_SUB_COMMAND = 1;
const OPT_SUB_COMMAND_GROUP = 2;
export class HelpService {
  /**
   * The client's command collection.
   * Populated lazily on first use via setClient() or directly.
   */
  clientCommands = null;
  commandsByCategory = /* @__PURE__ */ new Map();
  // ─── Wiring ─────────────────────────────────────────────────────────────────
  lastClient = null;
  /**
   * Point the service at the Discord client so it can read already-loaded
   * commands (which were imported after i18n was initialized).
   * Rebuilds the category index only when the client reference changes.
   */
  setClient(client) {
    if (client === this.lastClient) return;
    if (!("commands" in client)) {
      logger.warn("HelpService: client.commands not available");
      return;
    }
    this.lastClient = client;
    this.clientCommands = client.commands;
    this.rebuildCategoryIndex();
  }
  /**
   * Directly supply a pre-built collection (useful in tests or when the
   * client isn't available yet).
   */
  setCommands(commands) {
    this.clientCommands = commands;
    this.rebuildCategoryIndex();
  }
  get commands() {
    return this.clientCommands ?? new Collection();
  }
  rebuildCategoryIndex() {
    this.commandsByCategory.clear();
    for (const cmd of this.commands.values()) {
      if (!this.commandsByCategory.has(cmd.category)) {
        this.commandsByCategory.set(cmd.category, []);
      }
      this.commandsByCategory.get(cmd.category).push(cmd);
    }
  }
  // ─── Core helper: serialize builder → plain JSON options ─────────────────
  /**
   * Calls `.toJSON()` on the Discord.js builder so we get plain objects
   * with numeric `type` fields, regardless of builder class.
   */
  getJsonOptions(command) {
    try {
      const json = command.data.toJSON();
      return json.options ?? [];
    } catch (err) {
      logger.warn(`HelpService: toJSON() failed for /${command.data.name}: ${err}`);
      return [];
    }
  }
  // ─── Overview embed ───────────────────────────────────────────────────────
  /**
   * Category overview — every subcommand leaf gets its own line so users can
   * see all available commands at a glance.
   */
  async getHelpMenu(locale) {
    return withLocale(locale, () => {
      const embed = new EmbedBuilder().setTitle(t("commands.help.title")).setDescription(t("commands.help.description")).setColor(5793266).setTimestamp();
      const categoryOrder = [
        CommandCategory.Utility,
        CommandCategory.Moderation,
        CommandCategory.Economy,
        CommandCategory.XP,
        CommandCategory.Giveaways,
        CommandCategory.Tickets,
        CommandCategory.Fun,
        CommandCategory.Admin
      ];
      for (const category of categoryOrder) {
        const cmds = this.commandsByCategory.get(category);
        if (!cmds || cmds.length === 0) continue;
        const lines = [];
        for (const cmd of cmds) {
          const options = this.getJsonOptions(cmd);
          const leaves = this.flattenToLeaves(options);
          if (leaves.length > 0) {
            for (const leaf of leaves) {
              lines.push(`\`/${cmd.data.name} ${leaf.fullName}\` \u2014 ${leaf.description}`);
            }
          } else {
            lines.push(
              `\`/${cmd.data.name}\` \u2014 ${cmd.data.description || t("commands.help.noDescription")}`
            );
          }
        }
        const raw = lines.join("\n") || t("common.none");
        embed.addFields({
          name: t(`commands.help.categories.${category}`),
          value: raw.length > 1024 ? raw.slice(0, 1021) + "\u2026" : raw,
          inline: false
        });
      }
      embed.setFooter({ text: t("commands.help.menuFooter") });
      return Promise.resolve(embed);
    });
  }
  // ─── Per-command detail embed ─────────────────────────────────────────────
  /**
   * Detailed view for a single command.
   * Plain commands show their options; subcommand commands get one field per
   * subcommand (or per group child), each with its own options listed.
   */
  async getCommandHelp(commandName, locale) {
    const command = this.commands.get(commandName);
    if (!command) return null;
    return withLocale(locale, () => {
      const embed = new EmbedBuilder().setTitle(t("commands.help.commandInfo")).setColor(5793266).setTimestamp();
      const options = this.getJsonOptions(command);
      const hasSubcmds = options.some(
        (o) => o.type === OPT_SUB_COMMAND || o.type === OPT_SUB_COMMAND_GROUP
      );
      embed.addFields(
        {
          name: t("commands.help.commandName"),
          value: `\`/${command.data.name}\``,
          inline: true
        },
        {
          name: t("commands.help.category"),
          value: t(`commands.help.categories.${command.category}`),
          inline: true
        },
        {
          name: t("commands.help.cooldown"),
          value: command.cooldown ? t("commands.help.cooldownValue", { seconds: command.cooldown }) : t("commands.help.noCooldown"),
          inline: true
        }
      );
      embed.addFields({
        name: t("commands.help.description", { defaultValue: "Description" }),
        value: command.data.description || t("commands.help.noDescription"),
        inline: false
      });
      if (command.permissions && command.permissions.length > 0) {
        embed.addFields({
          name: t("commands.help.permissions"),
          value: command.permissions.map((p) => `\`${String(p)}\``).join(", "),
          inline: false
        });
      }
      if (options.length === 0) {
        embed.addFields({
          name: t("commands.help.usage"),
          value: `\`/${command.data.name}\``,
          inline: false
        });
      } else if (!hasSubcmds) {
        embed.addFields({
          name: t("commands.help.usage"),
          value: this.buildUsageLine(command.data.name, options),
          inline: false
        });
        const optLines = this.renderOptions(options);
        if (optLines.length > 0) {
          embed.addFields({
            name: t("commands.help.options"),
            value: optLines.join("\n"),
            inline: false
          });
        }
      } else {
        for (const option of options) {
          if (option.type === OPT_SUB_COMMAND) {
            this.addSubcommandField(embed, command.data.name, option);
          } else if (option.type === OPT_SUB_COMMAND_GROUP) {
            this.addGroupFields(embed, command.data.name, option);
          }
        }
      }
      embed.setFooter({ text: t("commands.help.commandFooter") });
      return Promise.resolve(embed);
    });
  }
  // ─── Embed field builders ─────────────────────────────────────────────────
  addSubcommandField(embed, cmdName, sub) {
    const lines = [
      sub.description || t("commands.help.noDescription"),
      `**${t("commands.help.usage")}:** ${this.buildUsageLine(`${cmdName} ${sub.name}`, sub.options ?? [])}`
    ];
    const optLines = this.renderOptions(sub.options ?? []);
    if (optLines.length > 0) {
      lines.push("", ...optLines);
    }
    const value = lines.join("\n");
    embed.addFields({
      name: `\`/${cmdName} ${sub.name}\``,
      value: value.length > 1024 ? value.slice(0, 1021) + "\u2026" : value,
      inline: false
    });
  }
  addGroupFields(embed, cmdName, group) {
    for (const child of group.options ?? []) {
      if (child.type !== OPT_SUB_COMMAND) continue;
      const lines = [
        child.description || t("commands.help.noDescription"),
        `**${t("commands.help.usage")}:** ${this.buildUsageLine(`${cmdName} ${group.name} ${child.name}`, child.options ?? [])}`
      ];
      const optLines = this.renderOptions(child.options ?? []);
      if (optLines.length > 0) {
        lines.push("", ...optLines);
      }
      const value = lines.join("\n");
      embed.addFields({
        name: `\`/${cmdName} ${group.name} ${child.name}\``,
        value: value.length > 1024 ? value.slice(0, 1021) + "\u2026" : value,
        inline: false
      });
    }
  }
  // ─── Formatting helpers ───────────────────────────────────────────────────
  renderOptions(options) {
    return options.filter((o) => o.type !== OPT_SUB_COMMAND && o.type !== OPT_SUB_COMMAND_GROUP).map((o) => {
      const req = o.required ? "`<required>`" : "`[optional]`";
      return `\u2022 **${o.name}** ${req} \u2014 ${o.description || t("commands.help.noDescription")}`;
    });
  }
  buildUsageLine(fullName, options) {
    const args = options.filter((o) => o.type !== OPT_SUB_COMMAND && o.type !== OPT_SUB_COMMAND_GROUP).map((o) => o.required ? `<${o.name}>` : `[${o.name}]`);
    return args.length > 0 ? `\`/${fullName} ${args.join(" ")}\`` : `\`/${fullName}\``;
  }
  flattenToLeaves(options) {
    const result = [];
    for (const opt of options) {
      if (opt.type === OPT_SUB_COMMAND) {
        result.push({
          fullName: opt.name,
          description: opt.description || t("commands.help.noDescription")
        });
      } else if (opt.type === OPT_SUB_COMMAND_GROUP) {
        for (const child of opt.options ?? []) {
          if (child.type === OPT_SUB_COMMAND) {
            result.push({
              fullName: `${opt.name} ${child.name}`,
              description: child.description || t("commands.help.noDescription")
            });
          }
        }
      }
    }
    return result;
  }
  // ─── Public utilities ─────────────────────────────────────────────────────
  async getCommandList() {
    return Array.from(this.commands.keys()).sort();
  }
  getCategoryCommands(category) {
    return this.commandsByCategory.get(category) ?? [];
  }
  getAllCategories() {
    return Array.from(this.commandsByCategory.keys());
  }
  getCommandByName(name) {
    return this.commands.get(name);
  }
}
