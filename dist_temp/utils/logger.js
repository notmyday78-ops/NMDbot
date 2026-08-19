"use strict";
import winston from "winston";
import { join } from "path";
const { combine, timestamp, printf, colorize, errors } = winston.format;
const logFormat = printf(({ level, message, timestamp: timestamp2, stack }) => {
  const timestampStr = String(timestamp2);
  const levelStr = level;
  const messageStr = String(message);
  const stackStr = stack ? String(stack) : "";
  return `${timestampStr} [${levelStr}]: ${stackStr || messageStr}`;
});
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: combine(timestamp({ format: "YYYY-MM-DD HH:mm:ss" }), errors({ stack: true }), logFormat),
  transports: [
    // Console transport
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        errors({ stack: true }),
        logFormat
      )
    }),
    // File transports
    new winston.transports.File({
      filename: join(process.cwd(), "logs", "error.log"),
      level: "error",
      maxsize: 5242880,
      // 5MB
      maxFiles: 5
    }),
    new winston.transports.File({
      filename: join(process.cwd(), "logs", "combined.log"),
      maxsize: 5242880,
      // 5MB
      maxFiles: 5
    })
  ]
});
import { mkdirSync, existsSync } from "fs";
const logsDir = join(process.cwd(), "logs");
if (!existsSync(logsDir)) {
  mkdirSync(logsDir);
}
