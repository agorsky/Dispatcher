import { useState } from 'react';
import { useUserActivity } from '@/hooks/queries/use-user-activity';
import type { ActivityInterval } from '@/lib/api/user-activity';
import { useEpicsCount } from '@/hooks/queries/use-epics';
import { useEpicRequestsCount } from '@/hooks/queries/use-epic-requests';
import { IntervalSelector } from '@/components/dashboard/interval-selector';
import { ActivityChart } from '@/components/dashboard/activity-chart';
import { ActivityTable } from '@/components/dashboard/activity-table';
import { ExportMenu } from '@/components/dashboard/export-menu';
import { MetricDetailSheet } from '@/components/dashboard/metric-detail-sheet';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';

export type MetricType = 'features' | 'tasks' | 'decisions' | 'sessions';

/**
 * Compute the date range (earliest start to latest end) from activity data points.
 * Returns null if data array is empty.
 */
export function computeDateRange(
  data: import('@/lib/api/user-activity').UserActivityDataPoint[]
): { startDate: string; endDate: string } | null {
  if (data.length === 0) return null;

  const dates = data.flatMap((d) => [
    new Date(d.intervalStart).getTime(),
    new Date(d.intervalEnd).getTime(),
  ]);

  const minDate = Math.min(...dates);
  const maxDate = Math.max(...dates);

  return {
    startDate: new Date(minDate).toISOString(),
    endDate: new Date(maxDate).toISOString(),
  };
}

export function DashboardPage() {
  const [interval, setInterval] = useState<ActivityInterval>('week');
  const [page, setPage] = useState(1);
  const [selectedMetric, setSelectedMetric] = useState<MetricType | null>(null);

  const { data: epicsCountData } = useEpicsCount();
  const { data: epicRequestsCountData } = useEpicRequestsCount();

  const { data, isLoading, isError, dataUpdatedAt, isFetching } = useUserActivity(
    interval,
    page,
    14,
    'all',
    undefined
  );

  const handleIntervalChange = (newInterval: ActivityInterval) => {
    setInterval(newInterval);
    setPage(1);
  };

  const handleMetricClick = (metric: MetricType, count: number) => {
    if (count === 0) return;
    setSelectedMetric(metric);
  };

  const handleCloseDrillDown = () => {
    setSelectedMetric(null);
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">Activity Dashboard</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-sm text-muted-foreground">
              Agent activity across epic requests, epics, features, tasks, decisions, and AI sessions
            </p>
            {dataUpdatedAt > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground/70">
                <RefreshCw className={`h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} />
                {new Date(dataUpdatedAt).toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {data && <ExportMenu data={data.data} interval={interval} />}
          <IntervalSelector value={interval} onChange={handleIntervalChange} />
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-4">
          <div className="h-64 rounded-lg border bg-muted/50 animate-pulse" />
          <div className="h-48 rounded-lg border bg-muted/50 animate-pulse" />
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center text-sm text-destructive">
          Failed to load activity data. Please try again.
        </div>
      )}

      {/* Content */}
      {data && !isLoading && (
        <>
          <SummaryCards
            epicsCount={epicsCountData ?? 0}
            epicRequestsCount={epicRequestsCountData ?? 0}
            data={data.data}
            onCardClick={handleMetricClick}
          />
          <ActivityChart data={data.data} interval={interval} />
          <ActivityTable data={data.data} interval={interval} />

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {data.page} of {Math.ceil(data.total / data.limit)}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Newer
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={!data.hasMore}
              >
                Older
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Metric Detail Sheet */}
      {selectedMetric && (
        <MetricDetailSheet
          metricType={selectedMetric}
          open={selectedMetric !== null}
          onOpenChange={(open) => !open && handleCloseDrillDown()}
          interval={interval}
          page={page}
          scope="all"
          timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}
        />
      )}
    </div>
  );
}

function SummaryCards({
  data,
  onCardClick,
  epicsCount,
  epicRequestsCount,
}: {
  data: import('@/lib/api/user-activity').UserActivityDataPoint[];
  onCardClick?: (metric: MetricType, count: number) => void;
  epicsCount: number;
  epicRequestsCount: number;
}) {
  const [hoveredCard, setHoveredCard] = useState<MetricType | null>(null);

  const totals = data.reduce(
    (acc, d) => ({
      features: acc.features + d.featuresCreated,
      tasks: acc.tasks + d.tasksCompleted,
      decisions: acc.decisions + d.decisionsLogged,
      sessions: acc.sessions + d.aiSessions,
    }),
    { features: 0, tasks: 0, decisions: 0, sessions: 0 }
  );

  const cards = [
    { label: 'Epic Requests', value: epicRequestsCount, color: 'text-orange-500', metric: null },
    { label: 'Epics Created', value: epicsCount, color: 'text-cyan-600', metric: null },
    { label: 'Features Created', value: totals.features, color: 'text-blue-600', metric: 'features' as MetricType },
    { label: 'Tasks Completed', value: totals.tasks, color: 'text-green-600', metric: 'tasks' as MetricType },
    { label: 'Decisions Logged', value: totals.decisions, color: 'text-amber-600', metric: 'decisions' as MetricType },
    { label: 'AI Sessions', value: totals.sessions, color: 'text-purple-600', metric: 'sessions' as MetricType },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map((card) => {
        const isClickable = card.metric !== null && card.value > 0;
        const isHovered = card.metric !== null && hoveredCard === card.metric;

        return (
          <div
            key={card.label}
            className={`rounded-lg border bg-card p-4 text-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              isClickable
                ? 'cursor-pointer hover:shadow-md hover:border-primary/50'
                : 'cursor-default'
            }`}
            onClick={() => isClickable && card.metric && onCardClick?.(card.metric, card.value)}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && isClickable && card.metric) {
                e.preventDefault();
                onCardClick?.(card.metric, card.value);
              }
            }}
            onMouseEnter={() => isClickable && card.metric && setHoveredCard(card.metric)}
            onMouseLeave={() => setHoveredCard(null)}
            role={isClickable ? 'button' : undefined}
            tabIndex={isClickable ? 0 : undefined}
          >
            <p className={`text-2xl font-bold tabular-nums ${card.color}`}>
              {card.value}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{card.label}</p>
            {isHovered && (
              <p className="text-xs text-primary mt-2 font-medium">
                View details →
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
