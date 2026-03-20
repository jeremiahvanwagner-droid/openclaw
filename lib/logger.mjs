/**
 * Logger for .mjs modules
 * Thin wrapper around Pino for non-TypeScript modules.
 */

import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  formatters: {
    level: (label) => ({ level: label }),
  },
});

export function childLogger(context) {
  return logger.child(context);
}
