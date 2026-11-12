import { compareText } from "../shared/text.util.js";
import type { DesignationReference } from "../../lib/types/designation/designation.type.js";

export function compareDesignations(a: DesignationReference, b: DesignationReference): number {
  return a.displayOrder - b.displayOrder || compareText(a.title, b.title);
}
