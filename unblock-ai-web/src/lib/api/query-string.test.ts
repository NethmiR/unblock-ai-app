import { describe, expect, it } from "vitest";
import { withQuery } from "./query-string";

describe("withQuery", () => {
  it("omits empty, null, undefined and false values and encodes the rest", () => {
    expect(withQuery("/users", { search: "a&b", limit: 25, offset: 0, include_archived: false, unit: null, other: undefined })).toBe(
      "/users?search=a%26b&limit=25&offset=0",
    );
  });

  it("returns the bare path when nothing remains", () => {
    expect(withQuery("/designations", { include_archived: false })).toBe("/designations");
  });
});
