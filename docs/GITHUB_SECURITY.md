# GitHubで実行する検証

## 設定したもの

- **CoStep CI**：mainへのpush・PR・手動実行で、Next.js型生成、型チェック、単体／DB認可テスト、production build、productionサーバーへの未認証・CSRF・Origin・ヘッダーテストを実行。
- **CodeQL**：JavaScript/TypeScriptをsecurity-extendedで解析。mainへのpush・PR・週次・手動実行。解析結果のアップロードだけにsecurity-events: writeを付与。
- **Dependabot設定ファイル**：npmとGitHub Actionsの依存更新を毎週確認しPRを作成。自動マージはしない。Dependabot alerts・security updatesの管理画面での有効化とは別。
- **Secret scan**：Gitleaks 8.30.1を公式リリースのSHA-256で検証。取得した全Git履歴を検査し、検出時は失敗。ログはredact指定。外部サービスに鍵の有効性確認を送らない。mainへのpush・PR・週次・手動実行。

公式ActionはコミットSHAで固定し、Dependabotのgithub-actions設定で更新を追跡する。Gitleaksバイナリのバージョンとチェックサムは手動更新が必要。

## 秘密情報を使わないCI

本番Supabase・SMTP・Vercelの秘密をGitHubへ渡す必要はない。DBテストはPGliteへSQLを適用して行い、本番DBには接続しない。HTTPテストでは架空の接続先・公開用キーを使い、使い捨てのセッション暗号鍵を生成する。匿名の拒否試験であり、本番の認証済み複数アカウント試験とは別。

`npm run test:ci` はtests内の単体テストとDB統合テストを自動検出する。HTTPだけはサーバー起動後に別実行する。`npm run test:db` もDBテストを自動検出し、新しい認可テストの列挙漏れを防ぐ。

## 管理者権限が必要な項目

2026-10-18時点で利用アカウントはpush権限あり、admin/maintain権限なし。

以下は有効化済みと扱わない。既に組織側で有効である可能性もあるが、現在の権限では状態の確認や変更ができない。

1. Dependabot alertsとsecurity updates、必要なdependency graphの状態確認・有効化。
2. GitHub標準のSecret Scanningとpush protectionの状態確認・有効化。
3. mainのルールセットでCI・CodeQL・Secret scanを必須チェックにし、失敗時のマージを防ぐ設定。
4. CodeQLで組織承認・既存default setupとの競合・security-events権限の問題が出た場合の対応。

GitleaksのActionsは標準Secret Scanningの代替検査であり、標準機能を有効化したことにはならない。push後の検出なので、最初の漏洩そのものを止めるpush protectionとも異なる。漏洩を検出した場合は履歴からの削除だけで済ませず、該当鍵を失効・交換する。

## 現時点の限界

`npm run security:gate` は要件記録が未確認のため未達。今回のCIでこれを合格に書き換えたり、実施済みと偽ったりしない。CIは機械的な実装チェックであり、一般公開要件全体の承認ではない。Vercelへの既存の手動デプロイを自動的に禁止するものでもない。

参照：
- https://docs.github.com/en/code-security/getting-started/github-security-features
- https://docs.github.com/en/code-security/reference/code-scanning/workflow-configuration-options
- https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-security-and-analysis-settings-for-your-repository
- https://github.com/gitleaks/gitleaks

## 漏洩対応の追加（2026-10-18）

Secret scanはCoStep用の3検出ルールを追加し、分類済み件数だけをジョブの概要に表示する。main・定期・手動実行で検出または検査失敗があれば、運営担当へのIssue通知を行う。PRにはIssue書き込み権限を渡さない。実行用権限が組織設定で拒否されたら通知ジョブも失敗するため、Actions結果を確認する。

対応手順・停止フラグ・セッション無効化は [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md) に記載。自動の鍵失効・交換は行わず、Vercelへの反映とサービス側での失効・交換は運営操作が必要。

## 公開サイト側の追加監視

Public asset securityとRuntime security monitorを追加。Git履歴検査とは別に公開JavaScriptと認証結果の集計を確認する。設計、しきい値、限界は [RUNTIME_SECURITY_MONITOR.md](RUNTIME_SECURITY_MONITOR.md) を参照。
