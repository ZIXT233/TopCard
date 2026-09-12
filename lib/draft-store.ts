import { persistentStorage } from "./persistent-storage.ts";
import {
  MAX_ATTACHED_IMAGES,
  isBase64ImageWithinLimits,
} from "./image-attachments";

export interface ChatDraftImage {
  data: string;
  mimeType: string;
}

export interface ChatDraft {
  value: string;
  images: ChatDraftImage[];
}

const drafts = new Map<string, ChatDraft>();
const STORAGE_PREFIX = "topcard:draft:";
const memoryOnlyKeys = new Set<string>();

function persistDraft(key: string, draft: ChatDraft | null): void {
  if (typeof window === "undefined") return;
  try {
    if (draft) persistentStorage().setItem(STORAGE_PREFIX + key, JSON.stringify(draft));
    else persistentStorage().removeItem(STORAGE_PREFIX + key);
    memoryOnlyKeys.delete(key);
  } catch {
    // Large image drafts or disabled storage still survive in this page.
    memoryOnlyKeys.add(key);
  }
}

function cloneDraft(draft: ChatDraft): ChatDraft {
  return {
    value: draft.value,
    images: draft.images.map((image) => ({ ...image })),
  };
}

function isEmptyDraft(draft: ChatDraft): boolean {
  return !draft.value && draft.images.length === 0;
}

export function getDraft(key: string): ChatDraft | null {
  if (typeof window !== "undefined" && !memoryOnlyKeys.has(key)) {
    try {
      const raw = persistentStorage().getItem(STORAGE_PREFIX + key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as ChatDraft;
      if (typeof parsed.value !== "string" || !Array.isArray(parsed.images)) return null;
      return cloneDraft({ value: parsed.value, images: parsed.images.filter(isBase64ImageWithinLimits).slice(0, MAX_ATTACHED_IMAGES) });
    } catch { /* Keep the existing in-memory fallback. */ }
  }
  const draft = drafts.get(key);
  return draft ? cloneDraft(draft) : null;
}

export function setDraft(key: string, draft: ChatDraft): void {
  if (isEmptyDraft(draft)) {
    drafts.delete(key);
    persistDraft(key, null);
    return;
  }
  drafts.set(key, cloneDraft(draft));
  persistDraft(key, draft);
}

export function clearDraft(key: string): void {
  drafts.delete(key);
  persistDraft(key, null);
}

export function mergeRestoredSubmissionText(submitted: string, current: string): string {
  if (!submitted.trim()) return current;
  if (!current.trim()) return submitted;
  return `${submitted}\n\n${current}`;
}

export function mergeRestoredSubmissionDraft(
  submittedText: string,
  submittedImages: ChatDraftImage[] | undefined,
  currentText: string,
  currentImages: ChatDraftImage[],
): ChatDraft {
  const images = [...(submittedImages ?? []), ...currentImages]
    .filter(isBase64ImageWithinLimits)
    .slice(0, MAX_ATTACHED_IMAGES)
    .map(({ data, mimeType }) => ({ data, mimeType }));

  return {
    value: mergeRestoredSubmissionText(submittedText, currentText),
    images,
  };
}

export function restoreDraftSubmission(
  key: string,
  text: string,
  images?: ChatDraftImage[],
): ChatDraft {
  const current = getDraft(key) ?? { value: "", images: [] };
  const restored = mergeRestoredSubmissionDraft(
    text,
    images,
    current.value,
    current.images,
  );
  setDraft(key, restored);
  return restored;
}

export function rekeyDraft(
  previousKey: string,
  nextKey: string,
  currentDraft?: ChatDraft,
): ChatDraft | null {
  if (previousKey === nextKey) return currentDraft ? cloneDraft(currentDraft) : getDraft(nextKey);

  const storedPrevious = getDraft(previousKey);
  const previous = currentDraft && !isEmptyDraft(currentDraft)
    ? cloneDraft(currentDraft)
    : (storedPrevious ?? (currentDraft ? cloneDraft(currentDraft) : null));
  const next = getDraft(nextKey);
  clearDraft(previousKey);
  if (!previous) return next;

  const merged = next
    ? mergeRestoredSubmissionDraft(next.value, next.images, previous.value, previous.images)
    : previous;
  setDraft(nextKey, merged);
  return cloneDraft(merged);
}
