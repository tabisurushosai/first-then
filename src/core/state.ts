import { createInitialPopupState, type Card, type PopupState, type SavedPair } from "./cards";
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

function isSavedPair(value: unknown): value is SavedPair {
  if (!value || typeof value !== "object") {
    return false;
  }

  const pair = value as Record<string, unknown>;
  return (
    typeof pair.id === "string" &&
    typeof pair.nowCardId === "string" &&
    typeof pair.nextCardId === "string"
  );
}

function normalizeCard(value: unknown): Card | null {
  return isCard(value) ? value : null;
}

function normalizeCardList(value: unknown): Card[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const card = normalizeCard(item);
    return card ? [card] : [];
  });
}

function compactCards(cards: Array<Card | null>): Card[] {
  const seenIds = new Set<string>();
  const compacted: Card[] = [];

  cards.forEach((card) => {
    if (!card || seenIds.has(card.id)) {
      return;
    }

    seenIds.add(card.id);
    compacted.push(card);
  });

  return compacted;
}

function normalizeSavedPairs(value: unknown, pool: Card[]): SavedPair[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const poolIds = new Set(pool.map((card) => card.id));
  const seenPairs = new Set<string>();
  const pairs: SavedPair[] = [];

  value.forEach((item) => {
    if (!isSavedPair(item) || !poolIds.has(item.nowCardId) || !poolIds.has(item.nextCardId)) {
      return;
    }

    const pairKey = `${item.nowCardId}\n${item.nextCardId}`;

    if (seenPairs.has(pairKey)) {
      return;
    }

    seenPairs.add(pairKey);
    pairs.push(item);
  });

  return pairs;
}

function findCardById(cards: Card[], card: Card): Card | null {
  return cards.find((item) => item.id === card.id) ?? card;
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
    typeof state.sequencePreviewEnabled === "boolean" &&
    Array.isArray(state.pool) &&
    state.pool.every(isCard) &&
    Array.isArray(state.savedPairs) &&
    state.savedPairs.every(isSavedPair) &&
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
  const initialState = createInitialPopupState();
  const savedNow = normalizeCard(state.now);
  const savedNext = normalizeCard(state.next);
  const savedPool = normalizeCardList(state.pool);
  const savedSequence = normalizeCardList(state.sequence);
  const savedCards = compactCards([savedNow, savedNext, ...savedSequence, ...savedPool]);
  const pool = savedCards.length >= 2 ? savedCards : initialState.pool;
  const now = savedNow ? findCardById(pool, savedNow) ?? pool[0] : pool[0] ?? initialState.now;
  const next = savedNext ? findCardById(pool, savedNext) ?? pool[1] : pool[1] ?? initialState.next;
  const sequence = savedSequence.length >= 2 ? savedSequence : [now, next];
  const normalizedSequence = [
    findCardById(pool, sequence[0]) ?? now,
    findCardById(pool, sequence[1]) ?? next,
    ...sequence.slice(2).flatMap((card) => {
      const poolCard = findCardById(pool, card);
      return poolCard ? [poolCard] : [];
    }),
  ];

  return {
    now,
    next,
    sequence: normalizedSequence,
    sequencePreviewEnabled: state.sequencePreviewEnabled === true,
    pool,
    savedPairs: normalizeSavedPairs(state.savedPairs, pool),
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
