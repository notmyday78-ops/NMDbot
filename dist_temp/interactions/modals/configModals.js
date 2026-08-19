"use strict";
import { EmbedBuilder } from "discord.js";
import { configurationService } from "../../services/configurationService";
import { t } from "../../i18n";
import { logger } from "../../utils/logger";
export async function handleConfigModal(interaction) {
  const parts = interaction.customId.split("_");
  const prefix = parts[0];
  if (prefix !== "config") return;
  const modalType = parts.slice(1).join("_");
  if (modalType.startsWith("xp_channels_")) {
    return handleXPChannelsModal(
      interaction,
      modalType.replace("xp_channels_", "").replace("_modal", "")
    );
  }
  if (modalType === "xp_reward_add_modal") {
    return handleXPRewardAddModal(interaction);
  }
  if (modalType === "xp_reward_remove_modal") {
    return handleXPRewardRemoveModal(interaction);
  }
  if (modalType.startsWith("eco_shop_")) {
    const action = modalType.replace("eco_shop_", "").replace("_modal", "");
    switch (action) {
      case "add":
        return handleEcoShopAddModal(interaction);
      case "edit":
        return handleEcoShopEditModal(interaction);
      case "remove":
        return handleEcoShopRemoveModal(interaction);
    }
  }
  const simplifiedType = modalType.replace("_modal", "");
  switch (simplifiedType) {
    case "xp_rates":
      return handleXPRatesModal(interaction);
    case "xp_roles":
      return handleXPRolesModal(interaction);
    case "eco_currency":
      return handleEcoCurrencyModal(interaction);
    case "eco_rewards":
      return handleEcoRewardsModal(interaction);
    case "eco_rob":
      return handleEcoRobModal(interaction);
    case "welcome_message":
      return handleWelcomeMessageModal(interaction);
    case "welcome_embed":
      return handleWelcomeEmbedModal(interaction);
    case "welcome_dm":
      return handleWelcomeDMModal(interaction);
    case "goodbye_message":
      return handleGoodbyeMessageModal(interaction);
    case "goodbye_embed":
      return handleGoodbyeEmbedModal(interaction);
  }
}
async function handleXPRatesModal(interaction) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const perMessage = parseInt(interaction.fields.getTextInputValue("perMessage"));
    const perVoiceMinute = parseInt(interaction.fields.getTextInputValue("perVoiceMinute"));
    const cooldown = parseInt(interaction.fields.getTextInputValue("cooldown"));
    const boosterMultiplier = parseInt(interaction.fields.getTextInputValue("boosterMultiplier"));
    if (isNaN(perMessage) || perMessage < 0 || perMessage > 1e3) {
      await interaction.editReply({
        content: t("config.xp.validation.invalidPerMessage")
      });
      return;
    }
    if (isNaN(perVoiceMinute) || perVoiceMinute < 0 || perVoiceMinute > 1e3) {
      await interaction.editReply({
        content: t("config.xp.validation.invalidPerVoiceMinute")
      });
      return;
    }
    if (isNaN(cooldown) || cooldown < 0 || cooldown > 3600) {
      await interaction.editReply({
        content: t("config.xp.validation.invalidCooldown")
      });
      return;
    }
    if (isNaN(boosterMultiplier) || boosterMultiplier < 100 || boosterMultiplier > 1e3) {
      await interaction.editReply({
        content: t("config.xp.validation.invalidBoosterMultiplier")
      });
      return;
    }
    await configurationService.updateXPConfig(interaction.guildId, {
      perMessage,
      perVoiceMinute,
      cooldown,
      boosterMultiplier
    });
    const embed = new EmbedBuilder().setColor(65280).setTitle(t("config.xp.success.rates.title")).setDescription(t("config.xp.success.rates.description")).addFields(
      {
        name: t("config.xp.fields.perMessage"),
        value: `${perMessage} XP`,
        inline: true
      },
      {
        name: t("config.xp.fields.perVoiceMinute"),
        value: `${perVoiceMinute} XP`,
        inline: true
      },
      {
        name: t("config.xp.fields.cooldown"),
        value: `${cooldown} ${t("common.seconds")}`,
        inline: true
      },
      {
        name: t("config.xp.fields.boosterMultiplier"),
        value: `${boosterMultiplier}%`,
        inline: true
      }
    ).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("Error handling XP rates modal:", error);
    await interaction.editReply({
      content: t("common.error")
    });
  }
}
async function handleXPRolesModal(interaction) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const boosterRole = interaction.fields.getTextInputValue("boosterRole").trim();
    const ignoredRolesText = interaction.fields.getTextInputValue("ignoredRoles");
    const ignoredRoles = ignoredRolesText.split("\n").map((id) => id.trim()).filter((id) => id.length > 0);
    if (boosterRole && !interaction.guild.roles.cache.has(boosterRole)) {
      await interaction.editReply({
        content: t("config.xp.validation.invalidBoosterRole")
      });
      return;
    }
    const invalidRoles = ignoredRoles.filter((id) => !interaction.guild.roles.cache.has(id));
    if (invalidRoles.length > 0) {
      await interaction.editReply({
        content: t("config.xp.validation.invalidIgnoredRoles", { roles: invalidRoles.join(", ") })
      });
      return;
    }
    await configurationService.updateXPConfig(interaction.guildId, {
      boosterRole: boosterRole || void 0,
      ignoredRoles
    });
    const embed = new EmbedBuilder().setColor(65280).setTitle(t("config.xp.success.roles.title")).setDescription(t("config.xp.success.roles.description")).addFields(
      {
        name: t("config.xp.fields.boosterRole"),
        value: boosterRole ? `<@&${boosterRole}>` : t("common.none"),
        inline: true
      },
      {
        name: t("config.xp.fields.ignoredRoles"),
        value: ignoredRoles.length > 0 ? ignoredRoles.map((id) => `<@&${id}>`).join(", ") : t("common.none"),
        inline: false
      }
    ).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("Error handling XP roles modal:", error);
    await interaction.editReply({
      content: t("common.error")
    });
  }
}
async function handleEcoCurrencyModal(interaction) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const symbol = interaction.fields.getTextInputValue("symbol");
    const name = interaction.fields.getTextInputValue("name");
    const startingBalance = parseInt(interaction.fields.getTextInputValue("startingBalance"));
    if (isNaN(startingBalance) || startingBalance < 0) {
      await interaction.editReply({
        content: t("config.eco.validation.invalidStartingBalance")
      });
      return;
    }
    await configurationService.updateEconomyConfig(interaction.guildId, {
      currencySymbol: symbol,
      currencyName: name,
      startingBalance
    });
    const embed = new EmbedBuilder().setColor(65280).setTitle(t("config.eco.success.currency.title")).setDescription(t("config.eco.success.currency.description")).addFields(
      {
        name: t("config.eco.fields.symbol"),
        value: symbol,
        inline: true
      },
      {
        name: t("config.eco.fields.name"),
        value: name,
        inline: true
      },
      {
        name: t("config.eco.fields.startingBalance"),
        value: `${symbol} ${startingBalance}`,
        inline: true
      }
    ).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("Error handling economy currency modal:", error);
    await interaction.editReply({
      content: t("common.error")
    });
  }
}
async function handleEcoRewardsModal(interaction) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const dailyAmount = parseInt(interaction.fields.getTextInputValue("dailyAmount"));
    const dailyStreakBonus = parseInt(interaction.fields.getTextInputValue("dailyStreakBonus"));
    const workMin = parseInt(interaction.fields.getTextInputValue("workMin"));
    const workMax = parseInt(interaction.fields.getTextInputValue("workMax"));
    const workCooldownHours = parseFloat(interaction.fields.getTextInputValue("workCooldown"));
    if (isNaN(dailyAmount) || dailyAmount < 0) {
      await interaction.editReply({
        content: t("config.eco.validation.invalidDailyAmount")
      });
      return;
    }
    if (isNaN(dailyStreakBonus) || dailyStreakBonus < 0) {
      await interaction.editReply({
        content: t("config.eco.validation.invalidDailyStreakBonus")
      });
      return;
    }
    if (isNaN(workMin) || isNaN(workMax) || workMin < 0 || workMax < workMin) {
      await interaction.editReply({
        content: t("config.eco.validation.invalidWorkAmounts")
      });
      return;
    }
    if (isNaN(workCooldownHours) || workCooldownHours < 0 || workCooldownHours > 24) {
      await interaction.editReply({
        content: t("config.eco.validation.invalidWorkCooldown")
      });
      return;
    }
    const workCooldown = Math.floor(workCooldownHours * 3600);
    await configurationService.updateEconomyConfig(interaction.guildId, {
      dailyAmount,
      dailyStreakBonus,
      workMinAmount: workMin,
      workMaxAmount: workMax,
      workCooldown
    });
    const config = await configurationService.getEconomyConfig(interaction.guildId);
    const embed = new EmbedBuilder().setColor(65280).setTitle(t("config.eco.success.rewards.title")).setDescription(t("config.eco.success.rewards.description")).addFields(
      {
        name: t("config.eco.fields.dailyAmount"),
        value: `${config.currencySymbol} ${dailyAmount}`,
        inline: true
      },
      {
        name: t("config.eco.fields.dailyStreakBonus"),
        value: `${config.currencySymbol} ${dailyStreakBonus}`,
        inline: true
      },
      {
        name: t("config.eco.fields.workReward"),
        value: `${config.currencySymbol} ${workMin} - ${workMax}`,
        inline: true
      },
      {
        name: t("config.eco.fields.workCooldown"),
        value: `${workCooldownHours} ${t("common.hours")}`,
        inline: true
      }
    ).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("Error handling economy rewards modal:", error);
    await interaction.editReply({
      content: t("common.error")
    });
  }
}
async function handleEcoRobModal(interaction) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const enabledText = interaction.fields.getTextInputValue("enabled").toLowerCase();
    const minAmount = parseInt(interaction.fields.getTextInputValue("minAmount"));
    const successRate = parseInt(interaction.fields.getTextInputValue("successRate"));
    const protectionCost = parseInt(interaction.fields.getTextInputValue("protectionCost"));
    const enabled = enabledText === "true" || enabledText === "yes" || enabledText === "1";
    if (isNaN(minAmount) || minAmount < 0) {
      await interaction.editReply({
        content: t("config.eco.validation.invalidRobMinAmount")
      });
      return;
    }
    if (isNaN(successRate) || successRate < 0 || successRate > 100) {
      await interaction.editReply({
        content: t("config.eco.validation.invalidRobSuccessRate")
      });
      return;
    }
    if (isNaN(protectionCost) || protectionCost < 0) {
      await interaction.editReply({
        content: t("config.eco.validation.invalidRobProtectionCost")
      });
      return;
    }
    await configurationService.updateEconomyConfig(interaction.guildId, {
      robEnabled: enabled,
      robMinAmount: minAmount,
      robSuccessRate: successRate,
      robProtectionCost: protectionCost
    });
    const config = await configurationService.getEconomyConfig(interaction.guildId);
    const embed = new EmbedBuilder().setColor(65280).setTitle(t("config.eco.success.rob.title")).setDescription(t("config.eco.success.rob.description")).addFields(
      {
        name: t("config.eco.fields.robEnabled"),
        value: enabled ? t("common.yes") : t("common.no"),
        inline: true
      },
      {
        name: t("config.eco.fields.robMinAmount"),
        value: `${config.currencySymbol} ${minAmount}`,
        inline: true
      },
      {
        name: t("config.eco.fields.robSuccessRate"),
        value: `${successRate}%`,
        inline: true
      },
      {
        name: t("config.eco.fields.robProtectionCost"),
        value: `${config.currencySymbol} ${protectionCost}`,
        inline: true
      }
    ).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("Error handling economy rob modal:", error);
    await interaction.editReply({
      content: t("common.error")
    });
  }
}
async function handleWelcomeMessageModal(interaction) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const message = interaction.fields.getTextInputValue("message");
    await configurationService.updateWelcomeConfig(interaction.guildId, {
      message
    });
    const embed = new EmbedBuilder().setColor(65280).setTitle(t("config.welcome.success.message.title")).setDescription(t("config.welcome.success.message.description")).addFields({
      name: t("config.welcome.fields.message"),
      value: message.substring(0, 1024),
      inline: false
    }).setFooter({ text: t("config.welcome.placeholders") }).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("Error handling welcome message modal:", error);
    await interaction.editReply({
      content: t("common.error")
    });
  }
}
async function handleWelcomeEmbedModal(interaction) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const enabledText = interaction.fields.getTextInputValue("enabled").toLowerCase();
    const color = interaction.fields.getTextInputValue("color");
    const title = interaction.fields.getTextInputValue("title");
    const image = interaction.fields.getTextInputValue("image");
    const thumbnail = interaction.fields.getTextInputValue("thumbnail");
    const enabled = enabledText === "true" || enabledText === "yes" || enabledText === "1";
    if (!/^#[0-9A-F]{6}$/i.test(color)) {
      await interaction.editReply({
        content: t("config.validation.invalidColor")
      });
      return;
    }
    if (image && !isValidUrl(image)) {
      await interaction.editReply({
        content: t("config.validation.invalidImageUrl")
      });
      return;
    }
    if (thumbnail && !isValidUrl(thumbnail)) {
      await interaction.editReply({
        content: t("config.validation.invalidThumbnailUrl")
      });
      return;
    }
    await configurationService.updateWelcomeConfig(interaction.guildId, {
      embedEnabled: enabled,
      embedColor: color,
      embedTitle: title || void 0,
      embedImage: image || void 0,
      embedThumbnail: thumbnail || void 0
    });
    const embed = new EmbedBuilder().setColor(65280).setTitle(t("config.welcome.success.embed.title")).setDescription(t("config.welcome.success.embed.description")).addFields(
      {
        name: t("config.welcome.fields.embedEnabled"),
        value: enabled ? t("common.yes") : t("common.no"),
        inline: true
      },
      {
        name: t("config.welcome.fields.embedColor"),
        value: color,
        inline: true
      },
      {
        name: t("config.welcome.fields.embedTitle"),
        value: title || t("common.none"),
        inline: false
      }
    ).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("Error handling welcome embed modal:", error);
    await interaction.editReply({
      content: t("common.error")
    });
  }
}
async function handleWelcomeDMModal(interaction) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const enabledText = interaction.fields.getTextInputValue("enabled").toLowerCase();
    const message = interaction.fields.getTextInputValue("message");
    const enabled = enabledText === "true" || enabledText === "yes" || enabledText === "1";
    await configurationService.updateWelcomeConfig(interaction.guildId, {
      dmEnabled: enabled,
      dmMessage: message || void 0
    });
    const embed = new EmbedBuilder().setColor(65280).setTitle(t("config.welcome.success.dm.title")).setDescription(t("config.welcome.success.dm.description")).addFields({
      name: t("config.welcome.fields.dmEnabled"),
      value: enabled ? t("common.yes") : t("common.no"),
      inline: true
    });
    if (message) {
      embed.addFields({
        name: t("config.welcome.fields.dmMessage"),
        value: message.substring(0, 1024),
        inline: false
      });
      return;
    }
    embed.setFooter({ text: t("config.welcome.placeholders") });
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("Error handling welcome DM modal:", error);
    await interaction.editReply({
      content: t("common.error")
    });
  }
}
async function handleGoodbyeMessageModal(interaction) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const message = interaction.fields.getTextInputValue("message");
    await configurationService.updateGoodbyeConfig(interaction.guildId, {
      message
    });
    const embed = new EmbedBuilder().setColor(65280).setTitle(t("config.goodbye.success.message.title")).setDescription(t("config.goodbye.success.message.description")).addFields({
      name: t("config.goodbye.fields.message"),
      value: message.substring(0, 1024),
      inline: false
    }).setFooter({ text: t("config.goodbye.placeholders") }).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("Error handling goodbye message modal:", error);
    await interaction.editReply({
      content: t("common.error")
    });
  }
}
async function handleGoodbyeEmbedModal(interaction) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const enabledText = interaction.fields.getTextInputValue("enabled").toLowerCase();
    const color = interaction.fields.getTextInputValue("color");
    const title = interaction.fields.getTextInputValue("title");
    const image = interaction.fields.getTextInputValue("image");
    const thumbnail = interaction.fields.getTextInputValue("thumbnail");
    const enabled = enabledText === "true" || enabledText === "yes" || enabledText === "1";
    if (!/^#[0-9A-F]{6}$/i.test(color)) {
      await interaction.editReply({
        content: t("config.validation.invalidColor")
      });
      return;
    }
    if (image && !isValidUrl(image)) {
      await interaction.editReply({
        content: t("config.validation.invalidImageUrl")
      });
      return;
    }
    if (thumbnail && !isValidUrl(thumbnail)) {
      await interaction.editReply({
        content: t("config.validation.invalidThumbnailUrl")
      });
      return;
    }
    await configurationService.updateGoodbyeConfig(interaction.guildId, {
      embedEnabled: enabled,
      embedColor: color,
      embedTitle: title || void 0,
      embedImage: image || void 0,
      embedThumbnail: thumbnail || void 0
    });
    const embed = new EmbedBuilder().setColor(65280).setTitle(t("config.goodbye.success.embed.title")).setDescription(t("config.goodbye.success.embed.description")).addFields(
      {
        name: t("config.goodbye.fields.embedEnabled"),
        value: enabled ? t("common.yes") : t("common.no"),
        inline: true
      },
      {
        name: t("config.goodbye.fields.embedColor"),
        value: color,
        inline: true
      },
      {
        name: t("config.goodbye.fields.embedTitle"),
        value: title || t("common.none"),
        inline: false
      }
    ).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("Error handling goodbye embed modal:", error);
    await interaction.editReply({
      content: t("common.error")
    });
  }
}
function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}
async function handleXPChannelsModal(interaction, type) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const channelsText = interaction.fields.getTextInputValue("channels");
    const channels = channelsText.split("\n").map((id) => id.trim()).filter((id) => id.length > 0);
    const invalidChannels = channels.filter((id) => !interaction.guild.channels.cache.has(id));
    if (invalidChannels.length > 0) {
      await interaction.editReply({
        content: t("common.error")
      });
      return;
    }
    const updateData = {};
    switch (type) {
      case "ignored":
        updateData.ignoredChannels = channels;
        break;
      case "no_xp":
        updateData.noXpChannels = channels;
        break;
      case "double_xp":
        updateData.doubleXpChannels = channels;
        break;
    }
    await configurationService.updateXPConfig(interaction.guildId, updateData);
    const embed = new EmbedBuilder().setColor(65280).setTitle(t("commands.config.subcommands.xp.title")).setDescription(`${type.replace("_", " ")} channels have been updated`).addFields({
      name: t("commands.config.subcommands.xp.buttons.channels"),
      value: channels.length > 0 ? channels.map((id) => `<#${id}>`).join("\n") : t("common.none"),
      inline: false
    }).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("Error handling XP channels modal:", error);
    await interaction.editReply({
      content: t("common.error")
    });
  }
}
async function handleXPRewardAddModal(interaction) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const level = parseInt(interaction.fields.getTextInputValue("level"));
    const roleId = interaction.fields.getTextInputValue("role").trim();
    if (isNaN(level) || level < 1 || level > 100) {
      await interaction.editReply({
        content: t("common.error")
      });
      return;
    }
    if (!interaction.guild.roles.cache.has(roleId)) {
      await interaction.editReply({
        content: t("common.error")
      });
      return;
    }
    await configurationService.setXPRoleReward(interaction.guildId, level, roleId);
    const embed = new EmbedBuilder().setColor(65280).setTitle(t("commands.config.subcommands.xp.title")).setDescription(`Role reward has been added`).addFields(
      {
        name: t("commands.warn.subcommands.issue.success.level"),
        value: level.toString(),
        inline: true
      },
      {
        name: t("commands.config.subcommands.xp.buttons.roles"),
        value: `<@&${roleId}>`,
        inline: true
      }
    ).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("Error handling XP reward add modal:", error);
    await interaction.editReply({
      content: t("common.error")
    });
  }
}
async function handleXPRewardRemoveModal(interaction) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const level = parseInt(interaction.fields.getTextInputValue("level"));
    if (isNaN(level)) {
      await interaction.editReply({
        content: t("common.error")
      });
      return;
    }
    await configurationService.removeXPRoleReward(interaction.guildId, level);
    const embed = new EmbedBuilder().setColor(65280).setTitle(t("commands.config.subcommands.xp.title")).setDescription(`Role reward for level ${level} has been removed`).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("Error handling XP reward remove modal:", error);
    await interaction.editReply({
      content: t("common.error")
    });
  }
}
async function handleEcoShopAddModal(interaction) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const name = interaction.fields.getTextInputValue("name");
    const description = interaction.fields.getTextInputValue("description");
    const price = parseInt(interaction.fields.getTextInputValue("price"));
    const type = interaction.fields.getTextInputValue("type");
    const stock = parseInt(interaction.fields.getTextInputValue("stock"));
    if (isNaN(price) || price < 0) {
      await interaction.editReply({
        content: t("common.error")
      });
      return;
    }
    if (isNaN(stock)) {
      await interaction.editReply({
        content: t("common.error")
      });
      return;
    }
    const validTypes = ["protection", "booster", "role", "custom"];
    if (!validTypes.includes(type)) {
      await interaction.editReply({
        content: t("common.error")
      });
      return;
    }
    let effectType = void 0;
    let effectValue = void 0;
    switch (type) {
      case "protection":
        effectType = "rob_protection";
        effectValue = { duration: 86400 };
        break;
      case "booster":
        effectType = "xp_boost";
        effectValue = { duration: 3600, multiplier: 2 };
        break;
    }
    const itemId = await configurationService.addShopItem(interaction.guildId, {
      name,
      description,
      price,
      type,
      effectType,
      effectValue,
      stock,
      enabled: true
    });
    const embed = new EmbedBuilder().setColor(65280).setTitle(t("config.eco.shop.title")).setDescription(`Item "${name}" has been added to the shop`).addFields(
      {
        name: "ID",
        value: itemId,
        inline: true
      },
      {
        name: t("commands.economy.shop.view.price", { defaultValue: "Price" }),
        value: price.toString(),
        inline: true
      },
      {
        name: t("commands.economy.shop.view.stock"),
        value: stock === -1 ? t("commands.economy.shop.view.unlimited") : stock.toString(),
        inline: true
      }
    ).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("Error handling shop add modal:", error);
    await interaction.editReply({
      content: t("common.error")
    });
  }
}
async function handleEcoShopEditModal(interaction) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const itemId = interaction.fields.getTextInputValue("itemId").trim();
    const items = await configurationService.getShopItems(interaction.guildId);
    const item = items.find((i) => i.id === itemId);
    if (!item) {
      await interaction.editReply({
        content: t("commands.economy.shop.buy.notFound")
      });
      return;
    }
    const embed = new EmbedBuilder().setColor(39423).setTitle(t("config.eco.shop.title")).setDescription(
      "To edit items, please use the shop manager to remove and re-add with new settings"
    ).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("Error handling shop edit modal:", error);
    await interaction.editReply({
      content: t("common.error")
    });
  }
}
async function handleEcoShopRemoveModal(interaction) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const itemId = interaction.fields.getTextInputValue("itemId").trim();
    const items = await configurationService.getShopItems(interaction.guildId);
    const item = items.find((i) => i.id === itemId);
    if (!item) {
      await interaction.editReply({
        content: t("commands.economy.shop.buy.notFound")
      });
      return;
    }
    await configurationService.deleteShopItem(itemId);
    const embed = new EmbedBuilder().setColor(65280).setTitle(t("config.eco.shop.title")).setDescription(`Item "${item.name}" has been removed from the shop`).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("Error handling shop remove modal:", error);
    await interaction.editReply({
      content: t("common.error")
    });
  }
}
