import type * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "./theme";

export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative grid min-h-svh place-items-center bg-muted/40 px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-center gap-2 font-semibold">
          <span className="grid size-8 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
            DAF
          </span>
          Plateforme de pilotage financier
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{title}</CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </CardHeader>
          {children ? <CardContent>{children}</CardContent> : null}
        </Card>
      </div>
    </div>
  );
}
