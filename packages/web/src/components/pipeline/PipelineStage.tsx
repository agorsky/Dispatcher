import { CheckCircle2, Circle, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type StageStatus = 'pending' | 'active' | 'done' | 'error';

export interface PipelineStageProps {
  label: string;
  status: StageStatus;
  link?: string;
  linkLabel?: string;
  isLast?: boolean;
}

function StageIcon({ status }: { status: StageStatus }) {
  if (status === 'done') {
    return <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />;
  }
  if (status === 'active') {
    return <Loader2 className="h-5 w-5 text-blue-500 animate-spin shrink-0" />;
  }
  if (status === 'error') {
    return <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />;
  }
  return <Circle className="h-5 w-5 text-muted-foreground/40 shrink-0" />;
}

export function PipelineStage({ label, status, link, linkLabel, isLast }: PipelineStageProps) {
  return (
    <div className="flex items-center min-w-0">
      <div className="flex flex-col items-center gap-1 min-w-0">
        {/* Icon + label */}
        <div className="flex flex-col items-center gap-1">
          <div
            className={cn(
              'flex items-center justify-center w-9 h-9 rounded-full border-2 transition-colors',
              status === 'done' && 'border-green-500 bg-green-50 dark:bg-green-950',
              status === 'active' && 'border-blue-500 bg-blue-50 dark:bg-blue-950 ring-2 ring-blue-200 dark:ring-blue-900',
              status === 'error' && 'border-red-500 bg-red-50 dark:bg-red-950',
              status === 'pending' && 'border-muted-foreground/20 bg-muted/30'
            )}
          >
            <StageIcon status={status} />
          </div>
          <span
            className={cn(
              'text-xs font-medium text-center leading-tight',
              status === 'done' && 'text-green-600 dark:text-green-400',
              status === 'active' && 'text-blue-600 dark:text-blue-400',
              status === 'error' && 'text-red-600 dark:text-red-400',
              status === 'pending' && 'text-muted-foreground/60'
            )}
          >
            {label}
          </span>
          {link && linkLabel && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-500 hover:underline truncate max-w-[80px]"
              onClick={(e) => { e.stopPropagation(); }}
            >
              {linkLabel}
            </a>
          )}
        </div>
      </div>

      {/* Connector line */}
      {!isLast && (
        <div
          className={cn(
            'flex-1 h-0.5 mx-1 min-w-[12px] transition-colors',
            status === 'done' ? 'bg-green-400 dark:bg-green-600' : 'bg-muted-foreground/20'
          )}
        />
      )}
    </div>
  );
}
