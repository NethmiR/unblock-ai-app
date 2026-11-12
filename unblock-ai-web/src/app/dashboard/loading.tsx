import { Spinner } from "@/components/ui/Spinner";

/** Shown inside the dashboard's `<main>` slot while a page segment loads; the shell stays put. */
export default function DashboardLoading() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Spinner />
    </div>
  );
}
