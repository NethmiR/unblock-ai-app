import type { Request, Response } from "express";
import { ORGANISATIONAL_UNIT_TYPES } from "../data/constants/organisational-unit.constant.js";
import { requireAuthContext } from "../utils/http/auth-context.util.js";
import {
  optionalNonEmptyString,
  optionalNullableString,
  optionalNullableUuid,
  parseBooleanQuery,
  parseOptionalOneOfQuery,
  parseOptionalUuidQuery,
  requireNonEmptyString,
  requireOneOf,
  requireUuid,
} from "../utils/http/request-validator.util.js";
import { serializeOrganisationalUnitSummary } from "../utils/http/organisational-unit-serializer.util.js";
import type { OrganisationalUnitService } from "../services/organisational-unit.service.js";

export interface OrganisationalUnitControllerOptions {
  organisationalUnitService: OrganisationalUnitService;
}

export class OrganisationalUnitController {
  private readonly organisationalUnitService: OrganisationalUnitService;

  constructor({ organisationalUnitService }: OrganisationalUnitControllerOptions) {
    this.organisationalUnitService = organisationalUnitService;
  }

  list = async (req: Request, res: Response): Promise<void> => {
    const units = await this.organisationalUnitService.list({
      unitType: parseOptionalOneOfQuery(req.query.unit_type, "unit_type", ORGANISATIONAL_UNIT_TYPES),
      parentId: parseOptionalUuidQuery(req.query.parent_id, "parent_id"),
      rootOnly: parseBooleanQuery(req.query.root_only, "root_only"),
      includeArchived: parseBooleanQuery(req.query.include_archived, "include_archived"),
    });
    res.status(200).json({ organisational_units: units.map(serializeOrganisationalUnitSummary) });
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const unit = await this.organisationalUnitService.getById(requireUuid(req.params.unitId, "unitId"));
    res.status(200).json({ organisational_unit: serializeOrganisationalUnitSummary(unit) });
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const unit = await this.organisationalUnitService.create(
      {
        code: requireNonEmptyString(req.body, "code"),
        name: requireNonEmptyString(req.body, "name"),
        unitType: requireOneOf(req.body, "unit_type", ORGANISATIONAL_UNIT_TYPES),
        parentId: optionalNullableUuid(req.body, "parent_id") ?? null,
        description: optionalNullableString(req.body, "description") ?? null,
      },
      requireAuthContext(req).user.id,
    );
    res.status(201).json({ organisational_unit: serializeOrganisationalUnitSummary(unit) });
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const unit = await this.organisationalUnitService.update(requireUuid(req.params.unitId, "unitId"), {
      name: optionalNonEmptyString(req.body, "name"),
      parentId: optionalNullableUuid(req.body, "parent_id"),
      description: optionalNullableString(req.body, "description"),
    });
    res.status(200).json({ organisational_unit: serializeOrganisationalUnitSummary(unit) });
  };

  archive = async (req: Request, res: Response): Promise<void> => {
    const unit = await this.organisationalUnitService.archive(requireUuid(req.params.unitId, "unitId"));
    res.status(200).json({ organisational_unit: serializeOrganisationalUnitSummary(unit) });
  };

  restore = async (req: Request, res: Response): Promise<void> => {
    const unit = await this.organisationalUnitService.restore(requireUuid(req.params.unitId, "unitId"));
    res.status(200).json({ organisational_unit: serializeOrganisationalUnitSummary(unit) });
  };

  delete = async (req: Request, res: Response): Promise<void> => {
    await this.organisationalUnitService.delete(requireUuid(req.params.unitId, "unitId"));
    res.status(204).send();
  };
}
