"use strict";
import axios from "axios";
import { logger } from "../utils/logger";
import { t } from "../i18n";
export class SteamService {
  apiKey;
  apiUrl = "https://api.steampowered.com";
  constructor() {
    this.apiKey = process.env.STEAM_API_KEY || "";
    if (!this.apiKey) {
      logger.warn("Steam API key not configured");
    }
  }
  async getProfile(usernameOrUrl) {
    if (!this.apiKey) {
      throw new Error("Steam API key not configured");
    }
    try {
      const steamId = await this.resolveSteamId(usernameOrUrl);
      if (!steamId) {
        return null;
      }
      const response = await axios.get(`${this.apiUrl}/ISteamUser/GetPlayerSummaries/v2/`, {
        params: {
          key: this.apiKey,
          steamids: steamId
        }
      });
      const responseData = response.data;
      const players = responseData.response.players;
      if (players.length === 0) {
        return null;
      }
      return players[0];
    } catch (error) {
      logger.error("Error fetching Steam profile:", error);
      throw error;
    }
  }
  async resolveSteamId(input) {
    if (/^\d{17}$/.test(input)) {
      return input;
    }
    const profileUrlMatch = input.match(/steamcommunity\.com\/profiles\/(\d{17})/);
    if (profileUrlMatch) {
      return profileUrlMatch[1];
    }
    const customUrlMatch = input.match(/steamcommunity\.com\/id\/([^/]+)/);
    const vanityUrlName = customUrlMatch ? customUrlMatch[1] : input;
    try {
      const response = await axios.get(`${this.apiUrl}/ISteamUser/ResolveVanityURL/v1/`, {
        params: {
          key: this.apiKey,
          vanityurl: vanityUrlName
        }
      });
      const responseData = response.data;
      if (responseData.response.success === 1) {
        return responseData.response.steamid ?? null;
      }
      return null;
    } catch (error) {
      logger.error("Error resolving Steam vanity URL:", error);
      return null;
    }
  }
  getStatusText(status, locale) {
    const statusMap = {
      0: t("commands.utils.steam.statusOffline", { lng: locale }),
      1: t("commands.utils.steam.statusOnline", { lng: locale }),
      2: t("commands.utils.steam.statusBusy", { lng: locale }),
      3: t("commands.utils.steam.statusAway", { lng: locale }),
      4: t("commands.utils.steam.statusSnooze", { lng: locale }),
      5: t("commands.utils.steam.statusLookingToTrade", { lng: locale }),
      6: t("commands.utils.steam.statusLookingToPlay", { lng: locale })
    };
    return statusMap[status] || t("commands.utils.steam.unknown", { lng: locale });
  }
  getVisibilityText(visibility, locale) {
    const visibilityMap = {
      1: t("commands.utils.steam.visibilityPrivate", { lng: locale }),
      2: t("commands.utils.steam.visibilityFriendsOnly", { lng: locale }),
      3: t("commands.utils.steam.visibilityPublic", { lng: locale })
    };
    return visibilityMap[visibility] || t("commands.utils.steam.unknown", { lng: locale });
  }
  async getRecentGames(steamId, count = 3) {
    if (!this.apiKey) {
      throw new Error("Steam API key not configured");
    }
    try {
      const response = await axios.get(`${this.apiUrl}/IPlayerService/GetRecentlyPlayedGames/v1/`, {
        params: {
          key: this.apiKey,
          steamid: steamId,
          count
        }
      });
      const responseData = response.data;
      return responseData.response.games || [];
    } catch (error) {
      logger.error("Error fetching recent games:", error);
      return [];
    }
  }
  async getOwnedGames(steamId) {
    if (!this.apiKey) {
      throw new Error("Steam API key not configured");
    }
    try {
      const response = await axios.get(`${this.apiUrl}/IPlayerService/GetOwnedGames/v1/`, {
        params: {
          key: this.apiKey,
          steamid: steamId,
          include_appinfo: true,
          include_played_free_games: true
        }
      });
      const responseData = response.data;
      return responseData.response;
    } catch (error) {
      logger.error("Error fetching owned games:", error);
      return { game_count: 0, games: [] };
    }
  }
  async getPlayerLevel(steamId) {
    if (!this.apiKey) {
      throw new Error("Steam API key not configured");
    }
    try {
      const response = await axios.get(`${this.apiUrl}/IPlayerService/GetSteamLevel/v1/`, {
        params: {
          key: this.apiKey,
          steamid: steamId
        }
      });
      const responseData = response.data;
      return responseData.response.player_level || 0;
    } catch (error) {
      logger.error("Error fetching player level:", error);
      return 0;
    }
  }
  async getPlayerBans(steamId) {
    if (!this.apiKey) {
      throw new Error("Steam API key not configured");
    }
    try {
      const response = await axios.get(`${this.apiUrl}/ISteamUser/GetPlayerBans/v1/`, {
        params: {
          key: this.apiKey,
          steamids: steamId
        }
      });
      const responseData = response.data;
      return responseData.players[0] || null;
    } catch (error) {
      logger.error("Error fetching player bans:", error);
      return null;
    }
  }
}
