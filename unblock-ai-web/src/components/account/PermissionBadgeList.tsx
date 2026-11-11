import { Badge } from "@/components/ui/Badge";
import { PERMISSION_LABELS } from "@/lib/auth/permission-label";
import type { Permission } from "@/types/permission";

export function PermissionBadgeList({ permissions }: { permissions: Permission[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {permissions.map((permission) => (
        <li key={permission}>
          <Badge title={permission}>{PERMISSION_LABELS[permission]}</Badge>
        </li>
      ))}
    </ul>
  );
}
