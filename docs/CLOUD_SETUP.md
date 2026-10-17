# 接続と公開の手順

GitHub pushは不要。Vercel公式CLIから配置する。実秘密は.env.localとVercelのサーバー環境変数に保存し、チャット/Git/READMEへ書かない。

## Supabase

- study-circle専用の新規Freeプロジェクト。自動テーブル公開はoff、自動RLSはon。
- supabase/migrations/202610170001_foundation.sqlを新しいプロジェクトだけへ適用。
- Project URLとpublishable keyを接続。service_role/secret key/DBパスワードはアプリへ不要。
- Authenticationのメール確認をon。Site URLを公開Origin、Redirect URLsに公開Origin/auth/callbackと開発Origin/auth/callbackを完全一致登録。
- Authのレート制限・CAPTCHA・メール送信制限/SMTPを確認。無料の内蔵メールは送信可能数や宛先に制約があり得る。実際に確認するまで不特定の新規登録が動くと宣言しない。
- 登録受付ALLOW_SIGNUPは初期false。メール確認と不正利用対策を確認してtrueへ。
- メール確認PKCEは登録したブラウザからリンクを開く。同一ブラウザ制約を画面で説明。ブラウザ内でタブ間のCookieが共有されない環境では失敗するため、チーム試用前に実機で検証する。
- /reset-password はメール送信と認証後のパスワード更新に対応。通常のパスワードログイン・本人の更新成功は確認済み。確認リンク経由の引継ぎには失敗事例が残っており、解決済みと扱わない。

## ローカル

.env.exampleを.env.localへコピーし、SUPABASE_URL、SUPABASE_PUBLISHABLE_KEY、SESSION_ENCRYPTION_KEY（32バイトbase64）、APP_ORIGINを設定。APP_ORIGINと実際のアクセスURLは一致必須。

npm install / npm run dev。ローカルはhttp://127.0.0.1:3000。

## Vercel

Vercel CLIでログイン後、study-circleディレクトリでvercel deploy。初期プロジェクトはFree/Hobby。リージョンTokyo、Node24。課金プランに自動変更しない。

サーバー環境変数はSUPABASE_URL / SUPABASE_PUBLISHABLE_KEY / SESSION_ENCRYPTION_KEY / APP_ORIGIN / ALLOW_SIGNUP。NEXT_PUBLIC変数・管理キーは不要。公開Origin確定後にAPP_ORIGINを一致させて再配置。

## 現段階の公開制限

### チーム試用の準備中（2026-10-17）

- メールアドレス＋パスワード方式を維持し、Googleログインは採用しない。
- 専用GmailのSMTP（smtp.gmail.com:465）が保存されたことを管理画面で確認。本番ALLOW_SIGNUP=trueへ更新して配置済み。SMTP経由の到着・新規登録完了はまだ未確認。
- チームのアプリ利用のためだけにSupabase組織の管理権限を付与しない。
- Googleの2段階認証・アプリパスワードを本人が設定し、本人がSupabaseへ保存。秘密値はチャットやコードに保存していない。送信元アドレスは受信者に表示される。
- SMTP2GOは独自ドメインのメールが登録に必要で採用せず。Brevoは利用開始未完了・アプリ未接続、本人承認後に公式サポートへアカウント削除を依頼済み。削除完了の返答は未確認。
- 本番URLは認証なしのHTTP GETで200を確認。試用URLの共有先はチーム内とするが、URL共有先だけを許可する招待制・アドレス許可リストは未実装。第三者もURLを知れば登録を試せるため、一般公開可能との説明はしない。
- SMTP設定後、公開URLでチームメンバーの登録・確認リンク・ログインを検証してから試用を開始する。

コードは複数ユーザー対応だが、画像・返信・DM・通知・退会・管理/通報・全体費用/復旧運用の完成前は一般公開不可。登録は検証用の限定アカウント・疑似データで確認し、公開ゲートが通ったと誤認させない。

- 午後：migration 003（フォロー承認/登録後プロフィール設定）をSQL Editorで適用し成功を確認。アプリの対応版も配置済み。既存のフォローは承認待ちになる。

- 午後：migration 004（複数学習分野/分野別の自己申告経験）を適用し、対応アプリを配置。旧画面で設定保存に失敗した場合はページを再読み込みする。
