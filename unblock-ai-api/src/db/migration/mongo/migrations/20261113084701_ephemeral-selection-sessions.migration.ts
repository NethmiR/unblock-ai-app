import type { Db, IndexDescription } from "mongodb";
import type { MongoMigration } from "../../../../lib/types/migration/index.type.js";

const SELECTION_SESSION_INDEXES: IndexDescription[] = [
  { key: { expires_at: 1 }, name: "selection_session_expiry", expireAfterSeconds: 0 },
  { key: { created_by: 1, created_at: -1 }, name: "selection_session_owner" },
];

async function dropIfExists(db: Db, name: string): Promise<void> {
  const existing = await db.listCollections({ name }, { nameOnly: true }).toArray();
  if (existing.length > 0) await db.dropCollection(name);
}

const migration: MongoMigration = {
  async up({ db }) {
    await dropIfExists(db, "selection_sessions");
    await db.createCollection("selection_sessions");
    await db.collection("selection_sessions").createIndexes(SELECTION_SESSION_INDEXES);
  },

  async down({ db }) {
    await dropIfExists(db, "selection_sessions");
    await db.createCollection("selection_sessions");
  },
};

export default migration;
