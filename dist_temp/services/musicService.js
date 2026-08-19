"use strict";
import { Player } from "discord-player";
import { DefaultExtractors } from "@discord-player/extractor";
import { logger } from "../utils/logger";
export class MusicService {
  player = null;
  async init(client) {
    try {
      this.player = new Player(client);
      await this.player.extractors.loadMulti(DefaultExtractors);
      logger.info("Music player initialized with extractors.");
    } catch (error) {
      logger.error("Failed to initialize music player:", error);
    }
  }
}
export const musicService = new MusicService();
