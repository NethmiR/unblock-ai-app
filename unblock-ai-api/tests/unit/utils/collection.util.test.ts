import test from "node:test";
import assert from "node:assert/strict";
import { findDuplicates, uniqueValues } from "../../../src/utils/shared/collection.util.js";

test("findDuplicates reports each repeated value once", () => {
  assert.deepEqual(findDuplicates(["a", "b", "a", "c", "a", "b"]), ["a", "b"]);
});

test("findDuplicates returns an empty list when all values are distinct", () => {
  assert.deepEqual(findDuplicates(["a", "b", "c"]), []);
});

test("uniqueValues keeps first occurrence order", () => {
  assert.deepEqual(uniqueValues(["b", "a", "b", "c", "a"]), ["b", "a", "c"]);
});
