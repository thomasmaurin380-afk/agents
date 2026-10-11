import * as React from "react";
import { cn } from "@/lib/utils";

const field = [
  "flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-card sm:h-9",
  "transition-[border-color,box-shadow] duration-150 placeholder:text-subtle-foreground",
  "hover:border-border-strong focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/20",
  "disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60",
  "aria-invalid:border-destructive aria-invalid:ring-destructive/15",
].join(" ");

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(field, "py-1 file:mr-3 file:h-full file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-primary", className)}
      {...props}
    />
  );
}

export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return <select className={cn(field, "cursor-pointer py-1 pr-8", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(field, "h-auto min-h-20 py-2", className)} {...props} />;
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("text-[13px] font-medium leading-none text-foreground", className)} {...props} />;
}

export function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p role="alert" className="text-xs font-medium text-destructive-text">
      {messages.join(" · ")}
    </p>
  );
}
