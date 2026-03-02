import type { Session } from '@/lib/api/sessions';
import { cn } from '@/lib/utils';

function formatElapsed(startedAt: string): string {
  const elapsed = Date.now() - new Date(startedAt).getTime();
  const minutes = Math.floor(elapsed / 60000);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

interface SessionCardProps {
  session: Session;
}

export function SessionCard({ session }: SessionCardProps) {
  const isActive = session.status === 'active';

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={cn(
              'h-2 w-2 rounded-full shrink-0',
              isActive ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground'
            )}
          />
          <span className="text-sm font-medium truncate">
            {session.epicName ?? 'Unknown Epic'}
          </span>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap shrink-0">
          {formatElapsed(session.startedAt)}
        </span>
      </div>

      {session.summary && (
        <p className="text-xs text-muted-foreground line-clamp-2">
          {session.summary}
        </p>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
            isActive
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : session.status === 'completed'
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                : 'bg-muted text-muted-foreground'
          )}
        >
          {session.status}
        </span>
        {session.externalId && (
          <span className="font-mono text-[10px]">{session.externalId.slice(0, 8)}</span>
        )}
      </div>
    </div>
  );
}
