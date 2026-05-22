import type { Card } from "./cards";

export interface CompletionCelebration {
  completedCard: Card;
  sparkles: string[];
}

export function createCompletionCelebration(completedCard: Card): CompletionCelebration {
  return {
    completedCard,
    sparkles: ["✨", "⭐", "✨"],
  };
}
