import universityOfMoratuwaSampleUsersSeeder from "./20261111065643_university-of-moratuwa-sample-users.seeder.js";
import type { Seeder } from "../../../../lib/types/seed/index.type.js";
import type { PostgresSeedContext } from "../postgres.seed-context.js";

const seeder: Seeder<PostgresSeedContext> = {
  run: (context) => universityOfMoratuwaSampleUsersSeeder.run(context),
};

export default seeder;
