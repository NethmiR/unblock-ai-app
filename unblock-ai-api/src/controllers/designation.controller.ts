import type { Request, Response } from "express";
import { DESIGNATION_CATEGORIES } from "../data/constants/designation.constant.js";
import { ORGANISATIONAL_UNIT_TYPES } from "../data/constants/organisational-unit.constant.js";
import { requireAuthContext } from "../utils/http/auth-context.util.js";
import {
  optionalBoolean,
  optionalInteger,
  optionalNonEmptyString,
  optionalOneOf,
  optionalOneOfArray,
  parseBooleanQuery,
  requireBoolean,
  requireInteger,
  requireNonEmptyString,
  requireOneOf,
  requireOneOfArray,
  requireUuid,
} from "../utils/http/request-validator.util.js";
import { serializeDesignationSummary } from "../utils/http/designation-serializer.util.js";
import type { DesignationService } from "../services/designation.service.js";

export interface DesignationControllerOptions {
  designationService: DesignationService;
}

export class DesignationController {
  private readonly designationService: DesignationService;

  constructor({ designationService }: DesignationControllerOptions) {
    this.designationService = designationService;
  }

  list = async (req: Request, res: Response): Promise<void> => {
    const designations = await this.designationService.list(parseBooleanQuery(req.query.include_archived, "include_archived"));
    res.status(200).json({ designations: designations.map(serializeDesignationSummary) });
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const designation = await this.designationService.getById(requireUuid(req.params.designationId, "designationId"));
    res.status(200).json({ designation: serializeDesignationSummary(designation) });
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const designation = await this.designationService.create(
      {
        code: requireNonEmptyString(req.body, "code"),
        title: requireNonEmptyString(req.body, "title"),
        category: requireOneOf(req.body, "category", DESIGNATION_CATEGORIES),
        applicableUnitTypes: requireOneOfArray(req.body, "applicable_unit_types", ORGANISATIONAL_UNIT_TYPES),
        singleHolderPerUnit: requireBoolean(req.body, "single_holder_per_unit"),
        displayOrder: requireInteger(req.body, "display_order"),
      },
      requireAuthContext(req).user.id,
    );
    res.status(201).json({ designation: serializeDesignationSummary(designation) });
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const designation = await this.designationService.update(requireUuid(req.params.designationId, "designationId"), {
      title: optionalNonEmptyString(req.body, "title"),
      category: optionalOneOf(req.body, "category", DESIGNATION_CATEGORIES),
      applicableUnitTypes: optionalOneOfArray(req.body, "applicable_unit_types", ORGANISATIONAL_UNIT_TYPES),
      singleHolderPerUnit: optionalBoolean(req.body, "single_holder_per_unit"),
      displayOrder: optionalInteger(req.body, "display_order"),
    });
    res.status(200).json({ designation: serializeDesignationSummary(designation) });
  };

  archive = async (req: Request, res: Response): Promise<void> => {
    const designation = await this.designationService.archive(requireUuid(req.params.designationId, "designationId"));
    res.status(200).json({ designation: serializeDesignationSummary(designation) });
  };

  restore = async (req: Request, res: Response): Promise<void> => {
    const designation = await this.designationService.restore(requireUuid(req.params.designationId, "designationId"));
    res.status(200).json({ designation: serializeDesignationSummary(designation) });
  };

  delete = async (req: Request, res: Response): Promise<void> => {
    await this.designationService.delete(requireUuid(req.params.designationId, "designationId"));
    res.status(204).send();
  };
}
