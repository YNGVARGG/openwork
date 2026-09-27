/** Recognize only our stored study records; arbitrary JSON stays a file. */
export function cvcStudyTarget(path: string): { projectId: string; runId?: string; revisionId?: string } | null {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "");
  const id = "([a-zA-Z0-9][a-zA-Z0-9_-]{0,79})";
  const match = new RegExp(`^\\.cvc/projects/${id}/(project\\.json|runs/${id}\\.json|revisions/${id}\\.json)$`).exec(normalized);
  return match ? { projectId: match[1]!, runId: match[3], revisionId: match[4] } : null;
}
