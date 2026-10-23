import {analysisMatchesCurrentItem} from "./analysis-state";
import type {CheckItem, Inspection} from "./inspection";

export interface GuidedProgress {
  reviewed: number;
  total: number;
  remaining: number;
  complete: boolean;
  nextItem: CheckItem | undefined;
}

/** Suggestions do not count as reviews; a human may explicitly finish an item as inconclusive. */
export function getGuidedProgress(inspection: Inspection, activeItemId: string): GuidedProgress {
  const active = inspection.items.find(item => item.id === activeItemId);
  const pending = inspection.items.filter(item => item.status === "pendente");
  const candidates = pending.filter(item => item.id !== activeItemId);
  const total = inspection.items.length;
  return {
    reviewed: total - pending.length,
    total,
    remaining: pending.length,
    complete: total > 0 && pending.length === 0,
    nextItem: candidates.find(item => item.room === active?.room) ?? candidates[0],
  };
}

/** Confirmation is available only for the current completed comparison that needs no new photo. */
export function canReviewSuggestion(inspection: Inspection, itemId: string): boolean {
  const item = inspection.items.find(entry => entry.id === itemId);
  if (!item?.suggestion?.analysisId) return false;
  const analysis = (inspection.analyses ?? []).filter(entry =>
    entry.itemId === itemId && analysisMatchesCurrentItem(inspection, entry)).at(-1);
  if (!analysis || analysis.id !== item.suggestion.analysisId
    || analysis.result.status !== item.suggestion.status || analysis.result.needsPhoto) return false;

  const captures = inspection.evidence.filter(photo => photo.itemId === itemId);
  const latestCapture = [...captures].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1);
  return latestCapture?.id === analysis.evidenceId && latestCapture.analysisState === "complete";
}
