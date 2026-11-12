import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { UserDetailScreen } from "@/components/users/detail/UserDetailScreen";
import { usersApi } from "@/lib/api/users";
import { requireRouteAccess } from "@/lib/auth/session";
import { dashboardPageMetadata } from "@/lib/navigation/page-metadata";
import { RoutePath } from "@/lib/routing/route-path";
import { isUuid } from "@/lib/utils/identifier";

export async function generateMetadata({ params }: PageProps<"/dashboard/users/[userId]">): Promise<Metadata> {
  const { userId } = await params;
  if (!isUuid(userId)) return dashboardPageMetadata(RoutePath.USERS);
  try {
    const { user } = await usersApi.get(userId);
    return { title: user.full_name, description: user.email };
  } catch {
    return dashboardPageMetadata(RoutePath.USERS);
  }
}

export default async function UserDetailPage({ params }: PageProps<"/dashboard/users/[userId]">) {
  const { userId } = await params;
  if (!isUuid(userId)) notFound();
  await requireRouteAccess(RoutePath.USERS);
  return <UserDetailScreen userId={userId} />;
}
