import test from "node:test";
import assert from "node:assert/strict";
import { TaskEffectExecutorService } from "../../../src/services/task-effect-executor.service.js";
import { TaskEffectKind } from "../../../src/data/constants/task.constant.js";
import { hashApprovalToken, verifyToken } from "../../../src/utils/approval/token.util.js";
import { FakeTaskModel } from "../../helpers/fake-model.helper.js";
import { loadExpectedFixture } from "../../helpers/fixture.helper.js";
import { buildTaskDocument, leaveResolutions, TASK_NOW } from "../../helpers/task-fixture.helper.js";
import { TEST_MAIL_CONFIG } from "../../helpers/task-testbed.helper.js";
import type { ITaskNotifier } from "../../../src/lib/types/task/task-notification.type.js";

function recordingNotifier(tokens: string[], succeed = true): ITaskNotifier {
  return {
    sendApprovalRequest: async (_task, _step, token) => {
      tokens.push(token);
      return succeed;
    },
    sendRequesterActionRequired: async () => true,
    sendInformationRequested: async () => true,
    sendTaskRejected: async () => true,
    sendTaskCompleted: async () => true,
    sendStepNotification: async () => true,
  };
}

async function storedTask(model: FakeTaskModel) {
  const task = buildTaskDocument(loadExpectedFixture("it_faculty_overseas_leave.json"), leaveResolutions());
  await model.insert(task);
  return task;
}

test("dispatch stores only the token hash and hands the raw token to the notifier after the write", async () => {
  const model = new FakeTaskModel();
  const tokens: string[] = [];
  const executor = new TaskEffectExecutorService({ taskModel: model, mailConfig: TEST_MAIL_CONFIG, notifier: recordingNotifier(tokens), now: () => TASK_NOW });
  const task = await storedTask(model);

  const result = await executor.execute(task, [{ kind: TaskEffectKind.DISPATCH_APPROVAL, step_id: "advisor_review" }]);

  const approval = result.steps.find((step) => step.id === "advisor_review")!.approval!;
  assert.equal(tokens.length, 1);
  assert.equal(approval.token_hash, hashApprovalToken(tokens[0]!));
  assert.equal(verifyToken(tokens[0]!, TEST_MAIL_CONFIG.tokenSecret)?.step_id, "advisor_review");
  assert.equal(approval.notified_at?.toISOString(), TASK_NOW.toISOString());
  assert.equal(approval.token_expires_at?.getTime(), TASK_NOW.getTime() + 14 * 24 * 60 * 60 * 1000);
  assert.ok(!JSON.stringify(result).includes(tokens[0]!));
  assert.equal(result.revision, 2);
});

test("a failed send leaves notified_at empty but the link live", async () => {
  const model = new FakeTaskModel();
  const executor = new TaskEffectExecutorService({ taskModel: model, mailConfig: TEST_MAIL_CONFIG, notifier: recordingNotifier([], false) });
  const task = await storedTask(model);

  const result = await executor.execute(task, [{ kind: TaskEffectKind.DISPATCH_APPROVAL, step_id: "advisor_review" }]);

  const approval = result.steps.find((step) => step.id === "advisor_review")!.approval!;
  assert.ok(approval.token_hash);
  assert.equal(approval.notified_at, null);
});

test("revoking clears every stored hash", async () => {
  const model = new FakeTaskModel();
  const executor = new TaskEffectExecutorService({ taskModel: model, mailConfig: TEST_MAIL_CONFIG });
  const task = await storedTask(model);
  const dispatched = await executor.execute(task, [{ kind: TaskEffectKind.DISPATCH_APPROVAL, step_id: "advisor_review" }]);

  const revoked = await executor.execute(dispatched, [{ kind: TaskEffectKind.REVOKE_APPROVAL_LINKS }]);

  assert.ok(revoked.steps.every((step) => step.approval === null || step.approval.token_hash === null));
});

test("a failed write never throws into the caller", async () => {
  const model = new FakeTaskModel();
  const executor = new TaskEffectExecutorService({ taskModel: model, mailConfig: TEST_MAIL_CONFIG });
  const task = await storedTask(model);

  const result = await executor.execute({ ...task, revision: 99 }, [{ kind: TaskEffectKind.DISPATCH_APPROVAL, step_id: "advisor_review" }]);

  assert.equal(result.revision, 99);
});
