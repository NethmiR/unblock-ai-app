import test from "node:test";
import assert from "node:assert/strict";
import { RequesterAttribute } from "../../../src/data/constants/requester.constant.js";
import { TaskValueNamespace } from "../../../src/data/constants/task.constant.js";
import {
  assigneeFieldId,
  informationResponseFieldId,
  inputFieldId,
  parseFieldId,
  requesterFieldId,
} from "../../../src/utils/task/task-field-id.util.js";

test("field ids are namespace paths", () => {
  assert.equal(inputFieldId("departure_date"), "inputs.departure_date");
  assert.equal(requesterFieldId(RequesterAttribute.EMAIL), "requester.email");
  assert.equal(assigneeFieldId("advisor_approval"), "assignees.advisor_approval");
  assert.equal(informationResponseFieldId("hod__information_request_1"), "responses.hod__information_request_1");
});

test("parseFieldId round-trips and rejects unknown namespaces", () => {
  assert.deepEqual(parseFieldId(inputFieldId("departure_date")), { namespace: TaskValueNamespace.INPUTS, key: "departure_date" });
  assert.deepEqual(parseFieldId("assignees.hod"), { namespace: TaskValueNamespace.ASSIGNEES, key: "hod" });
  assert.equal(parseFieldId("computed.days"), null);
  assert.equal(parseFieldId("inputs."), null);
  assert.equal(parseFieldId("departure_date"), null);
});
