"use strict";
import vm from "vm";
import { logger } from "./logger";
export function safeRegexTest(pattern, flags, text, timeoutMs = 50) {
  try {
    const sandbox = { result: false };
    const context = vm.createContext(sandbox);
    const script = new vm.Script(
      `result = new RegExp(${JSON.stringify(pattern)}, ${JSON.stringify(flags)}).test(${JSON.stringify(text)});`
    );
    script.runInContext(context, { timeout: timeoutMs });
    return sandbox.result;
  } catch (error) {
    if (error instanceof Error && error.message.includes("timed out")) {
      logger.warn(`Regex evaluation timed out for pattern: ${pattern}`);
    }
    return false;
  }
}
export function safeRegexMatch(pattern, flags, text, timeoutMs = 50) {
  try {
    const sandbox = { matches: [] };
    const context = vm.createContext(sandbox);
    const script = new vm.Script(`
      const regex = new RegExp(${JSON.stringify(pattern)}, ${JSON.stringify(flags)});
      const isGlobal = regex.global;
      let result;
      while ((result = regex.exec(${JSON.stringify(text)})) !== null) {
        matches.push(result[0]);
        if (!isGlobal) break;
      }
    `);
    script.runInContext(context, { timeout: timeoutMs });
    return { matches: sandbox.matches, timedOut: false };
  } catch (error) {
    if (error instanceof Error && error.message.includes("timed out")) {
      logger.warn(`Regex match evaluation timed out for pattern: ${pattern}`);
      return { matches: [], timedOut: true };
    }
    return { matches: [], timedOut: false };
  }
}
