# Dependabot PR #1〜#4の確認

対象はGitHub Actionsの参照更新のみ。アプリ依存パッケージや実行時の機能・データ処理を変更しない。

| PR | 更新 | 確認 |
|---|---|---|
| #1 | actions/setup-node v5 → v7.1.0 | Node 24版公式Action。node-version:24とnpmキャッシュ指定を維持 |
| #2 | actions/checkout v5 → v7.0.1 | 公式Action。persist-credentials:false、履歴検査用fetch-depth:0を維持 |
| #3 | CodeQL initのSHA更新 | v4系公式Action。JS/TS・security-extended・build-mode:noneを維持 |
| #4 | CodeQL analyzeのSHA更新 | initと同一リビジョンに揃える。解析カテゴリを維持 |

全参照はコミットSHA固定のまま。GITHUB_TOKENの権限やトリガーは拡張しない。検証用ブランチに4件といいね・通知UI修正を統合し、実際のGitHub ActionsでCI・CodeQL・Git履歴秘密情報検査を実行して確認する。ローカル49件と公開サイトHTTP1件も成功。3件の検証ワークフローはいずれも成功。最終結果はGitHub Actionsの対象実行を参照。

- CI: https://github.com/jphacks/sp_2606/actions/runs/39148544321
- CodeQL: https://github.com/jphacks/sp_2606/actions/runs/39148547176
- Secret scan: https://github.com/jphacks/sp_2606/actions/runs/39148549743

Action更新は開発・検査基盤の変更であり、公開アプリの新機能として説明しない。いいね・既読表示の修正はVercel `dpl_DSHHRq34JJh2ABJ5sKZka1enPv9u` へ反映し、本番HTTP試験成功。SQL26を共有DBへ適用し、自己いいねを拒否、過去の自己いいねを集計から除外する。既読0件では押せないボタンを出さず「すべて確認済みです。」と表示する。
