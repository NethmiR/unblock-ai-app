import { USER_MANAGEMENT_COPY } from "./user-management-copy";
import { UserStatus } from "@/types/user";

export const USER_LIST_PAGE_SIZE = 25;
export const VISIBLE_UNIT_CHIPS = 3;

type BadgeTone = "success" | "neutral";

export const USER_STATUS_BADGES: Record<UserStatus, { label: string; tone: BadgeTone }> = {
  [UserStatus.ACTIVE]: { label: USER_MANAGEMENT_COPY.status.active, tone: "success" },
  [UserStatus.DISABLED]: { label: USER_MANAGEMENT_COPY.status.disabled, tone: "neutral" },
};

export { parseOffset } from "@/lib/navigation/list-query-param";
