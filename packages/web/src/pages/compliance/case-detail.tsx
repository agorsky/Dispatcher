import { useParams, useNavigate } from 'react-router-dom';
import { useCase } from '@/hooks/queries/use-cases';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ArrowLeft, FileText, Link as LinkIcon, AlertTriangle, CheckCircle, Clock, Gavel } from 'lucide-react';

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

const evidenceIcons: Record<string, typeof FileText> = {
  document: FileText,
  link: LinkIcon,
  violation: AlertTriangle,
};

function formatDate(date?: string) {
  if (!date) return null;
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function CaseDetailPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const { data: caseData, isLoading, isError } = useCase(caseId ?? '');

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (isError || !caseData) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center text-sm text-destructive">
        Failed to load case details.
      </div>
    );
  }

  const timelineEvents = [
    { label: 'Filed', date: caseData.filedAt, icon: Clock },
    { label: 'Hearing', date: caseData.hearingAt, icon: Gavel },
    { label: 'Verdict', date: caseData.verdictAt ?? caseData.resolvedAt, icon: CheckCircle },
    { label: 'Corrected', date: caseData.correctedAt, icon: CheckCircle },
  ].filter((e) => e.date);

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => { void navigate('/compliance'); }}
        className="gap-1"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Cases
      </Button>

      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold font-mono">{caseData.caseNumber}</h1>
          <Badge className={cn('text-xs', severityColors[caseData.severity] ?? '')}>
            {caseData.severity}
          </Badge>
          <Badge className={cn('text-xs', statusColors[caseData.status] ?? '')}>
            {caseData.status}
          </Badge>
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>Accused: <span className="font-medium text-foreground">{caseData.accusedAgent}</span></span>
          {caseData.law && (
            <span>
              Law: <span className="font-mono font-medium text-foreground">{caseData.law.lawCode}</span>
              {' — '}
              {caseData.law.title}
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Evidence */}
        <Card className="p-5">
          <h2 className="text-base font-semibold mb-4">Evidence</h2>
          {Array.isArray(caseData.evidence) && caseData.evidence.length > 0 ? (
            <div className="space-y-3">
              {(caseData.evidence as Array<{type:string;reference:string;description:string}>).map((e, i) => {
                const Icon = evidenceIcons[e.type] ?? FileText;
                return (
                  <div key={i} className="flex gap-3 rounded-md border p-3">
                    <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                    <div className="space-y-1 min-w-0">
                      <p className="text-sm font-medium">{e.reference}</p>
                      <p className="text-xs text-muted-foreground">{e.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No evidence recorded</p>
          )}
        </Card>

        {/* Verdict */}
        <Card className="p-5">
          <h2 className="text-base font-semibold mb-4">Verdict</h2>
          {caseData.verdict ? (
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Verdict</p>
                <p className="text-sm font-medium">{caseData.verdict}</p>
              </div>
              {(caseData.verdictReason ?? caseData.reasoning) && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Reasoning</p>
                  <p className="text-sm">{caseData.verdictReason ?? caseData.reasoning}</p>
                </div>
              )}
              {caseData.deductionLevel && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Deduction Level</p>
                  <Badge variant="outline" className="text-xs">
                    {caseData.deductionLevel}
                  </Badge>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Verdict pending</p>
          )}
        </Card>
      </div>

      {/* Timeline */}
      {timelineEvents.length > 0 && (
        <Card className="p-5">
          <h2 className="text-base font-semibold mb-4">Timeline</h2>
          <div className="flex items-start gap-0">
            {timelineEvents.map((event, i) => {
              const Icon = event.icon;
              return (
                <div key={event.label} className="flex items-center">
                  <div className="flex flex-col items-center text-center">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <p className="text-xs font-medium mt-2">{event.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(event.date)}
                    </p>
                  </div>
                  {i < timelineEvents.length - 1 && (
                    <div className="h-px w-12 bg-border mt-4 mx-2" />
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
