import type { IAuthStore } from "./auth-store.interface.js";
import type { AuthAudience, AuthUserRow } from "../../lib/types/auth/auth.type.js";

export interface InMemoryAuthStoreOptions {
  adminUsers?: AuthUserRow[];
  portalUsers?: AuthUserRow[];
}

// Gives `node:test` a real store with no live Postgres (D-5), mirroring how
// mongodb-memory-server does the same job for Mongo-backed services.
export class InMemoryAuthStore implements IAuthStore {
  private readonly tables: Record<AuthAudience, Map<string, AuthUserRow>>;

  constructor({ adminUsers = [], portalUsers = [] }: InMemoryAuthStoreOptions = {}) {
    this.tables = {
      admin: new Map(adminUsers.map((user) => [user.id, { ...user }])),
      portal: new Map(portalUsers.map((user) => [user.id, { ...user }])),
    };
  }

  async findByUsername(audience: AuthAudience, username: string): Promise<AuthUserRow | null> {
    const lower = username.toLowerCase();
    for (const row of this.tables[audience].values()) {
      if (row.username.toLowerCase() === lower) return { ...row };
    }
    return null;
  }

  async findById(audience: AuthAudience, id: string): Promise<AuthUserRow | null> {
    const row = this.tables[audience].get(id);
    return row ? { ...row } : null;
  }

  async recordSuccessfulLogin(audience: AuthAudience, id: string, at: Date): Promise<void> {
    const row = this.tables[audience].get(id);
    if (!row) return;
    row.last_login_at = at;
    row.failed_attempt_count = 0;
    row.updated_at = at;
  }

  async recordFailedAttempt(audience: AuthAudience, id: string, at: Date): Promise<number> {
    const row = this.tables[audience].get(id);
    if (!row) return 0;
    row.failed_attempt_count += 1;
    row.last_failed_attempt_at = at;
    row.updated_at = at;
    return row.failed_attempt_count;
  }
}
