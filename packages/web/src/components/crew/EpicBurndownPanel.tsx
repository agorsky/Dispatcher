import { useState } from 'react';
import { useEpics } from '@/hooks/queries/use-epics';
import { useFeatures } from '@/hooks/queries/use-features';
import { useTasks } from '@/hooks/queries/use-tasks';
import { TrendingDown, Lock, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Epic } from '@/lib/api/types';

function parseDependencies(deps: string | null | undefined): string[] {
  if (!deps) return [];
  try {
    const parsed = JSON.parse(deps) as unknown;
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function getDependencyStatus(epic: Epic, allEpics: Epic[]): 'ready' | 'blocked' {
  const depIds = parseDependencies(epic.dependencies);
  if (depIds.length === 0) return 'ready';
  const blocked = depIds.some((depId) => {
    const dep = allEpics.find((e) => e.id === depId);
    return !dep || dep.status !== 'completed';
  });
  return blocked ? 'blocked' : 'ready';
}

export function EpicBurndownPanel() {
  const { data: epicsData, isLoading: epicsLoading } = useEpics();
  const epics = epicsData?.pages.flatMap((p) => p.data) ?? [];

  // Only show epics that are active or completed (not just planned/backlog)
  const allVisible = epics.filter(
    (e) => e.status === 'active' || e.status === 'completed'
  );

  // Dependency filter
  const [depFilter, setDepFilter] = useState<'all' | 'ready' | 'blocked'>('all');

  const visibleEpics = allVisible.filter((e) => {
    if (depFilter === 'all') return true;
    const status = getDependencyStatus(e, epics);
    return status === depFilter;
  });

  // Default to active epic first
  const defaultEpic =
    visibleEpics.find((e) => e.status === 'active') ?? visibleEpics[0];

  const [selectedEpicId, setSelectedEpicId] = useState<string>('');

  const epicId = selectedEpicId || defaultEpic?.id || '';

  const { data: featuresData, isLoading: featuresLoading } = useFeatures(
    epicId ? { epicId } : {}
  );
  const features = featuresData?.pages.flatMap((p) => p.data) ?? [];

  const { data: tasksData, isLoading: tasksLoading } = useTasks(
    epicId ? { epicId } : {}
  );
  const tasks = tasksData?.pages.flatMap((p) => p.data) ?? [];

  const isLoading = epicsLoading || featuresLoading || tasksLoading;

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(
    (t) => t.status?.category === 'completed'
  ).length;
  const inProgressTasks = tasks.filter(
    (t) => t.status?.category === 'started'
  ).length;

  // Selected epic's dependency status
  const selectedEpic = epics.find((e) => e.id === epicId);
  const selectedDepStatus = selectedEpic ? getDependencyStatus(selectedEpic, epics) : 'ready';

  if (epicsLoading) {
    return (
      <div className="space-y-4 pt-4 min-w-0 w-full overflow-hidden">
        <div className="h-10 w-48 rounded border bg-muted/50 animate-pulse" />
        <div className="h-48 rounded-lg border bg-muted/50 animate-pulse" />
      </div>
    );
  }

  if (allVisible.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <TrendingDown className="h-10 w-10 text-muted-foreground/50 mb-3" />
        <p className="text-sm text-muted-foreground">No active or completed epics</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-4 min-w-0 w-full overflow-hidden">
      {/* Dependency filter toggle */}
      <div className="flex items-center gap-1">
        {(['all', 'ready', 'blocked'] as const).map((f) => (
          <button
            key={f}
            onClick={() => {
              setDepFilter(f);
              setSelectedEpicId(''); // reset selection when filter changes
            }}
            className={cn(
              'px-2 py-1 rounded text-xs font-medium transition-colors',
              depFilter === f
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            {f === 'all' ? 'All' : f === 'ready' ? '✓ Ready' : '⚠ Blocked'}
          </button>
        ))}
        <span className="text-xs text-muted-foreground ml-1">({visibleEpics.length})</span>
      </div>

      {/* Epic Selector */}
      {visibleEpics.length === 0 ? (
        <p className="text-sm text-muted-foreground">No epics in this filter.</p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <select
              value={epicId}
              onChange={(e) => setSelectedEpicId(e.target.value)}
              className="flex-1 max-w-full min-w-0 rounded-md border bg-background px-3 py-2 text-sm overflow-hidden text-ellipsis"
            >
              {visibleEpics.map((epic) => {
                const dStatus = getDependencyStatus(epic, epics);
                return (
                  <option key={epic.id} value={epic.id}>
                    {dStatus === 'blocked' ? '⚠ ' : ''}{epic.name}{epic.status === 'active' ? ' 🔵' : ''}
                  </option>
                );
              })}
            </select>
            {/* Dependency status badge for selected epic */}
            {selectedDepStatus === 'blocked' ? (
              <span className="flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 dark:bg-amber-950 px-2 py-1 rounded-full shrink-0">
                <Lock className="h-3 w-3" />
                Blocked
              </span>
            ) : selectedEpic && parseDependencies(selectedEpic.dependencies).length > 0 ? (
              <span className="flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 dark:bg-green-950 px-2 py-1 rounded-full shrink-0">
                <CheckCircle2 className="h-3 w-3" />
                Ready
              </span>
            ) : null}
          </div>

          {isLoading ? (
            <div className="h-48 rounded-lg border bg-muted/50 animate-pulse" />
          ) : (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg border bg-card p-4 text-center">
                  <p className="text-2xl font-bold tabular-nums">{totalTasks}</p>
                  <p className="text-xs text-muted-foreground">Total Tasks</p>
                </div>
                <div className="rounded-lg border bg-card p-4 text-center">
                  <p className="text-2xl font-bold tabular-nums text-green-500">{completedTasks}</p>
                  <p className="text-xs text-muted-foreground">Completed</p>
                </div>
                <div className="rounded-lg border bg-card p-4 text-center">
                  <p className="text-2xl font-bold tabular-nums text-blue-500">{inProgressTasks}</p>
                  <p className="text-xs text-muted-foreground">In Progress</p>
                </div>
              </div>

              {/* Overall progress bar */}
              {totalTasks > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Overall Progress</span>
                    <span className="tabular-nums">
                      {Math.round((completedTasks / totalTasks) * 100)}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-green-500 transition-all"
                      style={{ width: `${(completedTasks / totalTasks) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Feature breakdown */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium">Features</h3>
                {features.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No features for this epic</p>
                ) : (
                  features.map((feature) => {
                    const featureTasks = tasks.filter((t) => t.featureId === feature.id);
                    const featureCompleted = featureTasks.filter(
                      (t) => t.status?.category === 'completed'
                    ).length;
                    const featureTotal = featureTasks.length;
                    const pct = featureTotal > 0 ? (featureCompleted / featureTotal) * 100 : 0;

                    return (
                      <div key={feature.id} className="rounded-lg border bg-card p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={cn(
                                'inline-block h-2 w-2 rounded-full',
                                feature.status?.category === 'completed'
                                  ? 'bg-green-500'
                                  : feature.status?.category === 'started'
                                    ? 'bg-blue-500'
                                    : 'bg-muted-foreground'
                              )}
                            />
                            <span className="text-sm font-medium truncate flex-1 min-w-0">{feature.title}</span>
                          </div>
                          <span className="text-xs text-muted-foreground tabular-nums shrink-0 ml-2">
                            {featureCompleted}/{featureTotal}
                          </span>
                        </div>
                        {featureTotal > 0 && (
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-green-500 transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
