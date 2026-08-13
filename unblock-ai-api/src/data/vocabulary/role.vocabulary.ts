export const SUGGESTED_ROLES: Record<string, string[]> = {
  academic: [
    "academic_advisor",
    "supervisor",
    "head_of_department",
    "dean",
    "vice_chancellor",
    "registrar",
    "course_coordinator",
  ],
  administrative: ["faculty_office", "administration_office", "hr_office", "registrar_office"],
  financial: ["finance_office", "budget_officer", "procurement_office"],
  facilities: ["venue_admin", "hall_warden", "facilities_office", "maintenance_office"],
  security: ["security_office", "safety_officer"],
  it: ["it_support", "system_administrator"],
  generic: ["requester", "direct_manager", "department_head", "approver"],
};
