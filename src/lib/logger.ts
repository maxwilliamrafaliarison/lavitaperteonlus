/* ============================================================
   LOGGER — wrapper console avec niveaux + contexte
   Zéro dépendance. Lisible dans les logs Vercel Functions.
   Niveaux : debug | info | warn | error
   Plus tard (Phase 10+) : envoi vers Sentry/Logtail si besoin.
   ============================================================ */

type Level = "debug" | "info" | "warn" | "error";

interface LogContext {
  [key: string]: unknown;
}

function format(level: Level, scope: string, message: string, ctx?: LogContext): string {
  const ts = new Date().toISOString();
  const ctxStr = ctx && Object.keys(ctx).length > 0 ? ` ${JSON.stringify(ctx)}` : "";
  return `[${ts}] ${level.toUpperCase().padEnd(5)} [${scope}] ${message}${ctxStr}`;
}

export function createLogger(scope: string) {
  const isDev = process.env.NODE_ENV !== "production";

  return {
    debug(message: string, ctx?: LogContext) {
      if (!isDev) return; // silencieux en prod
      console.log(format("debug", scope, message, ctx));
    },
    info(message: string, ctx?: LogContext) {
      console.log(format("info", scope, message, ctx));
    },
    warn(message: string, ctx?: LogContext) {
      console.warn(format("warn", scope, message, ctx));
    },
    error(message: string, ctx?: LogContext | Error) {
      let payload: LogContext | undefined;
      if (ctx instanceof Error) {
        payload = { name: ctx.name, message: ctx.message, stack: ctx.stack };
      } else {
        payload = ctx;
      }
      console.error(format("error", scope, message, payload));
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;
