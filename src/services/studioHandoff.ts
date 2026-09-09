// Only an explicit, same-page product action bypasses the recovery prompt.
// A reload clears this token and restores the normal draft recovery flow.
let pendingProject: string | undefined;
export function stageStudioHandoff(projectId: string) { pendingProject = projectId; }
export function consumeStudioHandoff(projectId: string) {
  if (pendingProject !== projectId) return false;
  pendingProject = undefined;
  return true;
}
