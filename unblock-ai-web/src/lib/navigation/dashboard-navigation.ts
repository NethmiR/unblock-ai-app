import { IconName } from "@/types/icon";
import { Permission } from "@/types/permission";
import { RoutePath } from "@/lib/routing/route-path";
import type { NavGroup, NavItem } from "@/types/navigation";

/**
 * The sidebar, as data: one group per backend `Permission`, in display order.
 *
 * `satisfies Record<Permission, NavGroup>` means a permission added to the
 * backend (and mirrored in `types/permission.ts`) fails to compile until it
 * is given a group here - the sidebar can never silently drift from the API.
 */
export const DASHBOARD_NAVIGATION = {
  [Permission.TASK_CREATE]: {
    permission: Permission.TASK_CREATE,
    label: "Task Requests",
    icon: IconName.TASKS,
    items: [
      {
        label: "Create new",
        href: RoutePath.TASKS_NEW,
        icon: IconName.CREATE,
        title: "New Task Request",
        description: "Describe what you need and start a new request.",
      },
      {
        label: "View existing",
        href: RoutePath.TASKS,
        icon: IconName.LIST,
        title: "Task Requests",
        description: "Track the progress of the requests you have submitted.",
      },
    ],
  },
  [Permission.TASK_APPROVE]: {
    permission: Permission.TASK_APPROVE,
    label: "Approvals",
    icon: IconName.APPROVALS,
    items: [
      {
        label: "Pending",
        href: RoutePath.APPROVALS,
        icon: IconName.INBOX,
        title: "Pending Approvals",
        description: "Requests waiting for your decision.",
      },
      {
        label: "History",
        href: RoutePath.APPROVALS_HISTORY,
        icon: IconName.HISTORY,
        title: "Approval History",
        description: "Decisions you have already made.",
      },
    ],
  },
  [Permission.WORKFLOW_MANAGE]: {
    permission: Permission.WORKFLOW_MANAGE,
    label: "Workflows",
    icon: IconName.WORKFLOWS,
    items: [
      {
        label: "Create new",
        href: RoutePath.WORKFLOWS_NEW,
        icon: IconName.CREATE,
        title: "New Workflow Template",
        description: "Describe a process in plain English and generate a workflow template from it.",
      },
      {
        label: "View existing",
        href: RoutePath.WORKFLOWS,
        icon: IconName.LIST,
        title: "Workflow Templates",
        description: "Review, update, publish and archive workflow templates.",
      },
    ],
  },
  [Permission.USER_MANAGE]: {
    permission: Permission.USER_MANAGE,
    label: "Users",
    icon: IconName.USERS,
    items: [
      {
        label: "Create new",
        href: RoutePath.USERS_NEW,
        icon: IconName.CREATE,
        title: "New User",
        description: "Add a user and choose the functions they can access.",
      },
      {
        label: "View existing",
        href: RoutePath.USERS,
        icon: IconName.LIST,
        title: "Users",
        description: "Manage user accounts, their access and affiliations.",
      },
    ],
  },
  [Permission.ORGANISATION_MANAGE]: {
    permission: Permission.ORGANISATION_MANAGE,
    label: "Organisation",
    icon: IconName.ORGANISATION,
    items: [
      {
        label: "Faculties & departments",
        href: RoutePath.ORGANISATION_FACULTIES,
        icon: IconName.FACULTY,
        title: "Faculties & Departments",
        description: "Configure the university's faculties and their departments.",
      },
      {
        label: "Divisions",
        href: RoutePath.ORGANISATION_DIVISIONS,
        icon: IconName.DIVISION,
        title: "Divisions",
        description: "Configure administrative divisions, offices, centres and units.",
      },
      {
        label: "Designations",
        href: RoutePath.ORGANISATION_DESIGNATIONS,
        icon: IconName.DESIGNATION,
        title: "Designations",
        description: "Configure the designations people can hold within units.",
      },
    ],
  },
} as const satisfies Record<Permission, NavGroup>;

/** Links every signed-in user sees, regardless of permissions. */
export const ACCOUNT_NAVIGATION: readonly NavItem[] = [
  {
    label: "Profile",
    href: RoutePath.PROFILE,
    icon: IconName.PROFILE,
    title: "Profile",
    description: "Your account, affiliations, permissions and active sessions.",
  },
];

/** Where a user lands after sign-in when they are allowed to see it. */
export const PREFERRED_LANDING_ROUTE = RoutePath.TASKS;

/** Where a user lands when no permission-gated page is available to them. */
export const FALLBACK_LANDING_ROUTE = RoutePath.PROFILE;
