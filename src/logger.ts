import pino, { type Logger } from "pino";
import { z } from "zod";

/** Supported structured log levels at the process boundary. */
export type LogLevel = z.infer<typeof logLevelSchema>;

const logLevelSchema = z
  .enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"])
  .default("info");

/**
 * Parse the optional REA_LOG_LEVEL environment variable, returning undefined
 * for an unsupported value. Configuration parsing owns reporting that value.
 */
export const parseLogLevel = (value: unknown): LogLevel | undefined => {
  const parsed = logLevelSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

/** Create a JSON logger on stderr so protocol and CLI result stdout stay valid. */
export const createLogger = (mode: "mcp" | "cli", level: LogLevel): Logger =>
  pino(
    {
      level,
      base: { application: "rea", mode },
    },
    pino.destination({ dest: 2, sync: false }),
  );

/** Logger used by embedders that have not opted into process output. */
export const silentLogger = pino({ level: "silent" });
