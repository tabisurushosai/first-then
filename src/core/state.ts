import { createInitialPopupState, type Card, type PopupState } from "./cards";
import { defaultModeState, type AppMode } from "./mode";
import { isPremiumState, normalizePremiumState } from "./premium";

export const popupStateStorageKey = "popupState";

export interface StorePort {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

function isCard(value: unknown): value is Card {
  if (!value || typeof value !== "object") {
    return false;
  }

  const card = value as Record<string, unknown>;
  return (
    typeof card.id === "string" &&
    typeof card.emoji === "string" &&
    typeof card.label === "string"
  );
}

function isAppMode(value: unknown): value is AppMode {
  return value === "parent" || value === "child";
}

export function isPopupState(value: unknown): value is PopupState {
  if (!value || typeof value !== "object") {
    return false;
  }

  const state = value as Record<string, unknown>;
  return (
    isCard(state.now) &&
    isCard(state.next) &&
    Array.isArray(state.sequence) &&
    state.sequence.length >= 2 &&
    state.sequence.every(isCard) &&
    Array.isArray(state.pool) &&
    state.pool.every(isCard) &&
    isAppMode(state.mode) &&
    (typeof state.parentPin === "string" || state.parentPin === null) &&
    isPremiumState(state.premium)
  );
}

function normalizePopupState(value: unknown): PopupState {
  if (isPopupState(value)) {
    return value;
  }

  if (!value || typeof value !== "object") {
    return createInitialPopupState();
  }

  const state = value as Record<string, unknown>;

  if (!isCard(state.now) || !isCard(state.next) || !Array.isArray(state.pool) || !state.pool.every(isCard)) {
    return createInitialPopupState();
  }

  const sequence =
    Array.isArray(state.sequence) &&
    state.sequence.length >= 2 &&
    state.sequence.every(isCard)
      ? state.sequence
      : [state.now, state.next];

  return {
    now: state.now,
    next: state.next,
    sequence,
    pool: state.pool,
    mode: isAppMode(state.mode) ? state.mode : defaultModeState.mode,
    parentPin: typeof state.parentPin === "string" ? state.parentPin : defaultModeState.parentPin,
    premium: normalizePremiumState(state.premium),
  };
}

export async function loadPopupState(store: StorePort): Promise<PopupState> {
  const savedState = await store.get<unknown>(popupStateStorageKey);
  const state = normalizePopupState(savedState);

  if (!isPopupState(savedState)) {
    await savePopupState(store, state);
  }

  return state;
}

export async function savePopupState(store: StorePort, state: PopupState): Promise<void> {
  await store.set(popupStateStorageKey, state);
}

export async function clearPopupState(store: StorePort): Promise<void> {
  await store.remove(popupStateStorageKey);
}
