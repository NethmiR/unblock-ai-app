import test from "node:test";
import assert from "node:assert/strict";
import { validateSchema } from "../../../src/utils/workflow/schema-validator.util.js";
import { expectedFixtureNames, loadExpectedFixture } from "../../helpers/fixture.helper.js";

for (const file of expectedFixtureNames()) {
  test(`fixture ${file} validates against workflow.schema.json`, () => {
    const workflow = loadExpectedFixture(file);
    const errors = validateSchema(workflow);
    assert.deepEqual(errors, []);
  });
}

test("every gold fixture has a usable retrieval_summary", () => {
  for (const file of expectedFixtureNames()) {
    const fixture = loadExpectedFixture(file);
    const s = fixture.retrieval_summary;
    assert.ok(s, `${fixture.workflow_id} is missing retrieval_summary`);
    assert.ok(s.one_liner.length > 20, "one_liner must be a real sentence");
    assert.ok(s.aliases.length >= 2, "need at least 2 aliases");
    assert.ok(s.keywords.length >= 5, "need at least 5 keywords");
    assert.ok(s.triggers.length >= 2, "need at least 2 triggers");
    assert.ok(s.not_for.length >= 2, "not_for is the highest-value field - populate it");
  }
});
