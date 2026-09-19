import * as diff from 'diff';
import { FileSnapshot } from '../types/shared.js';

export interface FileDiff {
  filePath: string;
  patch: string;
  /** Same text as `patch` — the UI reads it under this name. */
  diff: string;
  before: string | null;
  after: string | null;
  additions: number;
  deletions: number;
  isNew: boolean;
  isDeleted: boolean;
}

export function generateDiff(before: string | null, after: string | null, filePath: string): FileDiff {
  const b = before ?? '';
  const a = after ?? '';
  
  const patch = diff.createPatch(filePath, b, a);
  const changes = diff.diffLines(b, a);
  
  let additions = 0;
  let deletions = 0;
  
  for (const change of changes) {
    if (change.added) additions += change.count || 0;
    if (change.removed) deletions += change.count || 0;
  }
  
  return {
    filePath,
    patch,
    diff: patch,
    before,
    after,
    additions,
    deletions,
    isNew: before === null && after !== null,
    isDeleted: before !== null && after === null
  };
}

export function generateTaskDiffs(snapshots: FileSnapshot[]): FileDiff[] {
  return snapshots.map(s => generateDiff(s.contentBefore, s.contentAfter, s.filePath));
}
