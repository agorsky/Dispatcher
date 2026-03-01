import { useState } from 'react';
import { useAgentScores, useScoreEvents, useScoreDelta7Day } from '@/hooks/queries/use-agent-scores';
import { useQuery } from '@tanstack/react-query';
import { lawsApi } from '@/lib/api/laws';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Trophy, Shield, ChevronDown, ChevronRight, TrendingUp, TrendingDown } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

// =============================================================================
// Agent-to-appliesTo mapping (mirrors caseService.ts AGENT_LAW_MAP)
// =============================================================================

const AGENT_APPLIES_TO: Record<string, string[]> = {
  tommy: ['tommy'],
  silvio: ['silvio'],
  sal: ['sal'],
  paulie: ['paulie'],
  henry: ['henry'],
  'the-claw-father': ['the-claw-father'],
  bobby: ['feature-worker', 'bobby'],
  barney: ['barney'],
  'the-judge': ['the-judge'],
  planner: ['planner'],
  orchestrator: ['orchestrator'],
};

// =============================================================================
// Helpers
// =============================================================================

function scoreColor(score: number): string {
  if (score >= 80) return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300';
  if (score >= 50) return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300';
  return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300';
}

function rankBadge(rank: number) {
  if (rank === 1) return 'text-amber-500';
  if (rank === 2) return 'text-slate-400';
  if (rank === 3) return 'text-amber-700';
  return 'text-muted-foreground';
}

// =============================================================================
// ScoreDeltaBadge — fetches and displays 7-day delta inline
// =============================================================================

function ScoreDeltaBadge({ agentName }: { agentName: string }) {
  const { data: delta, isLoading } = useScoreDelta7Day(agentName);

  if (isLoading || delta === undefined) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  if (delta === 0) {
    return <span className="text-xs text-muted-foreground">±0</span>;
  }

  if (delta > 0) {
    return (
      <span className="flex items-center gap-0.5 text-xs text-green-600 dark:text-green-400">
        <TrendingUp className="h-3 w-3" />
        +{delta}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-0.5 text-xs text-red-600 dark:text-red-400">
      <TrendingDown className="h-3 w-3" />
      {delta}
    </span>
  );
}

// =============================================================================
// MeritDeductionBreakdown — summarizes merit/deduction totals from events
// =============================================================================

function MeritDeductionBreakdown({ agentName }: { agentName: string }) {
  const { data: events, isLoading } = useScoreEvents(agentName, 50);

  if (isLoading || !events) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const merits = events.filter((e) => e.type === 'merit').reduce((s, e) => s + e.points, 0);
  const deductions = events.filter((e) => e.type === 'deduction').reduce((s, e) => s + e.points, 0);

  return (
    <div className="flex items-center gap-2 text-xs">
      {merits > 0 && (
        <span className="text-green-600 dark:text-green-400">+{merits}</span>
      )}
      {deductions < 0 && (
        <span className="text-red-600 dark:text-red-400">{deductions}</span>
      )}
      {merits === 0 && deductions === 0 && (
        <span className="text-muted-foreground">—</span>
      )}
    </div>
  );
}

// =============================================================================
// ApplicableLawsPanel — expandable row showing laws for an agent
// =============================================================================

function ApplicableLawsPanel({ agentName }: { agentName: string }) {
  const appliesToValues = AGENT_APPLIES_TO[agentName.toLowerCase()] ?? [agentName.toLowerCase()];
  const primaryAppliesTo = appliesToValues[0] ?? agentName.toLowerCase();

  const { data: lawsResp, isLoading } = useQuery({
    queryKey: ['laws', 'agent', agentName],
    queryFn: () => lawsApi.listByAgent(primaryAppliesTo),
    enabled: true,
  });

  if (isLoading) {
    return (
      <div className="px-4 py-3 text-xs text-muted-foreground">Loading applicable laws…</div>
    );
  }

  const laws = lawsResp?.data ?? [];

  if (laws.length === 0) {
    return (
      <div className="px-4 py-3 text-xs text-muted-foreground">No specific laws registered for this agent.</div>
    );
  }

  return (
    <div className="px-4 py-3 space-y-1.5 bg-muted/30 border-t">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
        Applicable Laws ({laws.length})
      </p>
      {laws.map((law) => (
        <div key={law.id} className="flex items-start gap-2 text-xs">
          <Badge
            variant="outline"
            className={cn(
              'shrink-0 text-[10px]',
              law.severity === 'critical' && 'border-red-400 text-red-600',
              law.severity === 'major' && 'border-amber-400 text-amber-600',
              law.severity === 'minor' && 'border-blue-400 text-blue-600'
            )}
          >
            {law.lawCode}
          </Badge>
          <span className="text-foreground">{law.title}</span>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// ScoreEventsPanel — expandable row showing score event history
// =============================================================================

function ScoreEventsPanel({ agentName }: { agentName: string }) {
  const { data: events, isLoading } = useScoreEvents(agentName, 10);

  if (isLoading) {
    return <div className="px-4 py-3 text-xs text-muted-foreground">Loading events…</div>;
  }

  if (!events || events.length === 0) {
    return <div className="px-4 py-3 text-xs text-muted-foreground">No score events recorded.</div>;
  }

  return (
    <div className="px-4 py-3 space-y-1 bg-muted/20 border-t">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
        Recent Score Events
      </p>
      {events.map((event) => (
        <div key={event.id} className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground truncate">{event.reason}</span>
          <span
            className={cn(
              'tabular-nums font-medium shrink-0',
              event.points > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            )}
          >
            {event.points > 0 ? `+${event.points}` : event.points}
          </span>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Main ScoresPage
// =============================================================================

export function ScoresPage() {
  const { data: scores, isLoading, isError } = useAgentScores();
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [expandMode, setExpandMode] = useState<'laws' | 'events'>('laws');

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center text-sm text-destructive">
        Failed to load agent scores. Please try again.
      </div>
    );
  }

  if (!scores || scores.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No agent scores recorded yet</p>
      </div>
    );
  }

  const isBarney = (name: string) => name.toLowerCase() === 'barney';

  function toggleExpand(agentName: string, mode: 'laws' | 'events') {
    if (expandedAgent === agentName && expandMode === mode) {
      setExpandedAgent(null);
    } else {
      setExpandedAgent(agentName);
      setExpandMode(mode);
    }
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left px-4 py-3 font-medium w-10"></th>
            <th className="text-left px-4 py-3 font-medium w-12">Rank</th>
            <th className="text-left px-4 py-3 font-medium">Agent</th>
            <th className="text-left px-4 py-3 font-medium">Title</th>
            <th className="text-left px-4 py-3 font-medium">Score</th>
            <th className="text-left px-4 py-3 font-medium">7d</th>
            <th className="text-left px-4 py-3 font-medium">Merit / Deductions</th>
            <th className="text-left px-4 py-3 font-medium">Busts Rcvd</th>
            <th className="text-left px-4 py-3 font-medium">Clean Cycles</th>
            <th className="text-left px-4 py-3 font-medium">Last Audit</th>
            <th className="text-left px-4 py-3 font-medium">Special</th>
          </tr>
        </thead>
        <tbody>
          {scores.map((agent, index) => {
            const isExpanded = expandedAgent === agent.agentName;
            const ChevronIcon = isExpanded ? ChevronDown : ChevronRight;

            return (
              <>
                <tr
                  key={agent.id}
                  className={cn(
                    'border-b transition-colors cursor-pointer select-none',
                    isBarney(agent.agentName)
                      ? 'bg-blue-50/50 dark:bg-blue-950/20 hover:bg-blue-50 dark:hover:bg-blue-950/30'
                      : 'hover:bg-accent/50'
                  )}
                  onClick={() => toggleExpand(agent.agentName, expandMode)}
                >
                  <td className="px-3 py-3">
                    <ChevronIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {index < 3 ? (
                        <Trophy className={cn('h-4 w-4', rankBadge(index + 1))} />
                      ) : (
                        <span className="text-muted-foreground pl-0.5">{index + 1}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {isBarney(agent.agentName) && (
                        <Shield className="h-4 w-4 text-blue-500" />
                      )}
                      <span className="font-medium">{agent.agentName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{agent.agentTitle}</td>
                  <td className="px-4 py-3">
                    <Badge className={cn('text-xs tabular-nums', scoreColor(agent.totalScore))}>
                      {agent.totalScore}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <ScoreDeltaBadge agentName={agent.agentName} />
                  </td>
                  <td className="px-4 py-3">
                    <MeritDeductionBreakdown agentName={agent.agentName} />
                  </td>
                  <td className="px-4 py-3 tabular-nums">{agent.bustsReceived}</td>
                  <td className="px-4 py-3 tabular-nums">{agent.cleanCycles}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {agent.lastAuditAt
                      ? formatDistanceToNow(new Date(agent.lastAuditAt), { addSuffix: true })
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {isBarney(agent.agentName) ? (
                      <div className="flex items-center gap-3 text-xs">
                        <span>
                          Convictions: <span className="font-medium">{agent.bustsIssued}</span>
                        </span>
                        {agent.falseBusts !== undefined && agent.falseBusts > 0 && (
                          <span className="text-destructive">
                            False busts: <span className="font-medium">{agent.falseBusts}</span>
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
                {isExpanded && (
                  <tr key={`${agent.id}-expanded`} className="border-b">
                    <td colSpan={11} className="p-0">
                      <div>
                        {/* Toggle tabs for laws vs events */}
                        <div className="flex border-b bg-muted/20">
                          <button
                            className={cn(
                              'px-4 py-2 text-xs font-medium transition-colors',
                              expandMode === 'laws'
                                ? 'border-b-2 border-primary text-primary'
                                : 'text-muted-foreground hover:text-foreground'
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandMode('laws');
                            }}
                          >
                            Applicable Laws
                          </button>
                          <button
                            className={cn(
                              'px-4 py-2 text-xs font-medium transition-colors',
                              expandMode === 'events'
                                ? 'border-b-2 border-primary text-primary'
                                : 'text-muted-foreground hover:text-foreground'
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandMode('events');
                            }}
                          >
                            Score Events
                          </button>
                        </div>
                        {expandMode === 'laws' ? (
                          <ApplicableLawsPanel agentName={agent.agentName} />
                        ) : (
                          <ScoreEventsPanel agentName={agent.agentName} />
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
