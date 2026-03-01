import { useState, useMemo } from "react";
import { useEpics } from "@/hooks/queries/use-epics";
import { useCurrentUser } from "@/hooks/queries/use-current-user";
import { Button } from "@/components/ui/button";
import { EpicForm } from "@/components/epics/epic-form";
import { EpicCard } from "@/components/epics/epic-card";
import { TeamSection } from "@/components/epics/team-section";
import { EpicsScopeFilter } from "@/components/epics/epics-scope-filter";
import type { ScopeMode } from "@/components/common/scope-selector";
import { Plus, Filter, Check, Folder } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Epic } from "@/lib/api/types";
import type { EpicFilters } from "@/lib/api/epics";

/**
 * Groups epics by team ID (stable identifier) and sorts groups alphabetically by team name.
 * Epics without a team are grouped under a "no-team" key.
 */
function groupEpicsByTeam(epics: Epic[]): Map<string, { team: Epic['team']; epics: Epic[] }> {
  const grouped = new Map<string, { team: Epic['team']; epics: Epic[] }>();

  epics.forEach((epic) => {
    const teamKey = epic.team?.id ?? "no-team";
    if (!grouped.has(teamKey)) {
      grouped.set(teamKey, { team: epic.team, epics: [] });
    }
    grouped.get(teamKey)!.epics.push(epic);
  });

  return new Map(
    [...grouped.entries()].sort((a, b) => {
      const aName = a[1].team?.name ?? "No Team";
      const bName = b[1].team?.name ?? "No Team";
      return aName.localeCompare(bName);
    })
  );
}

export function EpicsPage() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed'>('all');
  
  // Initialize scope from localStorage with 'my' as default for first-time users
  const [scope, setScope] = useState<ScopeMode>(() => {
    const stored = localStorage.getItem('epicsScope');
    return (stored as ScopeMode) || 'my';
  });
  
  const [scopeId, setScopeId] = useState<string | undefined>(() => {
    const stored = localStorage.getItem('epicsScopeId');
    return stored || undefined;
  });
  
  const { data: currentUserData } = useCurrentUser();
  const currentUser = currentUserData?.data;
  
  const handleScopeChange = (newScope: ScopeMode, newScopeId?: string) => {
    setScope(newScope);
    setScopeId(newScopeId);
    
    // Persist to localStorage
    localStorage.setItem('epicsScope', newScope);
    localStorage.setItem('epicsScopeId', newScopeId || '');
  };
  
  // Build filter parameters based on scope
  const epicFilters = useMemo(() => {
    const filters: EpicFilters = {
      includeArchived: showArchived,
    };

    if (scope === 'my' && currentUser?.id) {
      filters.createdBy = currentUser.id;
    } else if (scope === 'team' && scopeId) {
      filters.teamId = scopeId;
    } else if (scope === 'user' && scopeId) {
      filters.createdBy = scopeId;
    }

    if (statusFilter !== 'all') {
      filters.status = statusFilter;
    }

    return filters;
  }, [scope, scopeId, showArchived, currentUser?.id, statusFilter]);
  
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useEpics(epicFilters);

  const epics = data?.pages.flatMap((page) => page.data) ?? [];
  
  // Group epics by team with memoization for performance
  const groupedEpics = useMemo(() => groupEpicsByTeam(epics), [epics]);

  return (
    <div className="p-4 max-w-screen-2xl mx-auto sm:p-6">
      <div className="flex items-center justify-between mb-6 gap-3 sm:mb-8">
        <h1 className="text-2xl font-bold sm:text-3xl">Epics</h1>
        <div className="flex items-center gap-2">
          <EpicsScopeFilter
            scope={scope}
            {...(scopeId !== undefined && { scopeId })}
            onScopeChange={handleScopeChange}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Filter className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">
                  {statusFilter === 'completed' ? 'Completed' : statusFilter === 'active' ? 'Active' : showArchived ? 'All' : 'Active'}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { setStatusFilter('all'); setShowArchived(false); }}>
                <Check className={`h-4 w-4 mr-2 ${statusFilter === 'all' && !showArchived ? "opacity-100" : "opacity-0"}`} />
                Active epics
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setStatusFilter('completed'); setShowArchived(false); }}>
                <Check className={`h-4 w-4 mr-2 ${statusFilter === 'completed' ? "opacity-100" : "opacity-0"}`} />
                Completed epics
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setStatusFilter('all'); setShowArchived(false); }}>
                <Check className={`h-4 w-4 mr-2 ${statusFilter === 'all' && !showArchived ? "opacity-100" : "opacity-0"}`} />
                All statuses
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowArchived(!showArchived)}>
                <Check className={`h-4 w-4 mr-2 ${showArchived ? "opacity-100" : "opacity-0"}`} />
                Include archived
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {import.meta.env.VITE_SHOW_CREATION_FORMS === 'true' && (
            <Button onClick={() => setIsFormOpen(true)}>
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">New Epic</span>
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-lg bg-muted"
            />
          ))}
        </div>
      ) : epics.length === 0 ? (
        <div className="text-center py-12">
          <div className="flex justify-center mb-4">
            <Folder className="h-16 w-16 text-muted-foreground/50" />
          </div>
          <p className="text-muted-foreground mb-4">
            {scope !== 'all' 
              ? "No epics found for this filter. Try changing your filter selection or creating a new epic."
              : showArchived ? "No epics found" : "No epics yet"}
          </p>
          {import.meta.env.VITE_SHOW_CREATION_FORMS === 'true' && (
            <Button onClick={() => setIsFormOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {scope !== 'all' ? "Create Epic" : "Create your first epic"}
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-6 sm:space-y-8">
            {Array.from(groupedEpics.entries()).map(([teamKey, { team, epics: teamEpics }]) => (
              <TeamSection 
                key={teamKey} 
                teamName={team?.name ?? "No Team"} 
                epicCount={teamEpics.length}
              >
                {teamEpics.map((epic) => (
                  <EpicCard key={epic.id} epic={epic} />
                ))}
              </TeamSection>
            ))}
          </div>
          {hasNextPage && (
            <div className="mt-6 text-center sm:mt-8">
              <Button
                variant="outline"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? "Loading..." : "Load more"}
              </Button>
            </div>
          )}
        </>
      )}

      {import.meta.env.VITE_SHOW_CREATION_FORMS === 'true' && (
        <EpicForm open={isFormOpen} onOpenChange={setIsFormOpen} />
      )}
    </div>
  );
}
