import type { Request, Response } from "express";
import { requireAuthContext } from "../utils/http/auth-context.util.js";
import {
  parseIntegerQuery,
  parseOptionalStringQuery,
  parseOptionalUuidQuery,
  requireNonEmptyString,
  requireStringArray,
  requireUuid,
} from "../utils/http/request-validator.util.js";
import { serializeUser, serializeUserListResult } from "../utils/http/user-serializer.util.js";
import { USER_LIST_PAGINATION } from "../data/constants/user.constant.js";
import type { UserService } from "../services/user.service.js";

export interface UserControllerOptions {
  userService: UserService;
}

export class UserController {
  private readonly userService: UserService;

  constructor({ userService }: UserControllerOptions) {
    this.userService = userService;
  }

  create = async (req: Request, res: Response): Promise<void> => {
    const email = requireNonEmptyString(req.body, "email");
    const fullName = requireNonEmptyString(req.body, "full_name");
    const permissions = requireStringArray(req.body, "permissions");

    const user = await this.userService.createUser(
      { email, fullName, permissions },
      requireAuthContext(req).user.id,
    );
    res.status(201).json({ user: serializeUser(user) });
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const result = await this.userService.listUsers({
      search: parseOptionalStringQuery(req.query.search, "search"),
      organisationalUnitId: parseOptionalUuidQuery(req.query.organisational_unit_id, "organisational_unit_id"),
      limit: parseIntegerQuery(req.query.limit, "limit", USER_LIST_PAGINATION.DEFAULT_LIMIT),
      offset: parseIntegerQuery(req.query.offset, "offset", 0),
    });
    res.status(200).json(serializeUserListResult(result));
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const userId = requireUuid(req.params.userId, "userId");
    const user = await this.userService.getUserById(userId);
    res.status(200).json({ user: serializeUser(user) });
  };
}
