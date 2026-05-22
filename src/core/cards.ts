import { presetCards, type FirstThenPreset } from "./presets";
import { defaultModeState, type AppMode } from "./mode";
import { defaultPremiumState, getPremiumAccess, type PremiumState } from "./premium";

export interface Card {
  id: string;
  emoji: string;
  label: string;
}

export interface SavedPair {
  id: string;
  nowCardId: string;
  nextCardId: string;
}

export interface PopupState {
  now: Card;
  next: Card;
  sequence: Card[];
  sequencePreviewEnabled: boolean;
  pool: Card[];
  savedPairs: SavedPair[];
  mode: AppMode;
  parentPin: string | null;
  premium: PremiumState;
}

export interface CardInput {
  emoji: string;
  label: string;
}

export const initialCards: Card[] = presetCards;

export function createInitialPopupState(cards: Card[] = initialCards): PopupState {
  const [now, next, ...rest] = cards;

  if (!now || !next) {
    throw new Error("At least two cards are required for the popup skeleton.");
  }

  return {
    now,
    next,
    sequence: [now, next],
    sequencePreviewEnabled: false,
    pool: [now, next, ...rest],
    savedPairs: [],
    ...defaultModeState,
    premium: defaultPremiumState,
  };
}

export function normalizeCardInput(input: CardInput): CardInput | null {
  const emoji = input.emoji.trim();
  const label = input.label.trim();

  if (!emoji || !label) {
    return null;
  }

  return { emoji, label };
}

export function addCardToPool(state: PopupState, input: CardInput, id: string): PopupState {
  const normalizedInput = normalizeCardInput(input);

  if (!normalizedInput) {
    return state;
  }

  return {
    ...state,
    pool: [...state.pool, { id, ...normalizedInput }],
  };
}

export function updatePoolCard(state: PopupState, cardId: string, input: CardInput): PopupState {
  const normalizedInput = normalizeCardInput(input);

  if (!normalizedInput) {
    return state;
  }

  const updateCard = (card: Card): Card =>
    card.id === cardId ? { ...card, ...normalizedInput } : card;

  return {
    ...state,
    now: updateCard(state.now),
    next: updateCard(state.next),
    sequence: state.sequence.map(updateCard),
    pool: state.pool.map(updateCard),
  };
}

function findPoolCard(state: PopupState, cardId: string): Card | null {
  return state.pool.find((card) => card.id === cardId) ?? null;
}

export function selectNowCard(state: PopupState, cardId: string): PopupState {
  const card = findPoolCard(state, cardId);

  if (!card) {
    return state;
  }

  return {
    ...state,
    now: card,
    sequence: [card, state.sequence[1] ?? state.next, ...state.sequence.slice(2)],
  };
}

export function selectNextCard(state: PopupState, cardId: string): PopupState {
  const card = findPoolCard(state, cardId);

  if (!card) {
    return state;
  }

  return {
    ...state,
    next: card,
    sequence: [state.sequence[0] ?? state.now, card, ...state.sequence.slice(2)],
  };
}

export function completeNowCard(state: PopupState): PopupState {
  const [, nextStep, followingStep, ...rest] = state.sequence;
  const now = nextStep ?? state.next;
  const next = followingStep ?? now;

  return {
    ...state,
    now,
    next,
    sequence: [now, next, ...rest],
  };
}

export function applyFirstThenPreset(state: PopupState, preset: FirstThenPreset): PopupState {
  const now = state.pool.find((card) => card.id === preset.nowCardId);
  const next = state.pool.find((card) => card.id === preset.nextCardId);

  if (!now || !next) {
    return state;
  }

  return {
    ...state,
    now,
    next,
    sequence: [now, next, ...state.sequence.slice(2)],
  };
}

export function saveCurrentPair(state: PopupState, pairId: string): PopupState {
  const duplicate = state.savedPairs.some(
    (pair) => pair.nowCardId === state.now.id && pair.nextCardId === state.next.id,
  );

  if (duplicate) {
    return state;
  }

  return {
    ...state,
    savedPairs: [
      ...state.savedPairs,
      { id: pairId, nowCardId: state.now.id, nextCardId: state.next.id },
    ],
  };
}

export function applySavedPair(state: PopupState, pairId: string): PopupState {
  const pair = state.savedPairs.find((item) => item.id === pairId);

  if (!pair) {
    return state;
  }

  const now = state.pool.find((card) => card.id === pair.nowCardId);
  const next = state.pool.find((card) => card.id === pair.nextCardId);

  if (!now || !next) {
    return state;
  }

  return {
    ...state,
    now,
    next,
    sequence: [now, next, ...state.sequence.slice(2)],
  };
}

export function deleteSavedPair(state: PopupState, pairId: string): PopupState {
  const savedPairs = state.savedPairs.filter((pair) => pair.id !== pairId);

  if (savedPairs.length === state.savedPairs.length) {
    return state;
  }

  return {
    ...state,
    savedPairs,
  };
}

export function replaceSequenceCard(
  state: PopupState,
  index: number,
  cardId: string,
  now = Date.now(),
): PopupState {
  const card = findPoolCard(state, cardId);
  const access = getPremiumAccess(state.premium, now);

  if (!card || index < 0 || (!access.enabled && index > 1)) {
    return state;
  }

  const sequence = [...state.sequence];
  sequence[index] = card;
  const next = sequence[1] ?? sequence[0] ?? state.next;

  return {
    ...state,
    now: sequence[0] ?? state.now,
    next,
    sequence: [sequence[0] ?? state.now, next, ...sequence.slice(2)],
  };
}

export function appendSequenceCard(
  state: PopupState,
  cardId: string,
  now = Date.now(),
): PopupState {
  const card = findPoolCard(state, cardId);
  const access = getPremiumAccess(state.premium, now);

  if (!card || !access.enabled) {
    return state;
  }

  return {
    ...state,
    sequence: [...state.sequence, card],
  };
}

export function removeSequenceCard(
  state: PopupState,
  index: number,
  now = Date.now(),
): PopupState {
  const access = getPremiumAccess(state.premium, now);

  if (!access.enabled || index < 2 || state.sequence.length <= 2) {
    return state;
  }

  return {
    ...state,
    sequence: state.sequence.filter((_, itemIndex) => itemIndex !== index),
  };
}

export function setSequencePreviewEnabled<T extends PopupState>(
  state: T,
  enabled: boolean,
  now = Date.now(),
): T {
  const access = getPremiumAccess(state.premium, now);

  if (!access.enabled && enabled) {
    return state;
  }

  return {
    ...state,
    sequencePreviewEnabled: enabled,
  };
}

export function getSequencePreviewCard(
  state: PopupState,
  now = Date.now(),
): Card | null {
  const access = getPremiumAccess(state.premium, now);

  if (!access.enabled || !state.sequencePreviewEnabled) {
    return null;
  }

  return state.sequence[2] ?? null;
}

export function deletePoolCard(state: PopupState, cardId: string): PopupState {
  if (state.pool.length <= 2) {
    return state;
  }

  const pool = state.pool.filter((card) => card.id !== cardId);

  if (pool.length === state.pool.length || pool.length < 2) {
    return state;
  }

  return {
    ...state,
    now: state.now.id === cardId ? pool[0] : state.now,
    next: state.next.id === cardId ? pool[1] : state.next,
    sequence: state.sequence.map((card, index) => {
      if (card.id !== cardId) {
        return card;
      }

      return pool[index] ?? pool[1] ?? pool[0];
    }),
    savedPairs: state.savedPairs.filter(
      (pair) => pair.nowCardId !== cardId && pair.nextCardId !== cardId,
    ),
    pool,
  };
}
