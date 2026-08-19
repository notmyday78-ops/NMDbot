"use strict";
import { EmbedBuilder } from "discord.js";
export class EmbedFactory {
  // Brand colors for Pegasus V3
  static Colors = {
    Primary: "#5865F2",
    Success: "#2ECC71",
    Error: "#ED4245",
    Warning: "#FEE75C",
    Info: "#3498DB"
  };
  /**
   * Creates a standardized base embed
   */
  static create(options) {
    const embed = new EmbedBuilder();
    if (options.title) embed.setTitle(options.title);
    if (options.description) embed.setDescription(options.description);
    if (options.color) embed.setColor(options.color);
    else embed.setColor(this.Colors.Primary);
    if (options.thumbnail) embed.setThumbnail(options.thumbnail);
    if (options.image) embed.setImage(options.image);
    if (options.author) {
      embed.setAuthor({
        name: options.author.name,
        iconURL: options.author.iconURL,
        url: options.author.url
      });
    }
    if (options.footer) {
      embed.setFooter({
        text: options.footer.text,
        iconURL: options.footer.iconURL
      });
    }
    if (options.fields && options.fields.length > 0) {
      embed.addFields(options.fields);
    }
    if (options.timestamp) {
      embed.setTimestamp(options.timestamp instanceof Date ? options.timestamp : /* @__PURE__ */ new Date());
    }
    return embed;
  }
  /**
   * Creates a standardized success embed
   */
  static success(description, title) {
    return this.create({
      title,
      description,
      color: this.Colors.Success,
      timestamp: true
    });
  }
  /**
   * Creates a standardized error embed
   */
  static error(description, title = "Error") {
    return this.create({
      title,
      description,
      color: this.Colors.Error,
      timestamp: true
    });
  }
  /**
   * Creates a standardized warning embed
   */
  static warning(description, title = "Warning") {
    return this.create({
      title,
      description,
      color: this.Colors.Warning,
      timestamp: true
    });
  }
  /**
   * Creates a standardized info embed
   */
  static info(description, title) {
    return this.create({
      title,
      description,
      color: this.Colors.Info,
      timestamp: true
    });
  }
}
