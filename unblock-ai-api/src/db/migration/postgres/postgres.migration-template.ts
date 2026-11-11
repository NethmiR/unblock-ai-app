export const POSTGRES_MIGRATION_TEMPLATE = `import type { PostgresMigration } from "../../../../lib/types/migration/index.type.js";

const migration: PostgresMigration = {
  async up({ client }) {
    await client.query(\`\`);
  },

  async down({ client }) {
    await client.query(\`\`);
  },
};

export default migration;
`;
