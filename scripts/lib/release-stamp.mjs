export function releaseStamp(environment, builtAt = new Date().toISOString()) {
  const commitSha = environment.GITHUB_SHA ?? null;
  if (commitSha !== null && !/^[a-f0-9]{40}$/.test(commitSha)) throw new Error("Release SHA must be an exact Git commit.");
  if (!Number.isFinite(Date.parse(builtAt))) throw new Error("Invalid build timestamp.");
  return { schemaVersion: 1, commitSha, builtAt };
}
