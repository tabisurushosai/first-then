// storage.ts : 保存アダプタ。拡張では chrome.storage.local。将来のPWAは localStorage 等に差し替えるだけ。
// 画面/ロジックは必ずこの store 経由で保存し、chrome.storage を直接散在させない。
export interface Store {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}
export const store: Store = {
  get<T>(key) { return new Promise((res) => chrome.storage.local.get(key, (o) => res((o[key] as T) ?? null))); },
  set<T>(key, value) { return new Promise((res) => chrome.storage.local.set({ [key]: value }, () => res())); },
  remove(key) { return new Promise((res) => chrome.storage.local.remove(key, () => res())); },
};
