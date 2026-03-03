import { PipelineStage, type StageStatus } from './PipelineStage';
import type { PipelineStatus, PipelineStatusValue } from '@/lib/api/epic-requests';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { Lock } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const STAGE_ORDER: PipelineStatusValue[] = ['approved', 'planning', 'planned', 'building', 'done'];

const STAGE_LABELS: Record<PipelineStatusValue, string> = {
  approved: 'Approved',
  planning: 'Planning',
  planned: 'Planned',
  building: 'Building',
  done: 'Done',
  error: 'Error',
};

function getStageStatus(
  stageValue: PipelineStatusValue,
  currentStatus: PipelineStatusValue | null
): StageStatus {
  if (!currentStatus) return 'pending';
  if (currentStatus === 'error') {
    // For error state, all stages before current are done, current shows error
    return 'pending';
  }

  const stageIdx = STAGE_ORDER.indexOf(stageValue);
  const currentIdx = STAGE_ORDER.indexOf(currentStatus);

  if (stageIdx < currentIdx) return 'done';
  if (stageIdx === currentIdx) return 'active';
  return 'pending';
}

function getStageLink(
  stageValue: PipelineStatusValue,
  pipeline: PipelineStatus
): { link?: string; linkLabel?: string } {
  if (stageValue === 'planned' && pipeline.convertedEpicId) {
    return { link: `/epics/${pipeline.convertedEpicId}`, linkLabel: 'View epic' };
  }
  if (stageValue === 'building' && pipeline.linkedSessionId) {
    return { linkLabel: 'Session active' };
  }
  if (stageValue === 'done' && pipeline.prUrl) {
    return { link: pipeline.prUrl, linkLabel: 'View PR' };
  }
  return {};
}

export interface DependencyStatus {
  blocked: boolean;
  blockingEpics: Array<{ identifier: string; name: string; id: string }>;
}

export interface PipelineTrackerProps {
  pipeline: PipelineStatus;
  className?: string;
  dependencyStatus?: DependencyStatus;
}

export function PipelineTracker({ pipeline, className, dependencyStatus }: PipelineTrackerProps) {
  const { pipelineStatus, pipelineUpdatedAt, pipelineError } = pipeline;
  const isBlocked = dependencyStatus?.blocked === true;

  return (
    <div className={cn('space-y-3', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Pipeline Status</span>
          {isBlocked && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 dark:bg-amber-950 px-2 py-0.5 rounded-full cursor-default">
                    <Lock className="h-3 w-3" />
                    Blocked
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-medium mb-1">Blocked by:</p>
                  <ul className="space-y-0.5">
                    {dependencyStatus!.blockingEpics.map((e) => (
                      <li key={e.id} className="font-mono text-xs">
                        {e.identifier}: {e.name}
                      </li>
                    ))}
                  </ul>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        {pipelineUpdatedAt && (
          <span className="text-xs text-muted-foreground">
            Updated {formatDistanceToNow(new Date(pipelineUpdatedAt), { addSuffix: true })}
          </span>
        )}
      </div>

      {/* Stage tracker */}
      <div className={cn("flex items-start w-full overflow-x-auto pb-1", isBlocked && "opacity-50 pointer-events-none select-none")}>
        <div className="flex items-start w-full min-w-[320px]">
          {pipelineStatus === 'error' ? (
            // Error state: show all stages grayed, plus error stage
            <>
              {STAGE_ORDER.map((stage, idx) => (
                <PipelineStage
                  key={stage}
                  label={STAGE_LABELS[stage]}
                  status="pending"
                  isLast={idx === STAGE_ORDER.length - 1}
                />
              ))}
              <div className="flex items-center">
                <div className="h-0.5 w-3 bg-red-400" />
                <PipelineStage
                  label="Error"
                  status="error"
                  isLast={true}
                />
              </div>
            </>
          ) : (
            STAGE_ORDER.map((stage, idx) => {
              const status = getStageStatus(stage, pipelineStatus);
              const stageLink = getStageLink(stage, pipeline);
              return (
                <PipelineStage
                  key={stage}
                  label={STAGE_LABELS[stage]}
                  status={status}
                  {...(stageLink.link !== undefined ? { link: stageLink.link } : {})}
                  {...(stageLink.linkLabel !== undefined ? { linkLabel: stageLink.linkLabel } : {})}
                  isLast={idx === STAGE_ORDER.length - 1}
                />
              );
            })
          )}
        </div>
      </div>

      {/* Error message */}
      {pipelineStatus === 'error' && pipelineError && (
        <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950 px-3 py-2 rounded-md">
          {pipelineError}
        </div>
      )}

      {/* Blocked message */}
      {isBlocked && (
        <div className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
          <Lock className="h-3 w-3" />
          Blocked — waiting for {dependencyStatus!.blockingEpics.length} dependenc{dependencyStatus!.blockingEpics.length === 1 ? 'y' : 'ies'} to complete before dispatch.
        </div>
      )}

      {/* Active status message */}
      {pipelineStatus === 'planning' && (
        <div className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
          Planning in progress — Opus is creating the epic structure...
        </div>
      )}
      {pipelineStatus === 'building' && (
        <div className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
          Building in progress — Bobby is implementing the features...
        </div>
      )}
    </div>
  );
}
