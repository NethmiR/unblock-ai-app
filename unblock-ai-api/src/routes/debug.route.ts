import { Router } from "express";
import { createConnection } from "node:net";
import { config } from "../config/index.config.js";

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

  return router;
}
