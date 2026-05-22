import { presetCards, type FirstThenPreset } from "./presets";
import { defaultModeState, type AppMode } from "./mode";

export interface Card {
  id: string;
  emoji: string;
  label: string;
}

export interface PopupState {
  now: Card;
  next: Card;
  pool: Card[];
  mode: AppMode;
  parentPin: string | null;
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
    pool: [now, next, ...rest],
    ...defaultModeState,
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
  };
}

export function completeNowCard(state: PopupState): PopupState {
  return {
    ...state,
    now: state.next,
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
  };
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
    pool,
  };
}
