import test from "node:test";
import assert from "node:assert/strict";
import { createSeedWorld } from "../../helpers/seed-world.helper.js";

function designationId(world: Awaited<ReturnType<typeof createSeedWorld>>, code: string): string {
  const designation = world.catalogue.designationsByCode.get(code);
  if (!designation) throw new Error(code);
  return designation.id;
}

function unitId(world: Awaited<ReturnType<typeof createSeedWorld>>, code: string): string {
  const unit = world.catalogue.unitsByCode.get(code);
  if (!unit) throw new Error(code);
  return unit.id;
}

test("findDesignationHolders narrows holders to the given units", async () => {
  const world = await createSeedWorld();

  const holders = await world.repositories.userAffiliationRepository.findDesignationHolders(
    designationId(world, "head_of_department"),
    [unitId(world, "IT")],
  );

  assert.deepEqual(holders.map((holder) => holder.holder.fullName), ["Dinesh Wijesinghe"]);
  assert.equal(holders[0]?.organisationalUnitId, unitId(world, "IT"));
});

test("findDesignationHolders with null searches every unit, ordered by full name", async () => {
  const world = await createSeedWorld();

  const holders = await world.repositories.userAffiliationRepository.findDesignationHolders(designationId(world, "head_of_department"), null);

  assert.deepEqual(
    holders.map((holder) => holder.holder.fullName),
    ["Chamari Gunawardena", "Dinesh Wijesinghe", "Malith Abeysinghe"],
  );
});

test("findDesignationHolders with no units returns nothing", async () => {
  const world = await createSeedWorld();

  assert.deepEqual(await world.repositories.userAffiliationRepository.findDesignationHolders(designationId(world, "dean"), []), []);
});

test("findDesignationHolders excludes inactive users", async () => {
  const world = await createSeedWorld({ disabledUserNames: ["Sunethra Ratnayake"] });

  const holders = await world.repositories.userAffiliationRepository.findDesignationHolders(
    designationId(world, "dean"),
    [unitId(world, "FIT")],
  );

  assert.deepEqual(holders, []);
});
