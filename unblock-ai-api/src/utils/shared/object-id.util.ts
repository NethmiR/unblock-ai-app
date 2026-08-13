import { ObjectId } from "mongodb";
import { ValidationError } from "../../errors/validation.error.js";

export function toObjectId(id: string | ObjectId): ObjectId {
  if (id instanceof ObjectId) return id;
  if (!ObjectId.isValid(id)) {
    throw new ValidationError(`'${id}' is not a valid id`);
  }
  return new ObjectId(id);
}

export function toIdString(id: ObjectId | string | null): string | null {
  if (id === null) return null;
  return String(id);
}
