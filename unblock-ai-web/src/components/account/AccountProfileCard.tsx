import { Card } from "@/components/ui/Card";

interface AccountProfileCardProps {
  fullName: string;
  email: string;
  initials: string;
}

export function AccountProfileCard({ fullName, email, initials }: AccountProfileCardProps) {
  return (
    <Card className="flex items-center gap-4 p-6">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ink text-[15px] font-semibold text-white">
        {initials}
      </div>
      <div className="min-w-0">
        <h1 className="truncate text-[17px] font-bold tracking-tight">{fullName}</h1>
        <p className="truncate text-[13px] text-muted">{email}</p>
      </div>
    </Card>
  );
}
