// storage.ts : 保存アダプタ。拡張では chrome.storage.local。将来のPWAは localStorage 等に差し替えるだけ。
// 画面/ロジックは必ずこの store 経由で保存し、chrome.storage を直接散在させない。
export interface Store {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

const fallbackValues = new Map<string, unknown>();

function readFallback<T>(key: string): T | null {
  return (fallbackValues.get(key) as T | undefined) ?? null;
}

function getRuntimeError(): chrome.runtime.LastError | undefined {
  return chrome.runtime.lastError;
}

export const store: Store = {
  get<T>(key: string): Promise<T | null> {
    return new Promise<T | null>((res) => {
      try {
        chrome.storage.local.get(key, (o) => {
          if (getRuntimeError()) {
            res(readFallback<T>(key));
            return;
          }

          res(readFallback<T>(key) ?? ((o[key] as T | undefined) ?? null));
        });
      } catch {
        res(readFallback<T>(key));
      }
    });
  },
  set<T>(key: string, value: T): Promise<void> {
    return new Promise<void>((res) => {
      try {
        chrome.storage.local.set({ [key]: value }, () => {
          if (getRuntimeError()) {
            fallbackValues.set(key, value);
          } else {
            fallbackValues.delete(key);
          }

          res();
        });
      } catch {
        fallbackValues.set(key, value);
        res();
      }
    });
  },
  remove(key: string): Promise<void> {
    return new Promise<void>((res) => {
      try {
        chrome.storage.local.remove(key, () => {
          fallbackValues.delete(key);
          res();
        });
      } catch {
        fallbackValues.delete(key);
        res();
      }
    });
  },
};
