"use client";
import { useState, type FormEvent } from "react";
export default function DeleteAccountPanel({ csrf }: { csrf: string }) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = e.currentTarget,
      values = new FormData(form);
    setBusy(true);
    setError("");
    try {
      const code = String(values.get("code") || "").trim();
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({
          password: values.get("password"),
          confirmation: values.get("confirmation"),
          ...(code ? { code } : {}),
        }),
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "退会できませんでした。");
      form.reset();
      window.location.replace("/?account=deleted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "通信できませんでした。");
      setBusy(false);
    }
  }
  return (
    <section className="card" aria-label="退会">
      <h2>退会</h2>
      {!open ? (
        <button
          type="button"
          className="text-button"
          onClick={() => setOpen(true)}
        >
          退会手続きへ
        </button>
      ) : (
        <form onSubmit={submit} aria-busy={busy}>
          <p>
            プロフィール・画像・投稿・返信・学習記録・フォロー・DMとアカウントを削除します。相手側のDMも削除され、元に戻せません。他の人の投稿についたあなたの返信なども削除されます。
          </p>
          <p className="muted">
            退会済みデータを復元しないため、アカウントIDと退会日時だけを8日間保持します。削除前の暗号化バックアップは保存期間7日です。サービスの運用ログは提供元の保持条件に従います。相手が保存した画像などは削除できません。
          </p>
          <fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
            <label>
              現在のパスワード
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                required
                maxLength={128}
              />
            </label>
            <label>
              認証アプリの確認コード（二要素認証が有効な場合）
              <input
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="6桁の数字"
              />
            </label>
            <label>
              確認のため「退会する」と入力
              <input
                name="confirmation"
                required
                pattern="退会する"
                autoComplete="off"
              />
            </label>
            <button type="submit" className="primary">
              {busy ? "削除しています…" : "すべて削除して退会する"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError("");
              }}
            >
              キャンセル
            </button>
          </fieldset>
          {error && <p role="alert">{error}</p>}
          {busy && (
            <div className="account-deletion-overlay" role="status">
              退会処理中です。画面を閉じずにお待ちください。
            </div>
          )}
        </form>
      )}
    </section>
  );
}
