export type AppMode = "parent" | "child";

export interface ModeState {
  mode: AppMode;
  parentPin: string | null;
}

export const defaultModeState: ModeState = {
  mode: "parent",
  parentPin: null,
};

export function normalizePin(pin: string): string | null {
  const value = pin.trim();

  if (!value) {
    return null;
  }

  return value;
}

export function setParentPin<T extends ModeState>(state: T, pin: string): T {
  const normalizedPin = normalizePin(pin);

  if (!normalizedPin) {
    return state;
  }

  return {
    ...state,
    parentPin: normalizedPin,
  };
}

export function switchToChildMode<T extends ModeState>(state: T, pin: string): T {
  const normalizedPin = normalizePin(pin);

  if (!normalizedPin) {
    return state;
  }

  return {
    ...state,
    mode: "child",
    parentPin: normalizedPin,
  };
}

export function canEnterParentMode(state: ModeState, pin: string): boolean {
  const normalizedPin = normalizePin(pin);
  return Boolean(normalizedPin && state.parentPin && normalizedPin === state.parentPin);
}

export function switchToParentMode<T extends ModeState>(state: T, pin: string): T {
  if (!canEnterParentMode(state, pin)) {
    return state;
  }

  return {
    ...state,
    mode: "parent",
  };
}
