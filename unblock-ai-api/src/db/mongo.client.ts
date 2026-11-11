import { MongoClient, type Collection, type Db, type Document } from "mongodb";
import { db as dbConfig } from "../config/db.config.js";
import { logger } from "../utils/shared/logger.util.js";
import { DatabaseError } from "../errors/database.error.js";

let client: MongoClient | null = null;
let db: Db | null = null;

export async function getDb(): Promise<Db> {
  if (db) return db;

  try {
    client = new MongoClient(dbConfig.uri, {
      serverSelectionTimeoutMS: dbConfig.serverSelectionTimeoutMs,
    });
    await client.connect();
    db = client.db(dbConfig.dbName);
  } catch (err) {
    throw new DatabaseError("Failed to connect to MongoDB", { cause: err });
  }

  logger.info("mongo connected", { db: dbConfig.dbName });
  return db;
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}

export async function getCollection<T extends Document>(name: string): Promise<Collection<T>> {
  return (await getDb()).collection<T>(name);
}
