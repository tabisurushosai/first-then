# first-then (つぎはこれ) 仕様書 v1_0
## ゴール
「いま これ → つぎ これ」の2枚絵カードで切り替えを支援するChrome拡張。発達特性児・幼児とその保護者向け。
## 絶対制約
外部API・通信なし/chrome.storage.localのみ/権限storageのみ/MV3・TS・Vite/UIはpopup内で完結。医療・診断をうたわない。
## 機能
カードのプール(絵文字+ことば)を保護者が追加/編集/削除/「いま」と「つぎ」に各1枚を選んで大きく表示/「いま」完了で「つぎ」を「いま」に送る/プリセット(きがえ→あさごはん 等)内蔵/保護者・子供モードを簡易PINで保護/全状態を保存・復元/i18n ja-en/無料は基本動作、Premium($3買い切り7日トライアル,Stripe Checkout)で3ステップ以上の連鎖+カード差し替え。
## 完了条件
npm run build成功・dist生成・_locales ja/en・icons16/48/128・release/first-then.zip生成。
