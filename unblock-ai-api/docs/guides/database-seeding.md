# Database Seeding

Seeders put the data an environment needs to be usable into a migrated database:

- the bootstrap administrator, the first user who can create everyone else;
- the University of Moratuwa organisational structure (faculties, departments and divisions) and its designations;
- optionally, sample users `u1@u.c` … `u19@u.c` with test affiliations, for development and demos only.

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
   ├─ postgres.seed-engine.ts             builds the context (services over Postgres) and the engine
   ├─ postgres.seed-template.ts
   └─ seeders/
      ├─ 20261111021734_administrator-user.seeder.ts
      ├─ 20261111063459_university-of-moratuwa-organisational-units.seeder.ts
      ├─ 20261111063506_university-of-moratuwa-designations.seeder.ts
      ├─ 20261111065643_university-of-moratuwa-sample-users.seeder.ts
      └─ 20261113080422_task-request-sample-users.seeder.ts
└─ data/
   └─ university-of-moratuwa/             typed, database-agnostic seed data
      ├─ organisational-units.seed-data.ts
      ├─ designations.seed-data.ts
      └─ sample-users.seed-data.ts

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

## The University of Moratuwa seeders

| Seeder | Creates | Skips by |
|---|---|---|
| `…_university-of-moratuwa-organisational-units` | 6 faculties, 35 departments, 5 faculty-level and 17 university-level divisions | unit `code` |
| `…_university-of-moratuwa-designations` | 29 designations (leadership, academic, academic support, administrative, non-academic, student) | designation `code` |
| `…_university-of-moratuwa-sample-users` | 19 sample users `u1@u.c` … `u19@u.c` with permissions, memberships and designations | email |
| `…_task-request-sample-users` | Re-runs the sample users seeder, so a database seeded before the task request revamp gains `u17@u.c` … `u19@u.c`. Emails are assigned by position (`u<n>@u.c`), and an email that already exists is skipped, so on a database where those addresses belong to someone else the demo users are not created | email |

- The units seeder walks the tree parent-first. A unit that already exists is skipped, and its id is still used as the parent of its children.
- The seeders never overwrite edits made through the UI; correcting a name is a UI change, not a code change.
- Sample users go through `UserAffiliationService`, so every affiliation rule applies. In particular, a user in a department must also be a member of its faculty: the sample data lists the faculty (usually without a designation) before each department.
- The data lives in `src/db/seed/data/university-of-moratuwa/`. Items still to confirm with the Registrar are listed in Appendix A of `docs/organisational-structure-and-user-affiliations-phase-plan.md`.
- `tests/unit/db/university-of-moratuwa-seed-data.test.ts` checks the data's integrity (codes, hierarchy, applicable unit types, single holders) and that every seeder is idempotent.

### Sample users

The sample users seeder runs only when `SEED_SAMPLE_USERS=true` (default `false`). They all receive `USER_DEFAULT_PASSWORD`, so **never enable it in production**. Their emails follow `u<n>@u.c` in sequence; profiles cover the Vice-Chancellor, Registrar, Deans, Heads of Department, lecturers, administrative staff, students and one user without affiliations. Every sample user in a department is also a member of that department's faculty.

The task request demo (`docs/task-request-revamp-phase-plan.md`, Appendix A) uses:

| Email | Name | Affiliation | Role in the demo |
|---|---|---|---|
| `u17@u.c` | Kavindu Jayawardena | Student, Department of Information Technology (Faculty of Information Technology) | Requester for the IT overseas-leave template |
| `u18@u.c` | Sunethra Ratnayake | Dean, Faculty of Information Technology | Resolved from the directory for the Dean step |
| `u19@u.c` | Dinesh Wijesinghe | Head of Department, Department of Information Technology | Resolved from the directory for the HoD step |
| `u12@u.c` | Hasitha Dissanayake | Student, Computer Science & Engineering (Faculty of Engineering) | Requester for the Engineering template |

## Starting from scratch

Seeders skip records that already exist, so changing seed data does not update a seeded database. To re-seed everything on a development database, reset the schema and run the pack again:

```bash
npm run migrate:pg:reset
npm run migrate:pg:up
npm run seed:pg:run
```

`migrate:pg:reset` rolls back every Postgres migration, which drops **all** Postgres data, including users and sessions created through the UI. Never run it against a database whose data you need.

Rolling back only the organisation migration (`npm run migrate:pg:down`) drops every unit, designation and affiliation but keeps users. The sample users seeder then skips `u1@u.c` … `u19@u.c` because they still exist, and they end up with no affiliations. Remove the sample users as well, or use the full reset above.

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
