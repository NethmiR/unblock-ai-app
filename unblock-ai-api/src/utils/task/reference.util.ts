export function buildReference(seq: number, now = new Date()): string {
  const year = now.getFullYear();
  const padded = String(seq).padStart(5, "0");
  return `TASK-${year}-${padded}`;
}
