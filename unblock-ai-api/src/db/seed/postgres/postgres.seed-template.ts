export const POSTGRES_SEED_TEMPLATE = `import type { Seeder } from "../../../../lib/types/seed/index.type.js";
import type { PostgresSeedContext } from "../postgres.seed-context.js";

const seeder: Seeder<PostgresSeedContext> = {
  async run(context) {
    return [];
  },
};

export default seeder;
`;
