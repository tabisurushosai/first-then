import type { Card } from "./cards";

export interface FirstThenPreset {
  id: string;
  nowCardId: string;
  nextCardId: string;
  label: string;
}

export const presetCards: Card[] = [
  { id: "change-clothes", emoji: "👕", label: "きがえ" },
  { id: "breakfast", emoji: "🍙", label: "あさごはん" },
  { id: "brush-teeth", emoji: "🪥", label: "はみがき" },
  { id: "go-out", emoji: "🎒", label: "おでかけ" },
  { id: "bath", emoji: "🛁", label: "おふろ" },
  { id: "sleep", emoji: "🌙", label: "ねる" },
];

export const firstThenPresets: FirstThenPreset[] = [
  {
    id: "morning-change-breakfast",
    nowCardId: "change-clothes",
    nextCardId: "breakfast",
    label: "きがえ → あさごはん",
  },
  {
    id: "morning-brush-go",
    nowCardId: "brush-teeth",
    nextCardId: "go-out",
    label: "はみがき → おでかけ",
  },
  {
    id: "night-bath-sleep",
    nowCardId: "bath",
    nextCardId: "sleep",
    label: "おふろ → ねる",
  },
];
