import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/client";
import { classifySubmitError } from "@/lib/utils/submit-error";

describe("classifySubmitError", () => {
  it("treats a 409 as terminal - the token is no longer actionable", () => {
    const result = classifySubmitError(new ApiError("Approval link has already been used.", 409));

    expect(result).toEqual({ kind: "terminal", message: "Approval link has already been used." });
  });

  it("treats a 400 as an inline, recoverable form error", () => {
    const result = classifySubmitError(new ApiError("A reason is required for outcome 'rejected'.", 400));

    expect(result).toEqual({ kind: "inline", message: "A reason is required for outcome 'rejected'." });
  });

  it("treats any other ApiError status as inline", () => {
    const result = classifySubmitError(new ApiError("Internal error.", 500));

    expect(result).toEqual({ kind: "inline", message: "Internal error." });
  });

  it("falls back to a generic inline message for a non-ApiError failure", () => {
    const result = classifySubmitError(new TypeError("network down"));

    expect(result).toEqual({
      kind: "inline",
      message: "Something went wrong submitting your decision. Please try again.",
    });
  });
});
