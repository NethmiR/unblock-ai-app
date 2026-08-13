import { ensureIndexes } from "../src/db/index.definition.js";
import { closeDb, getDb } from "../src/db/mongo.client.js";
import { config } from "../src/config/index.config.js";

const db = await getDb();
await ensureIndexes();

console.log(`database   : ${config.db.dbName}`);
for (const c of await db.listCollections().toArray()) {
  const indexes = await db.collection(c.name).indexes();
  console.log(`  ${c.name.padEnd(20)} ${indexes.map((i) => i.name).join(", ")}`);
}
await closeDb();
