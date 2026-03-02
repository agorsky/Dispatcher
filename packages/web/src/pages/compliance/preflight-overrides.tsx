import { Link } from "react-router-dom";
import { usePreflightOverrides } from "@/hooks/queries/use-preflight";
import { format } from "date-fns";
import type { PreflightOverride } from "@/lib/api/types";

export function PreflightOverridesPage() {
  const { data, isLoading, isError } = usePreflightOverrides();
  const overrides = data?.data ?? [];

  if (isLoading) {
    return (
      <div className="space-y-2 mt-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded bg-muted" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-sm text-destructive mt-4">
        Failed to load pre-flight overrides.
      </p>
    );
  }

  if (overrides.length === 0) {
    return (
      <p className="text-sm text-muted-foreground mt-4">
        No pre-flight overrides recorded yet.
      </p>
    );
  }

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">Epic</th>
            <th className="pb-2 pr-4 font-medium">User</th>
            <th className="pb-2 pr-4 font-medium">Reason</th>
            <th className="pb-2 pr-4 font-medium">Issues Overridden</th>
            <th className="pb-2 font-medium whitespace-nowrap">Date</th>
          </tr>
        </thead>
        <tbody>
          {overrides.map((override: PreflightOverride) => {
            let issues: string[] = [];
            try {
              issues = JSON.parse(override.overriddenIssues) as string[];
            } catch {
              issues = [override.overriddenIssues];
            }

            return (
              <tr key={override.id} className="border-b hover:bg-muted/30 transition-colors">
                <td className="py-2 pr-4">
                  {override.epic ? (
                    <Link
                      to={`/epics/${override.epicId}`}
                      className="text-primary hover:underline font-medium"
                    >
                      {override.epic.identifier && (
                        <span className="font-mono text-xs text-muted-foreground mr-1.5">
                          {override.epic.identifier}
                        </span>
                      )}
                      {override.epic.name}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground font-mono text-xs">
                      {override.epicId.slice(0, 8)}…
                    </span>
                  )}
                </td>
                <td className="py-2 pr-4 text-muted-foreground">
                  {override.user?.name ?? override.userId.slice(0, 8)}
                </td>
                <td className="py-2 pr-4 max-w-[240px]">
                  <span className="line-clamp-2" title={override.reason}>
                    {override.reason}
                  </span>
                </td>
                <td className="py-2 pr-4 text-muted-foreground">
                  {issues.join(", ")}
                </td>
                <td className="py-2 whitespace-nowrap text-muted-foreground">
                  {format(new Date(override.createdAt), "MMM d, yyyy HH:mm")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
