import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { ServerProgressState } from "@/hooks/useSessionEvents";
import { SessionEvent, SessionEventType } from "@dispatcher/shared";

/**
 * Props for SessionSummaryPane component
 */
export interface SessionSummaryPaneProps {
  /** Server-computed progress state from the API */
  progress: ServerProgressState;
  /** Session events for calculating session duration */
  events: SessionEvent[];
  /** Optional additional className for styling */
  className?: string;
}

/**
 * Format duration in seconds to HH:MM:SS string
 */
function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  return [hrs, mins, secs]
    .map(v => v.toString().padStart(2, '0'))
    .join(':');
}

/**
 * Format relative time from a timestamp
 */
function formatRelativeTime(timestamp: string): string {
  const now = Date.now();
  const eventTime = new Date(timestamp).getTime();
  const diffMs = now - eventTime;
  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 5) return "just now";
  if (diffSeconds < 60) return `${diffSeconds} seconds ago`;
  
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

/**
 * SessionSummaryPane - Real-time session progress monitoring component
 * 
 * Displays epic progress, current phase, feature/task counts using server-computed state.
 * Updates via polling as new events arrive.
 */
export function SessionSummaryPane({
  progress,
  events,
  className,
}: SessionSummaryPaneProps) {
  const [sessionDuration, setSessionDuration] = useState<number>(0);
  const [relativeTime, setRelativeTime] = useState<string>('-');
  const [isStale, setIsStale] = useState<boolean>(false);

  // Calculate session duration based on SESSION_STARTED timestamp
  useEffect(() => {
    // Find the SESSION_STARTED event
    const sessionStartEvent = events.find(
      (event) => event.eventType === SessionEventType.SESSION_STARTED
    );

    if (!sessionStartEvent) {
      setSessionDuration(0);
      return;
    }

    const startTime = new Date(sessionStartEvent.timestamp).getTime();

    // Update duration every second
    const intervalId = setInterval(() => {
      const now = Date.now();
      const durationMs = now - startTime;
      const durationSeconds = Math.floor(durationMs / 1000);
      setSessionDuration(durationSeconds);
    }, 1000);

    // Initial calculation
    const now = Date.now();
    const durationMs = now - startTime;
    const durationSeconds = Math.floor(durationMs / 1000);
    setSessionDuration(durationSeconds);

    // Cleanup interval on unmount
    return () => clearInterval(intervalId);
  }, [events]);

  // Update relative time for last event
  useEffect(() => {
    if (events.length === 0) {
      setRelativeTime('-');
      setIsStale(false);
      return;
    }

    const lastEvent = events[0]; // Events are sorted newest first
    if (!lastEvent) return;

    // Update relative time every second
    const updateRelativeTime = () => {
      const timestamp = lastEvent.timestamp;
      
      const formatted = formatRelativeTime(timestamp);
      setRelativeTime(formatted);

      // Check if event is stale (>30 seconds old)
      const now = Date.now();
      const eventTime = new Date(timestamp).getTime();
      const diffSeconds = Math.floor((now - eventTime) / 1000);
      setIsStale(diffSeconds > 30);
    };

    updateRelativeTime();
    const intervalId = setInterval(updateRelativeTime, 1000);

    // Cleanup interval on unmount
    return () => clearInterval(intervalId);
  }, [events]);

  return (
    <div
      className={cn(
        "flex flex-col space-y-6 w-full max-w-sm p-6 bg-card border border-border rounded-lg shadow-sm",
        className
      )}
    >
      {/* Section 1: Progress Bar */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">
          Epic Progress
        </h3>
        <div className="space-y-1">
          {/* Progress bar with smooth transitions */}
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-green-500 to-green-600 transition-all duration-500 ease-in-out"
              style={{ width: `${progress.progressPercentage}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {progress.progressPercentage}% complete
          </p>
        </div>
      </div>

      {/* Section 2: Current Phase */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">
          Current Phase
        </h3>
        <div className="text-lg font-semibold">
          {progress.currentPhase !== null ? (
            <>
              Phase {progress.currentPhase}
              {progress.totalPhases !== null && (
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  of {progress.totalPhases}
                </span>
              )}
            </>
          ) : progress.lastCompletedPhase !== null ? (
            <>
              <span className="text-muted-foreground">Phase {progress.lastCompletedPhase} completed</span>
              {progress.totalPhases !== null && (
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  of {progress.totalPhases}
                </span>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">No active phase</span>
          )}
        </div>
      </div>

      {/* Section 3: Feature/Task Counts */}
      {/* NOTE: completedFeatures, totalFeatures, completedTasks, totalTasks are
          DB-sourced (from computeSessionProgress in sessionService.ts) — NOT
          derived from session events. This ensures accuracy even when event
          emission is incomplete. See ENG-E218. */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">
          Completion Status
        </h3>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span>Features:</span>
            <span className="font-medium">
              {progress.completedFeatures}/{progress.totalFeatures}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Tasks:</span>
            <span className="font-medium">
              {progress.completedTasks}/{progress.totalTasks}
            </span>
          </div>
        </div>
      </div>

      {/* Section 4: Session Info */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">
          Session Info
        </h3>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Last event: {relativeTime}</span>
            {isStale && (
              <svg 
                className="w-4 h-4 text-yellow-500" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
                />
              </svg>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            Duration: {formatDuration(sessionDuration)}
          </div>
        </div>
      </div>
    </div>
  );
}
