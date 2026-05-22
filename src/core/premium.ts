export const trialDays = 7;
export const stripeCheckoutUrl = "https://buy.stripe.com/test_first_then_premium";

export interface PremiumState {
  unlocked: boolean;
  trialStartedAt: string | null;
}

export const defaultPremiumState: PremiumState = {
  unlocked: false,
  trialStartedAt: null,
};

export interface PremiumAccess {
  enabled: boolean;
  trialActive: boolean;
  trialDaysLeft: number;
}

export function isPremiumState(value: unknown): value is PremiumState {
  if (!value || typeof value !== "object") {
    return false;
  }

  const state = value as Record<string, unknown>;
  return (
    typeof state.unlocked === "boolean" &&
    (typeof state.trialStartedAt === "string" || state.trialStartedAt === null)
  );
}

function parseDate(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

export function normalizePremiumState(value: unknown): PremiumState {
  if (isPremiumState(value)) {
    return value;
  }

  if (!value || typeof value !== "object") {
    return defaultPremiumState;
  }

  const state = value as Partial<Record<keyof PremiumState, unknown>>;
  return {
    unlocked: state.unlocked === true,
    trialStartedAt: typeof state.trialStartedAt === "string" ? state.trialStartedAt : null,
  };
}

export function getPremiumAccess(state: PremiumState, now = Date.now()): PremiumAccess {
  if (state.unlocked) {
    return {
      enabled: true,
      trialActive: false,
      trialDaysLeft: 0,
    };
  }

  const startedAt = parseDate(state.trialStartedAt);

  if (!startedAt) {
    return {
      enabled: false,
      trialActive: false,
      trialDaysLeft: trialDays,
    };
  }

  const trialMs = trialDays * 24 * 60 * 60 * 1000;
  const remainingMs = startedAt + trialMs - now;
  const trialActive = remainingMs > 0;

  return {
    enabled: trialActive,
    trialActive,
    trialDaysLeft: trialActive ? Math.ceil(remainingMs / (24 * 60 * 60 * 1000)) : 0,
  };
}

export function startPremiumTrial<T extends { premium: PremiumState }>(
  state: T,
  now = new Date(),
): T {
  if (state.premium.trialStartedAt) {
    return state;
  }

  return {
    ...state,
    premium: {
      ...state.premium,
      trialStartedAt: now.toISOString(),
    },
  };
}
