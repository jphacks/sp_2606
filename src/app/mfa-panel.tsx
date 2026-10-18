"use client";
import { useEffect, useState, type FormEvent } from "react";
import { ShieldCheck, LoaderCircle } from "lucide-react";

type Factor = { id: string; name: string; status: string };
async function request(csrf: string, body: unknown) {
  const response = await fetch("/api/mfa", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "認証できませんでした。");
  return result;
}
function CodeInput() {
  return (
    <label>
      確認コード
      <input
        name="code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        minLength={6}
        maxLength={6}
        required
        placeholder="6桁の数字"
      />
    </label>
  );
}
export function MfaChallenge({
  csrf,
  factors,
  onSuccess,
  onLogout,
}: {
  csrf: string;
  factors: { id: string; name: string }[];
  onSuccess: () => Promise<unknown>;
  onLogout: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [recovering, setRecovering] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await request(csrf, {
        action: "verify",
        factorId: f.get("factor"),
        code: f.get("code"),
      });
      await onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "接続できませんでした。");
    } finally {
      setBusy(false);
    }
  }
  if (recovering)
    return (
      <MfaRecovery
        csrf={csrf}
        onSuccess={onSuccess}
        onBack={() => setRecovering(false)}
      />
    );
  return (
    <main className="mfa-challenge card">
      <ShieldCheck size={32} />
      <h1>二要素認証</h1>
      <p>認証アプリに表示されるコードを入力してください。</p>
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          <label>
            認証アプリ
            <select name="factor" defaultValue={factors[0]?.id}>
              {factors.map((f) => (
                <option value={f.id} key={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <CodeInput />
          <button className="primary wide" disabled={!factors.length}>
            {busy ? "確認中…" : "確認する"}
          </button>
        </fieldset>
      </form>
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      <p className="form-note">
        端末をなくした場合は、登録メールで本人確認して二要素認証をオフにし、利用を再開できます。
      </p>
      <button
        className="text-button"
        disabled={busy}
        onClick={() => setRecovering(true)}
      >
        認証アプリが使えない
      </button>
      <button
        className="text-button"
        disabled={busy}
        onClick={() => void onLogout()}
      >
        ログアウトして戻る
      </button>
    </main>
  );
}
export default function MfaSettings({
  csrf,
  onChanged,
  reenroll = false,
}: {
  reenroll?: boolean;
  csrf: string;
  onChanged: () => Promise<unknown>;
}) {
  const [factors, setFactors] = useState<Factor[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [pending, setPending] = useState<{
    id: string;
    secret: string;
    qr: string;
  } | null>(null);
  async function load() {
    const r = await fetch("/api/mfa", { cache: "no-store" });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    setFactors(d.factors);
    setRecoveryReady(d.recoveryReady === true);
  }
  useEffect(() => {
    let active = true;
    load()
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function perform(
    body: unknown,
    done: (d: {
      id: string;
      secret: string;
      qr: string;
      signedOut?: boolean;
      warning?: string;
    }) => void | Promise<void>,
  ) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const d = await request(csrf, body);
      await done(d);
      if (d.signedOut) await onChanged();
      else await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "接続できませんでした。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="card mfa-settings"
      aria-label="セキュリティ設定"
      aria-busy={busy}
    >
      <h2>
        <ShieldCheck size={19} /> セキュリティ
      </h2>
      {loading ? (
        <p role="status">読み込み中…</p>
      ) : (
        <>
          <p>
            二要素認証：
            <strong>
              {factors.some((f) => f.status === "verified") ? "有効" : "無効"}
            </strong>
          </p>
          <p className="form-note">
            有効にすると、次回のログインから認証アプリの確認コードが必要です。ログイン状態が続いている間は入力不要です。
          </p>
          <p className="form-note">
            端末紛失時は登録メールの復旧コードで本人確認して二要素認証をオフにでき、端末を用意できたら再設定できます。予備の認証アプリも登録できます（2つまで）。
          </p>
          {!recoveryReady && (
            <p className="form-note">
              メール復旧の準備中です。設定が完了するまで、新規の有効化はできません。
            </p>
          )}
          {reenroll && (
            <p role="status">
              本人確認ができました。新しい認証アプリを登録すると利用を再開できます。
            </p>
          )}
          <fieldset disabled={busy}>
            {factors.map((f) => (
              <div className="mfa-factor" key={f.id}>
                <strong>{f.name}</strong>{" "}
                <small>
                  {f.status === "verified" ? "登録済み" : "登録途中"}
                </small>
                {f.status === "verified" ? (
                  <details>
                    <summary>この認証アプリを解除</summary>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const form = e.currentTarget,
                          d = new FormData(form);
                        if (
                          !confirm(
                            "この認証アプリを解除しますか？解除後はログアウトします。",
                          )
                        )
                          return;
                        void perform(
                          {
                            action: "unenroll",
                            factorId: f.id,
                            password: d.get("password"),
                            code: d.get("code"),
                          },
                          () => form.reset(),
                        );
                      }}
                    >
                      <label>
                        現在のパスワード
                        <input
                          type="password"
                          name="password"
                          autoComplete="current-password"
                          maxLength={128}
                          required
                        />
                      </label>
                      <CodeInput />
                      <button className="secondary">確認して解除する</button>
                    </form>
                  </details>
                ) : (
                  <button
                    className="text-button"
                    type="button"
                    onClick={() =>
                      void perform({ action: "cancel", factorId: f.id }, () =>
                        setPending(null),
                      )
                    }
                  >
                    登録を取り消す
                  </button>
                )}
              </div>
            ))}
            {pending ? (
              <div className="mfa-enrollment">
                <p>
                  認証アプリでQRコードを読み取り、表示されたコードを入力してください。
                </p>
                {/* The upstream SVG is an image, never inserted as HTML. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pending.qr}
                  alt="認証アプリ登録用のQRコード"
                  width={220}
                  height={220}
                />
                <details>
                  <summary>同じスマホなど、QRコードを読み取れない場合</summary>
                  <p className="form-note">
                    認証アプリの手動登録で、名前をCoStep、種類を時間ベースに設定し、このキーを入力してください。他の人には共有しないでください。
                  </p>
                  <code className="mfa-secret">{pending.secret}</code>
                </details>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const d = new FormData(e.currentTarget);
                    void perform(
                      {
                        action: "verify",
                        factorId: pending.id,
                        code: d.get("code"),
                      },
                      async (result) => {
                        setPending(null);
                        setMessage(
                          result.warning || "二要素認証を有効にしました。",
                        );
                        if (reenroll) await onChanged();
                      },
                    );
                  }}
                >
                  <CodeInput />
                  <button className="primary">確認して登録を完了</button>
                </form>
              </div>
            ) : (
              factors.length < 2 && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget,
                      d = new FormData(form);
                    void perform(
                      {
                        action: "enroll",
                        password: d.get("password"),
                        name: d.get("name"),
                      },
                      (result) => {
                        form.reset();
                        setPending(result);
                      },
                    );
                  }}
                >
                  <label>
                    認証アプリの名前
                    <input
                      name="name"
                      placeholder="自分のスマホ、予備端末など"
                      maxLength={40}
                      required
                    />
                  </label>
                  <label>
                    現在のパスワード
                    <input
                      type="password"
                      name="password"
                      autoComplete="current-password"
                      maxLength={128}
                      required
                    />
                  </label>
                  <button className="secondary" disabled={!recoveryReady}>
                    {factors.some((f) => f.status === "verified")
                      ? "予備の認証アプリを追加"
                      : "二要素認証を設定する"}
                  </button>
                </form>
              )
            )}
          </fieldset>
        </>
      )}
      {busy && (
        <p role="status">
          <LoaderCircle className="spin" size={16} /> 処理中…
        </p>
      )}
      {message && (
        <p role="status" className="alert success">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
    </section>
  );
}

export function MfaRecovery({
  csrf,
  onSuccess,
  onBack,
}: {
  csrf: string;
  onSuccess: () => Promise<unknown>;
  onBack: () => void;
}) {
  const [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [waitUntil, setWaitUntil] = useState(0),
    [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!waitUntil) return;
    const timer = window.setInterval(
      () => setSeconds(Math.max(0, Math.ceil((waitUntil - Date.now()) / 1000))),
      250,
    );
    return () => clearInterval(timer);
  }, [waitUntil]);
  async function submit(
    event: FormEvent<HTMLFormElement>,
    action: "send" | "verify",
  ) {
    event.preventDefault();
    if (busy || (action === "send" && seconds > 0)) return;
    const form = event.currentTarget,
      values = new FormData(form);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/mfa/recovery", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({
          action,
          password: values.get("password"),
          ...(action === "verify" ? { code: values.get("code") } : {}),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      form.reset();
      setMessage(d.message);
      if (action === "send") {
        setSent(true);
        setWaitUntil(Date.now() + 60000);
        setSeconds(60);
      } else await onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "接続できませんでした。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mfa-challenge card">
      <h1>認証アプリの復旧</h1>
      <p>
        登録メールに復旧コードを送ります。本人確認後、二要素認証をオフにして利用を再開できます。
      </p>
      <p className="form-note">
        コードの確認が完了すると、古い認証アプリと既存のログイン状態は無効になります。新しい端末を用意できたら、設定から二要素認証を再び有効にしてください。
      </p>
      <fieldset disabled={busy}>
        <form onSubmit={(e) => void submit(e, "send")}>
          <label>
            現在のパスワード
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              maxLength={128}
              required
            />
          </label>
          <button className="secondary" disabled={seconds > 0}>
            {seconds > 0
              ? `再送まで${seconds}秒`
              : sent
                ? "復旧コードを送り直す"
                : "登録メールに復旧コードを送る"}
          </button>
        </form>
        {sent && (
          <form onSubmit={(e) => void submit(e, "verify")}>
            <label>
              現在のパスワード
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                maxLength={128}
                required
              />
            </label>
            <CodeInput />
            <button className="primary wide">確認して利用を再開</button>
          </form>
        )}
        <button type="button" className="text-button" onClick={onBack}>
          戻る
        </button>
        <p>
          <a href="/reset-password">パスワードも忘れた場合</a>
        </p>
      </fieldset>
      {busy && <p role="status">処理中…</p>}
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
    </section>
  );
}
