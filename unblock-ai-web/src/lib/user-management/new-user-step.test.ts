import { describe, expect, it } from "vitest";
import { NewUserStep, resolveNewUserStep } from "./new-user-step";
import { isValidEmail, normalizeEmail } from "./user-account-validation";

describe("resolveNewUserStep", () => {
  it("starts at the account step and moves on once a user exists", () => {
    expect(resolveNewUserStep(null, NewUserStep.DONE)).toBe(NewUserStep.ACCOUNT);
    expect(resolveNewUserStep("user-1", null)).toBe(NewUserStep.AFFILIATIONS);
    expect(resolveNewUserStep("user-1", NewUserStep.DONE)).toBe(NewUserStep.DONE);
    expect(resolveNewUserStep("user-1", "unknown")).toBe(NewUserStep.AFFILIATIONS);
  });
});

describe("email validation", () => {
  it("accepts the sample-user format and rejects malformed addresses", () => {
    expect(normalizeEmail("  U1@U.C ")).toBe("u1@u.c");
    expect(isValidEmail("u1@u.c")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
  });
});
