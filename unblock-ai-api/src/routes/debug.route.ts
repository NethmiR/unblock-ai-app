import { Router } from "express";
import { config } from "../config/index.config.js";
import { logger } from "../utils/shared/logger.util.js";
import { parseSender } from "../services/mailer/brevo.mailer.js";

const BREVO_ACCOUNT_URL = "https://api.brevo.com/v3/account";
const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";
const REQUEST_TIMEOUT_MS = 10_000;

interface DebugLogEntry {
  time: string;
  level: string;
  message: string;
}

function withTimeout(ms: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

/**
 * TEMPORARY diagnostic routes - confirm whether the deployed environment can
 * reach Brevo's transactional email API and that BREVO_API_KEY is valid, to
 * tell a network/firewall block apart from a credentials/config problem.
 * Delete this file and its registration in index.route.ts once the mail
 * deploy issue is resolved; these are network probes and must not stay in
 * production.
 *
 * Unlike the old SMTP relay, Brevo's API is plain HTTPS on port 443 - the
 * same port every other outbound call in this app already uses - so a
 * platform that blocks SMTP ports 25/465/587 (Render and similar PaaS
 * providers do, by default) should have no trouble reaching it.
 */
export function createDebugRouter(): Router {
  const router = Router();

  router.get("/debug/smtp-check", async (_req, res) => {
    const apiKey = config.mail.brevoApiKey;

    if (!apiKey) {
      res.status(400).json({ ok: false, error: "BREVO_API_KEY is not configured" });
      return;
    }

    const startedAt = Date.now();
    const { signal, cancel } = withTimeout(REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(BREVO_ACCOUNT_URL, {
        method: "GET",
        headers: { "api-key": apiKey, accept: "application/json" },
        signal,
      });
      const ms = Date.now() - startedAt;
      const body: unknown = await response.json().catch(() => ({}));

      if (!response.ok) {
        res.status(response.status).json({ ok: false, ms, status: response.status, body });
        return;
      }
      res.status(200).json({ ok: true, ms, status: response.status, account: body });
    } catch (err) {
      const ms = Date.now() - startedAt;
      const timedOut = err instanceof Error && err.name === "AbortError";
      res.status(timedOut ? 504 : 500).json({
        ok: false,
        ms,
        error: timedOut ? "timeout - likely blocked outbound" : err instanceof Error ? err.message : String(err),
      });
    } finally {
      cancel();
    }
  });

  // Sends an actual test email through Brevo's HTTP API and returns the full
  // request/response transcript rather than a bare ok/failed flag, so an
  // auth or payload problem is visible directly in the response instead of
  // only in server logs.
  router.post("/debug/smtp-send", async (req, res) => {
    const apiKey = config.mail.brevoApiKey;
    const to = typeof req.body?.to === "string" ? req.body.to.trim() : "";

    logger.info("smtp-send: request received", { to });

    if (!apiKey) {
      logger.warn("smtp-send: rejected - BREVO_API_KEY is not configured");
      res.status(400).json({ success: false, error: "BREVO_API_KEY is not configured", log: [] });
      return;
    }
    if (!to) {
      logger.warn("smtp-send: rejected - 'to' missing from request body");
      res.status(400).json({ success: false, error: "'to' is required in the request body", log: [] });
      return;
    }

    const log: DebugLogEntry[] = [];
    const record = (level: string, message: string): void => {
      log.push({ time: new Date().toISOString(), level, message });
    };

    const payload = {
      sender: parseSender(config.mail.from),
      to: [{ email: to }],
      subject: "Unblock AI - Brevo API debug test",
      textContent: "This is a sample email sent from the /debug/smtp-send diagnostic route.",
      htmlContent: "<p>This is a sample email sent from the <code>/debug/smtp-send</code> diagnostic route.</p>",
    };

    record("info", `POST ${BREVO_SEND_URL}`);
    record("debug", `request body: ${JSON.stringify(payload)}`);

    const { signal, cancel } = withTimeout(REQUEST_TIMEOUT_MS);
    const startedAt = Date.now();
    try {
      logger.info("smtp-send: calling Brevo API", { to });
      const response = await fetch(BREVO_SEND_URL, {
        method: "POST",
        headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(payload),
        signal,
      });
      const ms = Date.now() - startedAt;
      const body: unknown = await response.json().catch(() => ({}));
      record("info", `response: HTTP ${response.status} in ${ms}ms - ${JSON.stringify(body)}`);

      if (!response.ok) {
        const error =
          body && typeof body === "object" && typeof (body as { message?: unknown }).message === "string"
            ? (body as { message: string }).message
            : `Brevo API returned HTTP ${response.status}`;
        logger.error("smtp-send: failed", { to, status: response.status, error });
        res.status(502).json({ success: false, to, status: response.status, error, log });
        return;
      }

      const messageId = typeof (body as { messageId?: unknown })?.messageId === "string"
        ? (body as { messageId: string }).messageId
        : null;
      logger.info("smtp-send: succeeded", { to, messageId });
      res.status(200).json({ success: true, to, messageId, log });
    } catch (err) {
      const ms = Date.now() - startedAt;
      const timedOut = err instanceof Error && err.name === "AbortError";
      const error = timedOut ? `timed out after ${ms}ms` : err instanceof Error ? err.message : String(err);
      const hint = timedOut
        ? "No response from api.brevo.com within the timeout. Brevo's API is plain HTTPS on port 443, so if this " +
          "environment can reach any other external HTTPS API it should reach this too - check for an egress " +
          "proxy/allowlist blocking api.brevo.com specifically, or DNS resolution failing for this host."
        : undefined;
      record("error", `request failed: ${error}`);
      logger.error("smtp-send: failed", { to, error, hint });
      res.status(500).json({ success: false, to, error, hint, log });
    } finally {
      cancel();
      logger.debug("smtp-send: done", { to });
    }
  });

  return router;
}
