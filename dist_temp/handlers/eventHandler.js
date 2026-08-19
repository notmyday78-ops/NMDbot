"use strict";
import { readdirSync } from "fs";
import { join } from "path";
import { logger } from "../utils/logger";
import chalk from "chalk";
export async function loadEvents(client) {
  const eventsPath = join(__dirname, "..", "events");
  const eventFiles = readdirSync(eventsPath).filter(
    (file) => file.endsWith(".ts") || file.endsWith(".js")
  );
  for (const file of eventFiles) {
    try {
      const filePath = join(eventsPath, file);
      const module = await import(filePath);
      if (!module.name || !module.execute) {
        logger.warn(
          chalk.yellow(`Event at ${filePath} is missing required "name" or "execute" property`)
        );
        continue;
      }
      const typedExecute = module.execute;
      if (module.once) {
        client.once(module.name, (...args) => {
          void typedExecute(...args);
        });
      } else {
        client.on(module.name, (...args) => {
          void typedExecute(...args);
        });
      }
      logger.info(chalk.green(`Loaded event: ${module.name}`));
    } catch (error) {
      logger.error(chalk.red(`Failed to load event ${file}:`), error);
    }
  }
}
