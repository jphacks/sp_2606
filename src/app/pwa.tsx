"use client";
import { useEffect, useState } from "react";
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
let pendingInstall: InstallEvent | null = null;
export function PwaRegistration() {
  useEffect(() => {
    // Do not intercept Next.js development/HMR traffic.
    if (
      process.env.NODE_ENV !== "production" ||
      !window.isSecureContext ||
      !("serviceWorker" in navigator)
    )
      return;
    const ready = (event: Event) => {
      event.preventDefault();
      pendingInstall = event as InstallEvent;
    };
    const installed = () => {
      pendingInstall = null;
    };
    window.addEventListener("beforeinstallprompt", ready);
    window.addEventListener("appinstalled", installed);
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => {
        /* The website still works without installation. */
      });
    return () => {
      window.removeEventListener("beforeinstallprompt", ready);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);
  return null;
}
export function PwaInstall() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");
    const sync = () =>
      setInstalled(
        media.matches ||
          Boolean(
            (navigator as Navigator & { standalone?: boolean }).standalone,
          ),
      );
    const ready = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallEvent);
    };
    const done = () => {
      setInstalled(true);
      setPrompt(null);
    };
    setPrompt(pendingInstall);
    sync();
    media.addEventListener("change", sync);
    window.addEventListener("beforeinstallprompt", ready);
    window.addEventListener("appinstalled", done);
    return () => {
      media.removeEventListener("change", sync);
      window.removeEventListener("beforeinstallprompt", ready);
      window.removeEventListener("appinstalled", done);
    };
  }, []);
  return (
    <section className="pwa-install" aria-label="ホーム画面に追加">
      <h2>ホーム画面に追加</h2>
      {installed ? (
        <p>アプリ表示で利用中です。</p>
      ) : (
        <>
          {prompt && (
            <button
              type="button"
              className="secondary"
              onClick={async () => {
                setError("");
                try {
                  await prompt.prompt();
                  await prompt.userChoice;
                  pendingInstall = null;
                  setPrompt(null);
                } catch {
                  setError(
                    "ブラウザのメニューからホーム画面に追加してください。",
                  );
                }
              }}
            >
              CoStepを追加する
            </button>
          )}
          <p>
            iPhone：Safariの共有メニューから「ホーム画面に追加」。
            <br />
            Android・PC：ブラウザのメニューから「アプリをインストール」または「ホーム画面に追加」。
          </p>
        </>
      )}
      <p className="form-note">
        学習記録やトークの利用にはインターネット接続が必要です。
      </p>
      {error && <p role="status">{error}</p>}
    </section>
  );
}
