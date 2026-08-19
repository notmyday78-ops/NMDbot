"use strict";
import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { CommandCategory } from "../../types/command";
import { t, setUserLocale, getUserLocale, availableLocales } from "../../i18n";
import { getDatabase } from "../../database/connection";
import { users } from "../../database/schema";
import { eq } from "drizzle-orm";
import { ensureUserExists } from "../../utils/userUtils";
import { logger } from "../../utils/logger";
import {
  createLocalizationMap,
  commandNames,
  commandDescriptions,
  subcommandDescriptions,
  optionDescriptions
} from "../../utils/localization";
export const data = new SlashCommandBuilder().setName("language").setDescription(t("commands.language.description", { defaultValue: "Language preferences" })).setNameLocalizations(createLocalizationMap(commandNames.language)).setDescriptionLocalizations(createLocalizationMap(commandDescriptions.language)).addSubcommand(
  (subcommand) => subcommand.setName("available").setDescription(
    t("commands.language.subcommands.available.description", {
      defaultValue: "List available languages"
    })
  ).setDescriptionLocalizations(createLocalizationMap(subcommandDescriptions.language.available))
).addSubcommand(
  (subcommand) => subcommand.setName("current").setDescription(
    t("commands.language.subcommands.current.description", {
      defaultValue: "Show current language"
    })
  ).setDescriptionLocalizations(createLocalizationMap(subcommandDescriptions.language.current))
).addSubcommand(
  (subcommand) => subcommand.setName("set").setDescription(
    t("commands.language.subcommands.set.description", {
      defaultValue: "Set preferred language"
    })
  ).setDescriptionLocalizations(createLocalizationMap(subcommandDescriptions.language.set)).addStringOption(
    (option) => option.setName("language").setDescription(
      t("commands.language.subcommands.set.options.language", {
        defaultValue: "The language to select"
      })
    ).setDescriptionLocalizations(createLocalizationMap(optionDescriptions.language)).setRequired(true).addChoices(
      {
        name: "English",
        value: "en",
        name_localizations: { de: "Englisch", "es-ES": "Ingl\xE9s", fr: "Anglais" }
      },
      {
        name: "Deutsch",
        value: "de",
        name_localizations: { de: "Deutsch", "es-ES": "Alem\xE1n", fr: "Allemand" }
      },
      {
        name: "Espa\xF1ol",
        value: "es",
        name_localizations: { de: "Spanisch", "es-ES": "Espa\xF1ol", fr: "Espagnol" }
      },
      {
        name: "Fran\xE7ais",
        value: "fr",
        name_localizations: { de: "Franz\xF6sisch", "es-ES": "Franc\xE9s", fr: "Fran\xE7ais" }
      }
    )
  )
);
export const category = CommandCategory.Utility;
export const cooldown = 3;
export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const locale = getUserLocale(interaction.user.id);
  switch (subcommand) {
    case "available":
      return handleAvailable(interaction, locale);
    case "current":
      return handleCurrent(interaction, locale);
    case "set":
      return handleSet(interaction, locale);
  }
}
async function handleAvailable(interaction, locale) {
  const embed = new EmbedBuilder().setColor(39423).setTitle(
    t("commands.language.subcommands.available.title", {
      lng: locale,
      defaultValue: "Available Languages"
    })
  ).setDescription(
    t("commands.language.subcommands.available.description", {
      lng: locale,
      defaultValue: "Here are the available languages:"
    })
  ).addFields(
    {
      name: t("commands.language.subcommands.available.fields.en.name", {
        lng: locale,
        defaultValue: "\u{1F1EC}\u{1F1E7} English"
      }),
      value: t("commands.language.subcommands.available.fields.en.value", {
        lng: locale,
        defaultValue: "Default language"
      }),
      inline: true
    },
    {
      name: t("commands.language.subcommands.available.fields.de.name", {
        lng: locale,
        defaultValue: "\u{1F1E9}\u{1F1EA} Deutsch"
      }),
      value: t("commands.language.subcommands.available.fields.de.value", {
        lng: locale,
        defaultValue: "German language"
      }),
      inline: true
    },
    {
      name: t("commands.language.subcommands.available.fields.es.name", {
        lng: locale,
        defaultValue: "\u{1F1EA}\u{1F1F8} Espa\xF1ol"
      }),
      value: t("commands.language.subcommands.available.fields.es.value", {
        lng: locale,
        defaultValue: "Spanish language"
      }),
      inline: true
    },
    {
      name: t("commands.language.subcommands.available.fields.fr.name", {
        lng: locale,
        defaultValue: "\u{1F1EB}\u{1F1F7} Fran\xE7ais"
      }),
      value: t("commands.language.subcommands.available.fields.fr.value", {
        lng: locale,
        defaultValue: "French language"
      }),
      inline: true
    }
  ).setFooter({
    text: t("commands.language.subcommands.available.footer", {
      lng: locale,
      defaultValue: "Use /language set <language> to change your language"
    })
  }).setTimestamp();
  await interaction.reply({ embeds: [embed] });
}
async function handleCurrent(interaction, currentLocale) {
  const languageNames = {
    en: t("commands.language.names.en", { lng: currentLocale, defaultValue: "English" }),
    de: t("commands.language.names.de", { lng: currentLocale, defaultValue: "Deutsch" }),
    es: t("commands.language.names.es", { lng: currentLocale, defaultValue: "Espa\xF1ol" }),
    fr: t("commands.language.names.fr", { lng: currentLocale, defaultValue: "Fran\xE7ais" })
  };
  const embed = new EmbedBuilder().setColor(39423).setTitle(
    t("commands.language.subcommands.current.title", {
      lng: currentLocale,
      defaultValue: "Current Language"
    })
  ).setDescription(
    t("commands.language.subcommands.current.description", {
      lng: currentLocale,
      defaultValue: "Your current language is **{{language}}** (`{{code}}`)",
      language: languageNames[currentLocale] || currentLocale,
      code: currentLocale
    })
  ).setFooter({
    text: t("commands.language.subcommands.current.footer", {
      lng: currentLocale,
      defaultValue: "Use /language set <language> to change your language"
    })
  }).setTimestamp();
  await interaction.reply({ embeds: [embed] });
}
async function handleSet(interaction, initialLocale) {
  await interaction.deferReply();
  const newLocale = interaction.options.getString("language", true);
  if (!availableLocales.includes(newLocale)) {
    return interaction.editReply({
      content: t("commands.language.subcommands.set.invalidLanguage", {
        lng: initialLocale,
        defaultValue: "Invalid language selected."
      })
    });
  }
  try {
    setUserLocale(interaction.user.id, newLocale);
    await ensureUserExists(interaction.user);
    const db = getDatabase();
    await db.update(users).set({
      preferredLocale: newLocale,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq(users.id, interaction.user.id));
    const languageNames = {
      en: t("commands.language.names.en", { lng: newLocale, defaultValue: "English" }),
      de: t("commands.language.names.de", { lng: newLocale, defaultValue: "Deutsch" }),
      es: t("commands.language.names.es", { lng: newLocale, defaultValue: "Espa\xF1ol" }),
      fr: t("commands.language.names.fr", { lng: newLocale, defaultValue: "Fran\xE7ais" })
    };
    const embed = new EmbedBuilder().setColor(65280).setTitle(
      t("commands.language.subcommands.set.success.title", {
        lng: newLocale,
        defaultValue: "Language Updated"
      })
    ).setDescription(
      t("commands.language.subcommands.set.success.description", {
        lng: newLocale,
        defaultValue: "Your language has been set to **{{language}}**.",
        language: languageNames[newLocale]
      })
    ).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("Error setting user language:", error);
    await interaction.editReply({
      content: t("common.error", { lng: initialLocale })
    });
  }
  return;
}
