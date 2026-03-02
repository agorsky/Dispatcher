import { PipelineStage, type StageStatus } from './PipelineStage';
import type { PipelineStatus, PipelineStatusValue } from '@/lib/api/epic-requests';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

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

export interface PipelineTrackerProps {
  pipeline: PipelineStatus;
  className?: string;
}

export function PipelineTracker({ pipeline, className }: PipelineTrackerProps) {
  const { pipelineStatus, pipelineUpdatedAt, pipelineError } = pipeline;

  return (
    <div className={cn('space-y-3', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">Pipeline Status</span>
        {pipelineUpdatedAt && (
          <span className="text-xs text-muted-foreground">
            Updated {formatDistanceToNow(new Date(pipelineUpdatedAt), { addSuffix: true })}
          </span>
        )}
      </div>

      {/* Stage tracker */}
      <div className="flex items-start w-full overflow-x-auto pb-1">
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
