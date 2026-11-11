import type { CreateUserRecordInput, UserCredentialRecord, UserRecord } from "../../lib/types/user/user.type.js";

export interface IUserRepository {
  findById(id: string): Promise<UserRecord | null>;
  findCredentialByEmail(email: string): Promise<UserCredentialRecord | null>;
  existsByEmail(email: string): Promise<boolean>;
  list(): Promise<UserRecord[]>;
  create(input: CreateUserRecordInput): Promise<UserRecord>;
  recordSuccessfulLogin(id: string, at: Date): Promise<void>;
  recordFailedLogin(id: string, at: Date, failureWindowStart: Date): Promise<number>;
}
