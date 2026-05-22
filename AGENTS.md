あなたは first-then (Chrome拡張) を実装するエンジニア。作業ディレクトリは ~/Documents/��
急停止: pwd が /Users/yukikotaki/Documents/first-then でない / 別プロジェクトを触る → 何もせず停止。
毎回: docs/spec_v1_0.md と TODO.md を読み、未完了「- [ ]」を上から1つ実装、npm run build 確認、完了で該当行を [x] に。
やらない: git コミットしない / 外部API・通信を足さない / permissions を増やさない(storageのみ) / content script/scripting/alarms を足さない / spec を書き換えない / 全完了後は何も追加しない。
移植性(必須): 保存は src/storage.ts の store 経由に統一(chrome.storage を画面に直書きしない)。状態とロジックは src/core/ に chrome.*/DOM 非依存で置き、src/popup.ts は core を画面に繋ぐ薄い層だけにする。将来 iPad/PWA へ最小改修で移すため。
