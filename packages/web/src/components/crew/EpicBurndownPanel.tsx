import { useState } from 'react';
import { useEpics } from '@/hooks/queries/use-epics';
import { useFeatures } from '@/hooks/queries/use-features';
import { useTasks } from '@/hooks/queries/use-tasks';
import { TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export function EpicBurndownPanel() {
  const { data: epicsData, isLoading: epicsLoading } = useEpics();
  const epics = epicsData?.pages.flatMap((p) => p.data) ?? [];

  const [selectedEpicId, setSelectedEpicId] = useState<string>('');

  const epicId = selectedEpicId || epics[0]?.id || '';

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

  if (epicsLoading) {
    return (
      <div className="space-y-4 pt-4">
        <div className="h-10 w-48 rounded border bg-muted/50 animate-pulse" />
        <div className="h-48 rounded-lg border bg-muted/50 animate-pulse" />
      </div>
    );
  }

  if (epics.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <TrendingDown className="h-10 w-10 text-muted-foreground/50 mb-3" />
        <p className="text-sm text-muted-foreground">No epics found</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-4">
      {/* Epic Selector */}
      <select
        value={epicId}
        onChange={(e) => setSelectedEpicId(e.target.value)}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
      >
        {epics.map((epic) => (
          <option key={epic.id} value={epic.id}>
            {epic.name}
          </option>
        ))}
      </select>

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
    </div>
  );
}
