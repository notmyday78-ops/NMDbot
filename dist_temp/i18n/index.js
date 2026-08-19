"use strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync } from "node:fs";
import i18next from "i18next";
import Backend from "i18next-fs-backend";
import { join } from "path";
import { eq } from "drizzle-orm";
import { getDatabase } from "../database/connection";
import { guilds, users } from "../database/schema";
import { logger } from "../utils/logger";
const localeContext = new AsyncLocalStorage();
function resolveLocalesLoadPath() {
  const candidates = [
    join(__dirname, "locales"),
    join(process.cwd(), "src", "i18n", "locales"),
    join(process.cwd(), "dist", "i18n", "locales")
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return join(candidate, "{{lng}}.json");
    }
  }
  const fallbackPath = join(__dirname, "locales", "{{lng}}.json");
  logger.warn(`Falling back to default locales path: ${fallbackPath}`);
  return fallbackPath;
}
export async function initializeI18n() {
  try {
    await i18next.use(Backend).init({
      backend: {
        loadPath: resolveLocalesLoadPath()
      },
      fallbackLng: "en",
      lng: "en",
      supportedLngs: ["en", "es", "fr", "de", "nl", "pt", "ru", "ja", "ko", "zh"],
      preload: ["en"],
      interpolation: {
        escapeValue: false
      },
      returnObjects: true,
      debug: false
    });
    logger.info("i18n initialized successfully");
  } catch (error) {
    logger.error("Failed to initialize i18n:", error);
    throw error;
  }
}
export function t(key, options) {
  const contextLocale = localeContext.getStore();
  const mergedOptions = options ? { ...options } : {};
  if (contextLocale && mergedOptions.lng === void 0) {
    mergedOptions.lng = contextLocale;
  }
  const translation = i18next.t(key, mergedOptions);
  if (translation === key && mergedOptions.lng !== "en") {
    return i18next.t(key, { ...mergedOptions, lng: "en" });
  }
  return translation;
}
export function setLanguage(language) {
  void i18next.changeLanguage(language);
}
const guildLocales = /* @__PURE__ */ new Map();
export function setGuildLocale(guildId, locale) {
  guildLocales.set(guildId, normalizeLocale(locale));
}
export function getGuildLocale(guildId) {
  return guildLocales.get(guildId) || "en";
}
export function clearGuildLocale(guildId) {
  guildLocales.delete(guildId);
}
const userLocales = /* @__PURE__ */ new Map();
export function setUserLocale(userId, locale) {
  userLocales.set(userId, normalizeLocale(locale));
}
export function getUserLocale(userId) {
  return userLocales.get(userId) || "en";
}
export function clearUserLocale(userId) {
  userLocales.delete(userId);
}
export const availableLocales = ["en", "de", "es", "fr"];
export { i18next };
async function fetchUserLocale(userId) {
  if (!userId) return void 0;
  const cached = userLocales.get(userId);
  if (cached) return cached;
  try {
    const db = getDatabase();
    const [result] = await db.select({ preferredLocale: users.preferredLocale }).from(users).where(eq(users.id, userId)).limit(1);
    if (result?.preferredLocale) {
      const preferred = normalizeLocale(result.preferredLocale);
      userLocales.set(userId, preferred);
      return preferred;
    }
  } catch (error) {
    logger.debug(`Failed to fetch user locale for ${userId}:`, error);
  }
  return void 0;
}
async function fetchGuildLocale(guildId) {
  if (!guildId) return void 0;
  const cached = guildLocales.get(guildId);
  if (cached) return cached;
  try {
    const db = getDatabase();
    const [result] = await db.select({ language: guilds.language }).from(guilds).where(eq(guilds.id, guildId)).limit(1);
    if (result?.language) {
      const language = normalizeLocale(result.language);
      guildLocales.set(guildId, language);
      return language;
    }
  } catch (error) {
    logger.debug(`Failed to fetch guild locale for ${guildId}:`, error);
  }
  return void 0;
}
export async function resolveLocale(userId, guildId) {
  const [userLocale, guildLocale] = await Promise.all([
    userId ? fetchUserLocale(userId) : Promise.resolve(void 0),
    guildId ? fetchGuildLocale(guildId) : Promise.resolve(void 0)
  ]);
  const locale = normalizeLocale(userLocale || guildLocale);
  await ensureLocaleResources(locale);
  return locale;
}
export async function withLocale(locale, callback) {
  return localeContext.run(locale, callback);
}
function isObject(item) {
  return item && typeof item === "object" && !Array.isArray(item);
}
function deepMerge(target, ...sources) {
  if (!sources.length) return target;
  const source = sources.shift();
  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (isObject(source[key])) {
        if (!target[key]) Object.assign(target, { [key]: {} });
        deepMerge(target[key], source[key]);
      } else {
        Object.assign(target, { [key]: source[key] });
      }
    }
  }
  return deepMerge(target, ...sources);
}
export async function getTranslation(guildId, userId) {
  const locale = await resolveLocale(userId, guildId);
  const bundle = i18next.getResourceBundle(locale, "translation");
  const enBundle = i18next.getResourceBundle("en", "translation") || {};
  if (bundle && locale !== "en") {
    return deepMerge({}, enBundle, bundle);
  }
  return enBundle;
}
async function ensureLocaleResources(locale) {
  if (i18next.hasResourceBundle(locale, "translation")) {
    return;
  }
  try {
    await i18next.loadLanguages(locale);
  } catch (error) {
    logger.debug(`Failed to load resources for locale ${locale}:`, error);
  }
}
function normalizeLocale(locale) {
  if (!locale) {
    return "en";
  }
  const lower = locale.toLowerCase();
  if (availableLocales.includes(lower)) {
    return lower;
  }
  const base = lower.split("-")[0];
  if (availableLocales.includes(base)) {
    return base;
  }
  return "en";
}
