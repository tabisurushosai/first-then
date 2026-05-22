export interface Card {
  id: string;
  emoji: string;
  label: string;
}

export interface PopupState {
  now: Card;
  next: Card;
  pool: Card[];
}

export const initialCards: Card[] = [
  { id: "change-clothes", emoji: "👕", label: "きがえ" },
  { id: "breakfast", emoji: "🍙", label: "あさごはん" },
  { id: "brush-teeth", emoji: "🪥", label: "はみがき" },
  { id: "go-out", emoji: "🎒", label: "おでかけ" },
];

export function createInitialPopupState(cards: Card[] = initialCards): PopupState {
  const [now, next, ...rest] = cards;

  if (!now || !next) {
    throw new Error("At least two cards are required for the popup skeleton.");
  }

  return {
    now,
    next,
    pool: [now, next, ...rest],
  };
}
