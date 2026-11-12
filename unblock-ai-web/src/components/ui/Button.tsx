"use client";
import { Icon } from "@/components/ui/icons/Icon";
import { buttonClassName, type ButtonSize, type ButtonVariant } from "./button-style";
import type { IconName } from "@/types/icon";
import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: IconName;
  children: ReactNode;
}

export function Button({ variant = "primary", size = "md", leadingIcon, className, children, ...props }: ButtonProps) {
  return (
    <button {...props} className={buttonClassName(variant, size, className)}>
      {leadingIcon && <Icon name={leadingIcon} className="h-4 w-4" />}
      {children}
    </button>
  );
}
