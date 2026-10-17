"use client";
import { useEffect, useState, type FormEvent } from "react";

export default function PasswordReset() {
  const [session, setSession] = useState<{ csrf: string; user: unknown } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    fetch("/api/session", { cache: "no-store" }).then(r => r.json()).then(setSession).catch(() => setMessage("接続できませんでした。"));
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const action = session?.user ? "password" : "recover";
    if (action === "password" && data.get("password") !== data.get("confirmation")) {
      setMessage("パスワードが一致しません。"); return;
    }
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/auth/" + action, {
        method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": session?.csrf || "" },
        body: JSON.stringify(action === "password" ? { password: data.get("password") } : { email: data.get("email") }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setMessage(result.message); form.reset();
      if (action === "password") setDone(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : "接続できませんでした。"); }
    finally { setBusy(false); }
  }
  return <main style={{ maxWidth: 520, margin: "60px auto", padding: 24 }}>
    <h1>パスワード再設定</h1>
    {!done && <form onSubmit={submit}>
      {session?.user ? <>
        <p>新しいパスワードを設定してください。</p>
        <label>新しいパスワード<input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} /></label>
        <label>確認用<input name="confirmation" type="password" autoComplete="new-password" required minLength={12} maxLength={128} /></label>
      </> : <>
        <p>登録したメールアドレスに再設定リンクを送ります。このブラウザでリンクを開いた後、もう一度この画面に進んでください。</p>
        <label>メールアドレス<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
      </>}
      <button className="primary" disabled={busy || !session}>{busy ? "処理中…" : session?.user ? "新しいパスワードを保存" : "再設定メールを送る"}</button>
    </form>}
    {message && <p role="status">{message}</p>}
    <p><a href="/">アプリに戻る</a></p>
  </main>;
}
