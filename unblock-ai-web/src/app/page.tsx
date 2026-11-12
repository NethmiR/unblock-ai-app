import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { RoutePath } from "@/lib/routing/route-path";

export default async function Home() {
  const session = await getSession();
  redirect(session ? RoutePath.DASHBOARD : RoutePath.LOGIN);
}
