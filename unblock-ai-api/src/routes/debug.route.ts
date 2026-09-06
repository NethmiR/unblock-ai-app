import { Router } from "express";
import { createConnection } from "node:net";
import { format } from "node:util";
import nodemailer from "nodemailer";
import { config } from "../config/index.config.js";
import { logger } from "../utils/shared/logger.util.js";

interface SmtpLogEntry {
  time: string;
  level: string;
  message: string;
}

/**
 * TEMPORARY diagnostic route - confirms whether the deployed environment can
 * open an outbound TCP connection to the configured SMTP relay, to tell a
 * network/firewall block apart from a credentials/config problem. Delete
 * this file and its registration in index.route.ts once the mail deploy
 * issue is resolved; it is a network probe and must not stay in production.
 *
 * Only reports TCP reachability - it does not attempt TLS or authentication,
 * so `ok: true` means the port is open, not that credentials are valid.
 */
export function createDebugRouter(): Router {
  const router = Router();

  router.get("/debug/smtp-check", (_req, res) => {
    const host = config.mail.smtpHost;
    const port = config.mail.smtpPort;

    if (!host) {
      res.status(400).json({ ok: false, error: "SMTP_HOST is not configured" });
      return;
    }

    const startedAt = Date.now();
    const socket = createConnection({ host, port });
    socket.setTimeout(5000);

    // The socket can emit a late error while tearing down after a successful
    // probe. Responding twice throws ERR_HTTP_HEADERS_SENT from inside an
    // event handler, which is an uncaught exception - and server.ts exits the
    // process on those. Answer once, then stay quiet.
    let settled = false;
    const settle = (status: number, body: Record<string, unknown>): void => {
      if (settled) return;
      settled = true;
      res.status(status).json({ host, port, ...body });
      socket.destroy();
    };

    socket.on("connect", () => settle(200, { ok: true, ms: Date.now() - startedAt }));
    socket.on("timeout", () => settle(504, { ok: false, error: "timeout - likely blocked outbound" }));
    socket.on("error", (err) => settle(500, { ok: false, error: err.message }));
  });

  // Sends an actual test email through the configured SMTP transport and
  // returns the full SMTP session transcript (connect/auth/DATA exchange)
  // rather than a bare ok/failed flag, so a credentials or relay-policy
  // problem is visible directly in the response instead of only in server logs.
  router.post("/debug/smtp-send", async (req, res) => {
    const host = config.mail.smtpHost;
    const port = config.mail.smtpPort;
    const to = typeof req.body?.to === "string" ? req.body.to.trim() : "";

    logger.info("smtp-send: request received", { to, host, port });

    if (!host) {
      logger.warn("smtp-send: rejected - SMTP_HOST is not configured");
      res.status(400).json({ success: false, error: "SMTP_HOST is not configured", log: [] });
      return;
    }
    if (!to) {
      logger.warn("smtp-send: rejected - 'to' missing from request body");
      res.status(400).json({ success: false, error: "'to' is required in the request body", log: [] });
      return;
    }

    const log: SmtpLogEntry[] = [];
    const record = (level: string, text: string): void => {
      log.push({ time: new Date().toISOString(), level, message: text });
    };
    // nodemailer calls this bunyan-style: logger[level](entry, message, ...args),
    // where `entry` carries { tnx: "server" | "client", cid } and `message` is a
    // util.format template for the remaining args - not a plain (msg, meta) logger.
    const smtpLoggerRecord = (level: string, entry: Record<string, unknown>, message: string, ...args: unknown[]): void => {
      const direction = entry?.tnx === "server" ? "S" : entry?.tnx === "client" ? "C" : undefined;
      const text = format(message, ...args);
      record(level, direction ? `${direction}: ${text}` : text);
    };
    const smtpLogger = {
      level: () => {},
      trace: smtpLoggerRecord.bind(null, "trace"),
      debug: smtpLoggerRecord.bind(null, "debug"),
      info: smtpLoggerRecord.bind(null, "info"),
      warn: smtpLoggerRecord.bind(null, "warn"),
      error: smtpLoggerRecord.bind(null, "error"),
      fatal: smtpLoggerRecord.bind(null, "fatal"),
    };

    logger.debug("smtp-send: creating transport", { host, port, secure: port === 465, hasAuth: !!config.mail.smtpUser });
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: config.mail.smtpUser ? { user: config.mail.smtpUser, pass: config.mail.smtpPass } : undefined,
      logger: smtpLogger,
      debug: true,
    });

    try {
      logger.info("smtp-send: sending test email", { to });
      const info = await transporter.sendMail({
        from: config.mail.from,
        to,
        subject: "Unblock AI - SMTP debug test",
        text: "This is a sample email sent from the /debug/smtp-send diagnostic route.",
        html: "<p>This is a sample email sent from the <code>/debug/smtp-send</code> diagnostic route.</p>",
      });
      record("info", format("sendMail resolved: messageId=%s response=%s", info.messageId, info.response));
      logger.info("smtp-send: succeeded", { to, messageId: info.messageId });
      res.status(200).json({ success: true, host, port, to, messageId: info.messageId, log });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      record("error", format("sendMail rejected: %s", error));
      logger.error("smtp-send: failed", { to, host, port, error });
      res.status(500).json({ success: false, host, port, to, error, log });
    } finally {
      transporter.close();
      logger.debug("smtp-send: transport closed", { to });
    }
  });

  return router;
}
