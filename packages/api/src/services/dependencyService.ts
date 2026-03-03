import { prisma } from "../lib/db.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a JSON string of epic UUID dependencies, returning [] on failure.
 */
export function parseDependencies(deps: string | null | undefined): string[] {
  if (!deps) return [];
  try {
    const parsed = JSON.parse(deps);
    if (Array.isArray(parsed)) return parsed as string[];
    return [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface DependencyValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate a proposed set of dependency UUIDs for an epic.
 * Checks:
 *  1. All referenced epics exist
 *  2. No self-reference
 *  3. No circular dependencies (DAG check)
 */
export async function validateDependencies(
  epicId: string,
  dependencyIds: string[]
): Promise<DependencyValidationResult> {
  if (dependencyIds.length === 0) {
    return { valid: true };
  }

  // 1. Self-reference check
  if (dependencyIds.includes(epicId)) {
    return { valid: false, error: "An epic cannot depend on itself" };
  }

  // 2. Existence check
  const foundEpics = await prisma.epic.findMany({
    where: { id: { in: dependencyIds } },
    select: { id: true },
  });
  const foundIds = new Set(foundEpics.map((e) => e.id));
  const missing = dependencyIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    return {
      valid: false,
      error: `Referenced epic(s) not found: ${missing.join(", ")}`,
    };
  }

  // 3. Circular dependency check using BFS from each proposed dependency
  const hasCycle = await detectCycle(epicId, dependencyIds);
  if (hasCycle) {
    return {
      valid: false,
      error: "Circular dependency detected: this dependency would create a cycle",
    };
  }

  return { valid: true };
}

/**
 * Detect if adding `epicId` as a dependency of any epic in `proposedDeps`
 * would create a cycle. We walk the transitive dependencies of each
 * `proposedDep` and see if `epicId` is reachable (which would mean epicId
 * already (directly or indirectly) depends on a proposedDep epic).
 */
async function detectCycle(epicId: string, proposedDeps: string[]): Promise<boolean> {
  // Build reverse adjacency: for each proposed dep, walk ITS dependencies.
  // If we ever encounter epicId in that traversal, there is a cycle.
  const visited = new Set<string>();
  const queue = [...proposedDeps];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    if (current === epicId) return true;

    const epic = await prisma.epic.findUnique({
      where: { id: current },
      select: { dependencies: true },
    });
    if (!epic) continue;

    const deps = parseDependencies(epic.dependencies);
    for (const dep of deps) {
      if (!visited.has(dep)) {
        queue.push(dep);
      }
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export interface BlockingEpic {
  id: string;
  identifier: string;
  name: string;
  status: string;
}

export interface DependencyResolutionResult {
  blocked: boolean;
  blockingEpics: BlockingEpic[];
}

/**
 * Resolve the dependency status of an epic.
 * Returns blocked=true if any dependency epic is not yet completed.
 */
export async function resolveDependencies(epicId: string): Promise<DependencyResolutionResult> {
  const epic = await prisma.epic.findUnique({
    where: { id: epicId },
    select: { dependencies: true },
  });

  if (!epic) return { blocked: false, blockingEpics: [] };

  const depIds = parseDependencies(epic.dependencies);
  if (depIds.length === 0) return { blocked: false, blockingEpics: [] };

  const deps = await prisma.epic.findMany({
    where: { id: { in: depIds } },
    select: { id: true, identifier: true, name: true, status: true },
  });

  const blockingEpics = deps
    .filter((d) => d.status !== "completed")
    .map((d) => ({
      id: d.id,
      identifier: d.identifier ?? d.id,
      name: d.name,
      status: d.status,
    }));

  return {
    blocked: blockingEpics.length > 0,
    blockingEpics,
  };
}
