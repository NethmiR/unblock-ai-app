import type {
  CreateUserRecordInput,
  UserCredentialRecord,
  UserListFilter,
  UserListPage,
  UserRecord,
  UserReference,
} from "../../lib/types/user/user.type.js";

export interface IUserRepository {
  findById(id: string): Promise<UserRecord | null>;
  findReferencesByIds(ids: readonly string[]): Promise<UserReference[]>;
  findCredentialByEmail(email: string): Promise<UserCredentialRecord | null>;
  existsByEmail(email: string): Promise<boolean>;
  list(filter: UserListFilter): Promise<UserListPage>;
  create(input: CreateUserRecordInput): Promise<UserRecord>;
  recordSuccessfulLogin(id: string, at: Date): Promise<void>;
  recordFailedLogin(id: string, at: Date, failureWindowStart: Date): Promise<number>;
}
