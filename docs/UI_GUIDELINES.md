# CoStep UIの設計方針

Apple Human Interface Guidelinesを参考に、Web/PWAの標準HTML・CSSで実装する。Apple公式への全面準拠や、WCAG適合の認定を示すものではない。

## 学習記録画面で適用した内容

- 文字とデータを主役にし、操作は共通のアクセント色、学習分野はグラフ専用の固定色で区別する。
- アイコンだけの操作に「グラフ」「カレンダー」のラベルを付ける。
- 月移動、日付選択、グラフの各日、削除などは44 CSS px以上の操作領域を目標とする。Appleのpt指定をWeb用に適用した設計判断であり、ptとCSS pxの物理的同一性を保証するものではない。
- 小さい画面ではグラフを縦に並べる。カレンダー・週間グラフが収まらない場合はカード内で横スクロールできる。
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
