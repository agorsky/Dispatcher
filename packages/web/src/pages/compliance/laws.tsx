import { useState, useMemo } from 'react';
import { useLaws } from '@/hooks/queries/use-laws';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';

const severityColors: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  low: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
};

export function LawsPage() {
  const [namespaceFilter, setNamespaceFilter] = useState<string>('production');
  const { data: laws, isLoading, isError } = useLaws(namespaceFilter === '_all' ? undefined : namespaceFilter);
  const [severityFilter, setSeverityFilter] = useState<string>('_all');
  const [appliesToFilter, setAppliesToFilter] = useState<string>('_all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const uniqueAppliesTo = useMemo(() => {
    if (!laws) return [];
    return [...new Set(laws.map((l) => l.appliesTo))].sort();
  }, [laws]);

  const filteredLaws = useMemo(() => {
    if (!laws) return [];
    return laws.filter((law) => {
      if (severityFilter !== '_all' && law.severity !== severityFilter) return false;
      if (appliesToFilter !== '_all' && law.appliesTo !== appliesToFilter) return false;
      return true;
    });
  }, [laws, severityFilter, appliesToFilter]);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

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
        Failed to load laws. Please try again.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select value={namespaceFilter} onValueChange={setNamespaceFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Namespace" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="production">Production</SelectItem>
            <SelectItem value="test">Test</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
            <SelectItem value="_all">All Namespaces</SelectItem>
          </SelectContent>
        </Select>

        <Select value={severityFilter} onValueChange={setSeverityFilter}>
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

        <Select value={appliesToFilter} onValueChange={setAppliesToFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Targets" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All Targets</SelectItem>
            {uniqueAppliesTo.map((target) => (
              <SelectItem key={target} value={target}>
                {target}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Laws list */}
      {filteredLaws.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No laws found</p>
        </div>
      ) : (
        <div className="rounded-lg border divide-y">
          {filteredLaws.map((law) => (
            <Collapsible
              key={law.id}
              open={expandedIds.has(law.id)}
              onOpenChange={() => toggleExpanded(law.id)}
            >
              <CollapsibleTrigger className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/50 transition-colors">
                <ChevronRight
                  className={cn(
                    'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                    expandedIds.has(law.id) && 'rotate-90'
                  )}
                />
                <span className="font-mono text-xs font-medium w-24 shrink-0">
                  {law.lawCode}
                </span>
                <span className="text-sm flex-1">{law.title}</span>
                <Badge className={cn('text-xs', severityColors[law.severity] ?? '')}>
                  {law.severity}
                </Badge>
                <span className="text-xs text-muted-foreground w-28 text-right">
                  {law.appliesTo}
                </span>
                <Badge
                  variant={law.isActive ? 'default' : 'secondary'}
                  className="text-xs"
                >
                  {law.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-4 pb-4 pt-1 pl-11 space-y-3 text-sm">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                    <p>{law.description}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Audit Logic</p>
                    <p className="font-mono text-xs bg-muted/50 rounded p-2">{law.auditLogic}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Consequence</p>
                    <p>{law.consequence}</p>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      )}
    </div>
  );
}
