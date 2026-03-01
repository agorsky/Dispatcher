import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCases } from '@/hooks/queries/use-cases';
import type { CaseFilters } from '@/lib/api/cases';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

const severityColors: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  low: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
};

const statusColors: Record<string, string> = {
  filed: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  hearing: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  verdict: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  convicted: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  acquitted: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  corrected: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300',
};

export function CasesPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<CaseFilters>({});

  const { data: cases, isLoading, isError } = useCases(filters);

  const uniqueAgents = useMemo(() => {
    if (!cases) return [];
    return [...new Set(cases.map((c) => c.accusedAgent))].sort();
  }, [cases]);

  const updateFilter = (key: keyof CaseFilters, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value === '_all' ? undefined : value,
    }));
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={filters.status ?? '_all'}
          onValueChange={(v) => updateFilter('status', v)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All Statuses</SelectItem>
            <SelectItem value="filed">Filed</SelectItem>
            <SelectItem value="hearing">Hearing</SelectItem>
            <SelectItem value="verdict">Verdict</SelectItem>
            <SelectItem value="convicted">Convicted</SelectItem>
            <SelectItem value="acquitted">Acquitted</SelectItem>
            <SelectItem value="corrected">Corrected</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.severity ?? '_all'}
          onValueChange={(v) => updateFilter('severity', v)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Severities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All Severities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.accusedAgent ?? '_all'}
          onValueChange={(v) => updateFilter('accusedAgent', v)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Agents" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All Agents</SelectItem>
            {uniqueAgents.map((agent) => (
              <SelectItem key={agent} value={agent}>
                {agent}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center text-sm text-destructive">
          Failed to load cases. Please try again.
        </div>
      )}

      {/* Table */}
      {cases && !isLoading && (
        <>
          {cases.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No cases found</p>
            </div>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-4 py-3 font-medium">Case #</th>
                    <th className="text-left px-4 py-3 font-medium">Accused Agent</th>
                    <th className="text-left px-4 py-3 font-medium">Law</th>
                    <th className="text-left px-4 py-3 font-medium">Severity</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-left px-4 py-3 font-medium">Verdict</th>
                    <th className="text-left px-4 py-3 font-medium">Filed</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b last:border-b-0 hover:bg-accent/50 cursor-pointer transition-colors"
                      onClick={() => { void navigate(`/compliance/cases/${c.id}`); }}
                    >
                      <td className="px-4 py-3 font-mono text-xs">{c.caseNumber}</td>
                      <td className="px-4 py-3">{c.accusedAgent}</td>
                      <td className="px-4 py-3">
                        {c.law ? (
                          <span className="text-xs">
                            <span className="font-mono font-medium">{c.law.lawCode}</span>
                            {' — '}
                            {c.law.title}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={cn('text-xs', severityColors[c.severity] ?? '')}>
                          {c.severity}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={cn('text-xs', statusColors[c.status] ?? '')}>
                          {c.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {c.verdict ? (
                          <span className="text-xs">{c.verdict}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(c.filedAt), { addSuffix: true })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
