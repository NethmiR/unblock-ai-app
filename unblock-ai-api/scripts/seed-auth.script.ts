import { hashPassword } from "../src/utils/shared/password.util.js";
import { query, closePool } from "../src/db/postgres.client.js";
import { ConfigurationError } from "../src/errors/configuration.error.js";

interface SeedAdmin {
  username: string;
  password: string;
  email: string;
  fullName: string;
  department: string | null;
}

interface SeedPortalUser {
  username: string;
  password: string;
  email: string;
  fullName: string;
  department: string | null;
  faculty: string | null;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new ConfigurationError(`Missing required environment variable: ${name}`);
  return value;
}

/**
 * INSERT ... ON CONFLICT DO NOTHING never duplicates a row and never silently
 * resets a changed password. --force switches to DO UPDATE for a deliberate reset.
 */
async function seedAdmin(user: SeedAdmin, force: boolean): Promise<"seeded" | "skipped"> {
  const passwordHash = await hashPassword(user.password);
  const conflictAction = force
    ? "DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = now()"
    : "DO NOTHING";

  const rows = await query<{ id: string }>(
    `INSERT INTO admin_users (username, email, full_name, department, password_hash)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (lower(username)) ${conflictAction}
     RETURNING id`,
    [user.username, user.email, user.fullName, user.department, passwordHash],
  );

  return rows.length > 0 ? "seeded" : "skipped";
}

async function seedPortalUser(user: SeedPortalUser, force: boolean): Promise<"seeded" | "skipped"> {
  const passwordHash = await hashPassword(user.password);
  const conflictAction = force
    ? "DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = now()"
    : "DO NOTHING";

  const rows = await query<{ id: string }>(
    `INSERT INTO portal_users (username, email, full_name, department, faculty, password_hash)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (lower(username)) ${conflictAction}
     RETURNING id`,
    [user.username, user.email, user.fullName, user.department, user.faculty, passwordHash],
  );

  return rows.length > 0 ? "seeded" : "skipped";
}

const force = process.argv.includes("--force");

const admin: SeedAdmin = {
  username: requireEnv("SEED_ADMIN_USERNAME"),
  password: requireEnv("SEED_ADMIN_PASSWORD"),
  email: "admin@unblock-ai.local",
  fullName: "Nadeesha Perera",
  department: "Registrar's Office",
};

const user1: SeedPortalUser = {
  username: requireEnv("SEED_USER1_USERNAME"),
  password: requireEnv("SEED_USER1_PASSWORD"),
  email: "chathura@unblock-ai.local",
  fullName: "Chathura Silva",
  department: "Department of Information Technology",
  faculty: "Information Technology",
};

const user2: SeedPortalUser = {
  username: requireEnv("SEED_USER2_USERNAME"),
  password: requireEnv("SEED_USER2_PASSWORD"),
  email: "dilani@unblock-ai.local",
  fullName: "Dilani Fernando",
  department: "Department of Computer Science",
  faculty: "Computer Science",
};

console.log(`admin_users   ${admin.username.padEnd(12)} -> ${await seedAdmin(admin, force)}`);
console.log(`portal_users  ${user1.username.padEnd(12)} -> ${await seedPortalUser(user1, force)}`);
console.log(`portal_users  ${user2.username.padEnd(12)} -> ${await seedPortalUser(user2, force)}`);

await closePool();
