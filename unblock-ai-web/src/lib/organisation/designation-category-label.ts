import { DesignationCategory } from "@/types/designation";

export const DESIGNATION_CATEGORY_LABELS: Record<DesignationCategory, string> = {
  [DesignationCategory.LEADERSHIP]: "Leadership",
  [DesignationCategory.ACADEMIC]: "Academic",
  [DesignationCategory.ACADEMIC_SUPPORT]: "Academic support",
  [DesignationCategory.ADMINISTRATIVE]: "Administrative",
  [DesignationCategory.NON_ACADEMIC]: "Non-academic",
  [DesignationCategory.STUDENT]: "Student",
};
