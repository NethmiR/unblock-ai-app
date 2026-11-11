import { MongoServerError, type Collection, type Document } from "mongodb";
import { closeDb, getDb } from "../../mongo.client.js";
import { MIGRATION_TRACKING } from "../../../data/constants/migration.constant.js";
import { MigrationError } from "../../../errors/migration.error.js";
import type {
  AppliedMigration,
  IMigrationStore,
  MigrationDefinition,
  MongoMigrationContext,
} from "../../../lib/types/migration/migration.type.js";

const { STORE: COLLECTION, LOCK: LOCK_COLLECTION, LOCK_KEY } = MIGRATION_TRACKING;
const DUPLICATE_KEY_CODE = 11000;

interface MigrationDocument extends Document {
  _id: string;
  batch: number;
  applied_at: Date;
}

interface MigrationLockDocument extends Document {
  _id: number;
  locked_at: Date;
}

export class MongoMigrationStore implements IMigrationStore<MongoMigrationContext> {
  private async migrations(): Promise<Collection<MigrationDocument>> {
    return (await getDb()).collection<MigrationDocument>(COLLECTION);
  }

  private async locks(): Promise<Collection<MigrationLockDocument>> {
    return (await getDb()).collection<MigrationLockDocument>(LOCK_COLLECTION);
  }

  async initialize(): Promise<void> {
    await getDb();
  }

  async acquireLock(): Promise<void> {
    try {
      await (await this.locks()).insertOne({ _id: LOCK_KEY, locked_at: new Date() });
    } catch (err) {
      if (err instanceof MongoServerError && err.code === DUPLICATE_KEY_CODE) {
        throw new MigrationError(
          "Mongo migrations are locked by another run; use the unlock command if no run is active",
        );
      }
      throw err;
    }
  }

  async releaseLock(): Promise<void> {
    await (await this.locks()).deleteOne({ _id: LOCK_KEY });
  }

  async listApplied(): Promise<AppliedMigration[]> {
    const documents = await (await this.migrations()).find().sort({ batch: 1, _id: 1 }).toArray();
    return documents.map(({ _id, batch, applied_at }) => ({ name: _id, batch, appliedAt: applied_at }));
  }

  async apply({ name, migration }: MigrationDefinition<MongoMigrationContext>, batch: number): Promise<void> {
    await migration.up({ db: await getDb() });
    await (await this.migrations()).insertOne({ _id: name, batch, applied_at: new Date() });
  }

  async revert({ name, migration }: MigrationDefinition<MongoMigrationContext>): Promise<void> {
    await migration.down({ db: await getDb() });
    await (await this.migrations()).deleteOne({ _id: name });
  }

  close(): Promise<void> {
    return closeDb();
  }
}
