export const MONGO_MIGRATION_TEMPLATE = `import type { MongoMigration } from "../../../../lib/types/migration/index.type.js";

const migration: MongoMigration = {
  async up({ db }) {},

  async down({ db }) {},
};

export default migration;
`;
