import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PreflightCheckResult } from "@/lib/api/types";

interface PreflightDetailPanelProps {
  checks: PreflightCheckResult[];
  onOverride: () => void;
  onDismiss: () => void;
}

export function PreflightDetailPanel({ checks, onOverride, onDismiss }: PreflightDetailPanelProps) {
  const failedChecks = checks.filter((c) => !c.passed);

  return (
    <Card className="mt-2 border-red-200 dark:border-red-800">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertTriangle className="h-4 w-4" />
            Pre-Flight Check Failed ({failedChecks.length} issue{failedChecks.length !== 1 ? "s" : ""})
          </CardTitle>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onDismiss}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {failedChecks.map((check) => (
          <div key={check.checkName} className="space-y-1">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <span>{check.checkName}</span>
            </div>
            <p className="text-xs text-muted-foreground pl-5">{check.details}</p>
            {check.items && check.items.length > 0 && (
              <ul className="pl-5 space-y-0.5">
                {check.items.map((item, i) => (
                  <li key={i} className="text-xs text-muted-foreground">
                    <span className="font-mono text-foreground">{item.identifier}</span>
                    {" — "}
                    {item.issue}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        <div className="flex gap-2 pt-2 border-t">
          <Button
            size="sm"
            variant="destructive"
            onClick={onOverride}
            className="flex-1"
          >
            Override & Continue
          </Button>
          <Button size="sm" variant="outline" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
