import type { Request, Response } from "express";
import packageJson from "../../package.json" with { type: "json" };
import { checkPostgresHealth } from "../db/postgres.client.js";

export class HealthController {
  check = async (req: Request, res: Response): Promise<void> => {
    const postgresOk = await checkPostgresHealth();

    res.status(200).json({
      status: "ok",
      uptime: process.uptime(),
      version: packageJson.version,
      postgres: postgresOk ? "ok" : "unavailable",
    });
  };
}
