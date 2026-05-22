このフォルダには chrome.* と DOM に依存しない純粋TSのロジック/状態を置く。
保存は ../storage.ts の store を使う。将来 iPad/PWA はこの core をそのまま再利用し、storage と画面層だけ差し替える。
