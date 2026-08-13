import type { Request, Response } from "express";
import packageJson from "../../package.json" with { type: "json" };

export class HealthController {
  check = async (req: Request, res: Response): Promise<void> => {
    res.status(200).json({
      status: "ok",
      uptime: process.uptime(),
      version: packageJson.version,
    });
  };
}
