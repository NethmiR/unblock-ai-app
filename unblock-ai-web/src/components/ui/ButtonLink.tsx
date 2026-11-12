import Link from "next/link";
import { Icon } from "@/components/ui/icons/Icon";
import { buttonClassName, type ButtonSize, type ButtonVariant } from "./button-style";
import type { IconName } from "@/types/icon";
import type { ReactNode } from "react";

interface ButtonLinkProps {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: IconName;
  className?: string;
  children: ReactNode;
}

export function ButtonLink({ href, variant = "primary", size = "md", leadingIcon, className, children }: ButtonLinkProps) {
  return (
    <Link href={href} className={buttonClassName(variant, size, className)}>
      {leadingIcon && <Icon name={leadingIcon} className="h-4 w-4" />}
      {children}
    </Link>
  );
}
