import { CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PipelineStatusValue } from '@/lib/api/epic-requests';

export interface PipelineIndicatorProps {
  pipelineStatus: PipelineStatusValue | null;
  className?: string;
}

const STATUS_LABELS: Partial<Record<PipelineStatusValue, string>> = {
  approved: 'Approved',
  planning: 'Planning',
  planned: 'Planned',
  building: 'Building',
  done: 'Done',
  error: 'Pipeline error',
};

/**
 * Compact pipeline status indicator for list views.
 * Shows animated dot for active states, checkmark for done, error icon for errors.
 */
export function PipelineIndicator({ pipelineStatus, className }: PipelineIndicatorProps) {
  if (!pipelineStatus) return null;

  const label = STATUS_LABELS[pipelineStatus];

  if (pipelineStatus === 'done') {
    return (
      <div className={cn('flex items-center gap-1 text-xs text-green-600 dark:text-green-400', className)}>
        <CheckCircle2 className="h-3 w-3 shrink-0" />
        <span>{label}</span>
      </div>
    );
  }

  if (pipelineStatus === 'error') {
    return (
      <div className={cn('flex items-center gap-1 text-xs text-red-500', className)}>
        <AlertCircle className="h-3 w-3 shrink-0" />
        <span>{label}</span>
      </div>
    );
  }

  // Active states: planning, planned, building
  const isActive = pipelineStatus === 'planning' || pipelineStatus === 'building';

  return (
    <div className={cn('flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400', className)}>
      {isActive ? (
        <Loader2 className="h-3 w-3 animate-spin shrink-0" />
      ) : (
        <span className="inline-block w-2 h-2 rounded-full bg-blue-500 shrink-0" />
      )}
      <span>{label}</span>
    </div>
  );
}
