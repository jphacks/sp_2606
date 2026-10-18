# CoStep UIの設計方針

Apple Human Interface Guidelinesを参考に、Web/PWAの標準HTML・CSSで実装する。Apple公式への全面準拠や、WCAG適合の認定を示すものではない。

## 学習記録画面で適用した内容

- 文字とデータを主役にし、操作は共通のアクセント色、学習分野はグラフ専用の固定色で区別する。
- アイコンだけの操作に「グラフ」「カレンダー」のラベルを付ける。
- 月移動や削除などは44 CSS px以上の操作領域を目標とする。日付と棒グラフの各日はスマホの7列表示に合わせて幅を調整する。Appleのpt指定をWeb用に適用した設計判断であり、ptとCSS pxの物理的同一性を保証するものではない。
- 小さい画面ではグラフを縦に並べ、月間カレンダー・週間グラフは画面幅に収める。日付セルの操作領域を重ねない。
- 補助文字を原則13px以上にし、見出し・合計・補足の階層を分ける。
- 色だけに依存せず、凡例、時間、選択枠、読み上げ用ラベル、日別・分野別の表で内容を伝える。
- 選択中の日は濃い背景・白文字・太字で示し、日付ボタンは押下状態も公開する。
- 棒グラフの積み上げ部分には境界線を付ける。
- `prefers-reduced-motion` でスムーズスクロールと動きを抑える。
- `prefers-contrast: more` ではカード・日付の境界を強める。
- メモは任意で、つぶやきと共通の公開範囲に従うことを明示する。削除は既存の確認を維持する。

## 継続確認

文字拡大、スマートフォン実機、VoiceOver、キーボード、明暗のコントラスト、全画面の操作サイズは継続して確認する。現時点でアプリ全体を適合済みとは扱わない。ダークモードはこの変更には含まない。

## 参照したApple公式資料

- [Human Interface Guidelines](https://developer.apple.com/jp/design/human-interface-guidelines)
- [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)
- [Typography](https://developer.apple.com/design/human-interface-guidelines/typography)
- [Charts](https://developer.apple.com/design/human-interface-guidelines/charts)
- [Color](https://developer.apple.com/design/human-interface-guidelines/color)

## 文章の公開範囲

「フォロワーのみ」は、投稿者がフォロー申請を承認した閲覧者に公開する。フォローバックは不要。既存DBのvisibility値 `mutual` は互換性のため維持し、表示と判定をフォロワー向けに変更する。DMの `dm_policy=mutual` は従来どおり相互フォローを要求する。つぶやき・コメント・公開を選択した学習メモには、共通のDBアクセス判定を適用する。

## 学習記録の共有画面

学習記録はつぶやきと同じフィードに混在し、記録の作成日時で並べる。おすすめは経験が近い人、フォロー中は承認済みのフォロー先、最新投稿は全表示対象から取得する。学習分野・日付・時間はログイン済み全員向け、メモ本文は既存の公開範囲・承認済みフォロワー・ブロックの判定に従う。学習記録を重複するつぶやきへ変換しない。

カードから記録日を選択した同じStudyDashboardへ移動する。本人以外には追加・削除を表示しない。PCのサイドバーの大きなロゴを外し、共通ヘッダーに小さなロゴを表示する。

## プロフィールのアイコンとフォント

- 設定の丸いアイコンは写真・画像に変更できる。タイムライン、プロフィール、ユーザー一覧、DM一覧で共通表示する。未設定時は名前の頭文字。
- 元画像はブラウザで中央を正方形に切り抜き、サーバーでも192px JPEGへ再変換。元画像・EXIFは保存しない。1ユーザー1画像、保存上限48KiB、変更5回/分・30回/日。
- 読み出しは認証必須。ブロック・利用停止をDBで再確認し、レスポンスはno-store。文章の公開設定とは独立した基本プロフィール情報。
- HEIC/HEIFはブラウザで読み込める場合に変換する。非対応の場合はJPEG/PNGへの変換を案内する。
- 見出しはLINE Seed JP Bold（LINEヤフー株式会社、SIL Open Font License 1.1）。公式Google Fonts配布ファイルとライセンスをpublic/fontsに同梱。https://seed.line.me/index_jp.html
