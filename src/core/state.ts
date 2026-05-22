import { createInitialPopupState, type Card, type PopupState } from "./cards";

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

export function isPopupState(value: unknown): value is PopupState {
  if (!value || typeof value !== "object") {
    return false;
  }

  const state = value as Record<string, unknown>;
  return isCard(state.now) && isCard(state.next) && Array.isArray(state.pool) && state.pool.every(isCard);
}

export async function loadPopupState(store: StorePort): Promise<PopupState> {
  const savedState = await store.get<unknown>(popupStateStorageKey);
  return isPopupState(savedState) ? savedState : createInitialPopupState();
}

export async function savePopupState(store: StorePort, state: PopupState): Promise<void> {
  await store.set(popupStateStorageKey, state);
}

export async function clearPopupState(store: StorePort): Promise<void> {
  await store.remove(popupStateStorageKey);
}
