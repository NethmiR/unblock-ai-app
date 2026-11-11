# Database Seeding

Seeders put the data an environment needs to be usable into a migrated database. Today that is one record: the bootstrap administrator, the first user who can create everyone else.

The seed pack mirrors the migration pack: a database-agnostic core, a Postgres adapter, timestamped seeder files and npm commands. Run migrations first; seeders never change the schema.

## Layout

```
src/db/seed/
├─ core/                                  shared engine, database-agnostic
│  ├─ seed.loader.ts                      discovers and imports seeder files
│  ├─ seed.runner.ts                      list / run, in file-name order
│  ├─ seed.generator.ts                   scaffolds new seeder files
│  ├─ seed.engine.ts                      wires a directory + template + context factory into an engine
│  └─ seed.cli.ts                         argument parsing and console output
└─ postgres/
   ├─ postgres.seed-context.ts            PostgresSeedContext: the services a seeder may use
   ├─ postgres.seed-engine.ts             builds the context (UserService over Postgres) and the engine
   ├─ postgres.seed-template.ts
   └─ seeders/
      └─ 20261111021734_administrator-user.seeder.ts

scripts/db/
└─ seed-postgres.script.ts                CLI entry point for Postgres
```

Supporting pieces:

- Types live in `src/lib/types/seed/`.
- Constants (`SeedCommand`, `SeedOutcomeStatus`, `SeedEntity`, `SEED_FILE`) live in `src/data/constants/seed.constant.ts`.
- Filename helpers live in `src/utils/seed/seed-file.util.ts`.
- Seed-only configuration lives in `src/config/seed.config.ts` and is loaded only by the seed command, never by the server.
- `SeedError` lives in `src/errors/seed.error.ts`.

## Commands

| Command | What it does |
|---|---|
| `npm run seed:pg:run` | Run every seeder in file-name order |
| `npm run seed:pg:run -- --only <name>` | Run one seeder, e.g. `--only 20261111021734_administrator-user` |
| `npm run seed:pg:list` | List the discovered seeders |
| `npm run seed:pg:create -- <name>` | Scaffold a new seeder file |

Each outcome is printed as `[postgres] <seeder> <entity> <key> -> created|skipped`. A failing seeder stops the run with a non-zero exit code and reports which seeders completed.

## Fresh database setup

```bash
npm run migrate:up
npm run seed:pg:run
```

## The administrator seeder

`20261111021734_administrator-user` creates one user holding every permission:

| Variable | Purpose |
|---|---|
| `SEED_ADMINISTRATOR_EMAIL` | The administrator's email (stored lower-cased) |
| `SEED_ADMINISTRATOR_FULL_NAME` | The administrator's display name |
| `USER_DEFAULT_PASSWORD` | The initial password, the same one every created user receives |

If a user with that email already exists, the seeder reports `skipped` and changes nothing.

## Writing a seeder

```bash
npm run seed:pg:create -- reference departments
```

This creates `src/db/seed/postgres/seeders/<yyyyMMddHHmmss>_reference-departments.seeder.ts`. A seeder default-exports a `Seeder<PostgresSeedContext>` and returns one `SeedOutcome` per record it considered:

```ts
import { Permission } from "../../../../data/constants/permission.constant.js";
import { SeedEntity, SeedOutcomeStatus } from "../../../../data/constants/seed.constant.js";
import type { Seeder } from "../../../../lib/types/seed/index.type.js";
import type { PostgresSeedContext } from "../postgres.seed-context.js";

const seeder: Seeder<PostgresSeedContext> = {
  async run({ userService }) {
    if (await userService.existsByEmail("reviewer@example.com")) {
      return [{ entity: SeedEntity.USER, key: "reviewer@example.com", status: SeedOutcomeStatus.SKIPPED }];
    }
    await userService.createUser(
      { email: "reviewer@example.com", fullName: "Reviewer", permissions: [Permission.TASK_APPROVE] },
      null,
    );
    return [{ entity: SeedEntity.USER, key: "reviewer@example.com", status: SeedOutcomeStatus.CREATED }];
  },
};

export default seeder;
```

Rules:

- **Idempotent.** Seeders are not tracked; every run re-checks and skips what already exists. Running the pack twice must be safe.
- **Through services, not SQL.** A seeder uses the services in `PostgresSeedContext`, so the same validation and invariants apply as for the API. If a seeder needs an operation that does not exist, add it to the service or repository first, and expose the service through `PostgresSeedContext`.
- **Enums for entities.** Add a value to `SeedEntity` for each new kind of record.
- **No environment data in code.** Values that differ per environment come from seed-only variables read in `src/config/seed.config.ts`.
