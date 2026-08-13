import { ValidationError } from "../../errors/validation.error.js";

export function l2normalize(vector: number[]): number[] {
  let sumOfSquares = 0;
  for (const value of vector) sumOfSquares += value * value;

  const norm = Math.sqrt(sumOfSquares);
  if (norm === 0) return vector.slice();

  return vector.map((value) => value / norm);
}

export function dot(a: number[], b: number[]): number {
  let total = 0;
  for (let i = 0; i < a.length; i++) total += (a[i] as number) * (b[i] as number);
  return total;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new ValidationError(`Dimension mismatch: ${a.length} vs ${b.length}`);
  }
  return dot(a, b);
}
