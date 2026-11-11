import test from "node:test";
import assert from "node:assert/strict";
import { EmbeddingService } from "../../../src/services/embedding.service.js";
import { EmbeddingError } from "../../../src/errors/embedding.error.js";
import type { IEmbeddingAdapter } from "../../../src/services/embedding-adapter/embedding-adapter.interface.js";
import { EmbeddingPurpose } from "../../../src/data/constants/embedding.constant.js";

function fakeEmbeddingAdapter(
  embed: (text: string, purpose: EmbeddingPurpose) => Promise<number[]>,
): IEmbeddingAdapter {
  return { modelName: "fake-embedding-model", embed };
}

test("vectors are L2-normalised", async () => {
  const service = new EmbeddingService({
    embeddingAdapter: fakeEmbeddingAdapter(() => Promise.resolve([3, 4])),
    dimensions: 2,
  });

  assert.deepEqual(await service.embedQuery("hello"), [0.6, 0.8]);
});

test("documents and queries are embedded with their own purpose", async () => {
  const purposes: EmbeddingPurpose[] = [];
  const service = new EmbeddingService({
    embeddingAdapter: fakeEmbeddingAdapter((_text, purpose) => {
      purposes.push(purpose);
      return Promise.resolve([1, 0]);
    }),
    dimensions: 2,
  });

  await service.embedDocument("a template");
  await service.embedQuery("a question");

  assert.deepEqual(purposes, [EmbeddingPurpose.DOCUMENT, EmbeddingPurpose.QUERY]);
});

test("a vector with unexpected dimensions is rejected", async () => {
  const service = new EmbeddingService({
    embeddingAdapter: fakeEmbeddingAdapter(() => Promise.resolve([1, 0, 0])),
    dimensions: 2,
  });

  await assert.rejects(() => service.embedQuery("hello"), /Expected 2 dimensions, got 3/);
});

test("empty text is rejected without calling the provider", async () => {
  let called = false;
  const service = new EmbeddingService({
    embeddingAdapter: fakeEmbeddingAdapter(() => {
      called = true;
      return Promise.resolve([1, 0]);
    }),
    dimensions: 2,
  });

  await assert.rejects(() => service.embedQuery("   "), EmbeddingError);
  assert.equal(called, false);
});

test("provider failures surface as EmbeddingError", async () => {
  const service = new EmbeddingService({
    embeddingAdapter: fakeEmbeddingAdapter(() => Promise.reject(new Error("429 rate limited"))),
    dimensions: 2,
  });

  await assert.rejects(
    () => service.embedQuery("hello"),
    (err: unknown) => err instanceof EmbeddingError && /429 rate limited/.test(err.message),
  );
});

test("metadata reports the adapter's model name and the configured dimensions", () => {
  const service = new EmbeddingService({
    embeddingAdapter: fakeEmbeddingAdapter(() => Promise.resolve([1, 0])),
    dimensions: 2,
  });

  const metadata = service.metadata();

  assert.equal(metadata.model, "fake-embedding-model");
  assert.equal(metadata.dim, 2);
});
