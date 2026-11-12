import { cn } from "@/lib/utils/cn";
import { controlClassName } from "./control-style";
import type { TextareaHTMLAttributes } from "react";

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export function TextArea({ invalid = false, className, rows = 3, ...props }: TextAreaProps) {
  return <textarea rows={rows} {...props} className={controlClassName(invalid, cn("resize-y py-2.5 leading-relaxed", className))} />;
}
