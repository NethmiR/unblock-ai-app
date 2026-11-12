import { cn } from "@/lib/utils/cn";
import { controlClassName } from "./control-style";
import type { InputHTMLAttributes } from "react";

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export function TextInput({ invalid = false, className, ...props }: TextInputProps) {
  return <input type="text" {...props} className={controlClassName(invalid, cn("h-10", className))} />;
}
