# ENG-E213: Auto-Instrumentation Gap Analysis

Produced by: Bobby (ENG-161)
Date: 2026-03-02
Epic: API-Layer Auto-Instrumentation: Session Events from Task and Feature Status Changes

---

## What ENG-113 Already Implemented (Verified in Codebase)

### taskService.ts — Lines 735-767
- `emitSessionEventToEpic()` called on every `statusId` change in `updateTask()`
- Event type: `task_status_change` (or `remediation_complete` for remediation tasks)
- Payload includes: `taskId`, `identifier`, `title`, `newStatusId`, `previousStatusId`
- Fire-and-forget: `.catch(() => {})` — never blocks the update

### featureService.ts — Lines 731-746
- `emitSessionEventToEpic()` called on every `statusId` change in `updateFeature()`
- Event type: `feature_status_change`
- Payload includes: `featureId`, `identifier`, `title`, `newStatusId`, `previousStatusId`
- Fire-and-forget: `.catch(() => {})` — never blocks the update
- `checkEpicCompletion()` also fires to update epic lifecycle status

### epicService.ts — Lines 1180-1203
- `emitSessionEventToEpic(epicId, event)` — the core shared function
- Finds active `aiSession` for epicId via bare Prisma lookup
- Writes a `sessionEvent` record to the DB
- No-op if no active session; all errors silently swallowed

### sessionEventService.ts
- `persistSessionEvent()` — DB write via EventEmitter listener
- `getSessionEvents()` — query with filters (time, session, type, pagination)
- `computeProgressState(events)` — pure function deriving progress from event array
- `derivePhaseFromDatabase(epicId)` — fallback phase derivation from DB

---

## Confirmed Gaps

### Gap 1: No shared utility for active session lookup (ENG-162)
`emitSessionEventToEpic` in epicService.ts inlines the session lookup. No standalone
`getActiveSessionForEpic(epicId)` utility exists that other services can import from
a non-service path (e.g., `utils/`) to avoid circular dependencies.

### Gap 2: Task completion missing progress summary (ENG-163-3)
The `task_status_change` event payload does not include `completedTaskCount` or
`totalTaskCount` for the parent feature. When a task is completed, session consumers
cannot determine overall progress from the event payload alone.

### Gap 3: Feature completion missing task progress summary (ENG-164-2)
The `feature_status_change` event payload does not include `completedTaskCount` or
`totalTaskCount`. Feature completion events are opaque — consumers cannot determine
how many tasks were completed.

### Gap 4: getSession() does not compute live progress (ENG-165)
`sessionService.getSession(sessionId)` returns only the raw session record fields.
It does not compute `completedTasks`, `totalTasks`, `completedFeatures`, or
`totalFeatures` from the live database state. Session Monitor relies on
`itemsWorkedOn` (manual log-work) which agents skip, producing stale progress.

### Gap 5: Dead code — findEpicIdForItem() in sessionService.ts (Line 718)
A malformed JSDoc `/**` at line 718 opens a block comment that is never closed
before the `findEpicIdForItem` function declaration (line 719). The function body
(lines 719-740) is entirely inside the comment and is unreachable dead code.
The `*/` at line 744 (part of `abandonSession`'s JSDoc) closes the outer comment.

### Gap 6: Bulk update routes bypass hooks (out of scope for this epic)
`PUT /tasks/bulk-update` and `PUT /features/bulk-update` use `prisma.updateMany()`
directly and do NOT call `updateTask()`/`updateFeature()`. No session events are
emitted for bulk status changes. Deferred to a future epic.

---

## What ENG-E213 Will Implement

- **ENG-162**: `packages/api/src/utils/sessionUtils.ts` — standalone utility functions
- **ENG-163**: Enhance task hook with completion progress summary in taskService.ts
- **ENG-164**: Enhance feature hook with task progress summary in featureService.ts
- **ENG-165**: Add `computeSessionProgress()` + update `getSession()` + schema update
