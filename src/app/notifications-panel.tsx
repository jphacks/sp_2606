"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, X } from "lucide-react";
import CommentsPanel from "./comments-panel";
import { type Profile } from "@/lib/validation";
type Item = {
  kind: "comment" | "reaction" | "follow" | "message";
  id: string;
  actor: string;
  target: string;
  name: string;
  created_at: string;
  unread: boolean;
};
type List = { items: Item[]; unread: number; snapshot: string };
const labels = {
  comment: "が返信しました",
  reaction: "がいいねしました",
  follow: "からフォロー申請が届きました",
  message: "からメッセージが届きました",
};
export default function NotificationsPanel({
  csrf,
  userId,
  people,
  openProfile,
  onMessages,
  onConnections,
}: {
  csrf: string;
  userId: string;
  people: Profile[];
  openProfile: (id: string) => void;
  onMessages: (id: string) => void;
  onConnections: () => void;
}) {
  const [open, setOpen] = useState(false),
    [data, setData] = useState<List | null>(null),
    [error, setError] = useState(""),
    [post, setPost] = useState<{
      id: string;
      body: string;
      name: string;
    } | null>(null),
    [loading, setLoading] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const sequence = useRef(0);
  const lastLoad = useRef(0);
  const load = useCallback(async () => {
    if (Date.now() - lastLoad.current < 3000) return;
    lastLoad.current = Date.now();
    const version = ++sequence.current;
    try {
      const r = await fetch("/api/notifications", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (version === sequence.current) {
        setData(d);
        setError("");
      }
    } catch {
      if (version === sequence.current)
        setError("通知を取得できませんでした。");
    }
  }, []);
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30000);
    const focus = () => void load();
    window.addEventListener("focus", focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      sequence.current++;
    };
  }, [load]);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", close);
    };
  }, [open]);
  async function markRead() {
    if (!data || loading) return;
    setLoading(true);
    try {
      const r = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ until: data.snapshot }),
      });
      if (!r.ok) throw new Error();
      lastLoad.current = 0;
      await load();
    } catch {
      setError("既読にできませんでした。");
    } finally {
      setLoading(false);
    }
  }
  async function choose(item: Item) {
    setPost(null);
    setError("");
    if (item.kind === "message") {
      setOpen(false);
      onMessages(item.actor);
      return;
    }
    if (item.kind === "follow") {
      setOpen(false);
      onConnections();
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(
        "/api/notifications?post=" + encodeURIComponent(item.target),
        { cache: "no-store" },
      );
      const d = await r.json();
      if (!r.ok) throw new Error();
      if (!d) {
        setError("この投稿は削除されたか、現在は表示できません。");
        await load();
      } else setPost(d);
    } catch {
      setError("投稿を取得できませんでした。");
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <button
        className="icon-button notification-bell"
        onClick={() => {
          setOpen(true);
          setPost(null);
          void load();
        }}
        aria-label={`通知${data?.unread ? ` 未読${data.unread}件` : ""}`}
      >
        <Bell size={20} />
        {!!data?.unread && (
          <span className="notification-badge">
            {data.unread > 99 ? "99+" : data.unread}
          </span>
        )}
      </button>
      {open && (
        <div className="notification-backdrop" onClick={() => setOpen(false)}>
          <section
            className="notification-dialog card"
            ref={dialogRef}
            onKeyDown={(e) => {
              if (e.key !== "Tab") return;
              const buttons =
                dialogRef.current?.querySelectorAll<HTMLButtonElement>(
                  "button:not(:disabled), a[href], input:not(:disabled)",
                );
              if (!buttons?.length) return;
              const first = buttons[0],
                last = buttons[buttons.length - 1];
              if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
              } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
              }
            }}
            role="dialog"
            aria-modal="true"
            aria-label="通知"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="section-title">
              <h2>通知</h2>
              <button
                type="button"
                className="icon-button"
                aria-label="通知を閉じる"
                autoFocus
                onClick={() => setOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            {error && <p role="alert">{error}</p>}
            {post ? (
              <>
                <div className="notification-post-navigation">
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setPost(null)}
                  >
                    通知へ戻る
                  </button>
                </div>
                <div className="notification-post-content">
                  <p className="notification-post-author">
                    <strong>{post.name}</strong>
                  </p>
                  <p className="post-body">{post.body}</p>
                </div>
                <CommentsPanel
                  key={post.id}
                  postId={post.id}
                  userId={userId}
                  csrf={csrf}
                  people={people}
                  openProfile={(id) => {
                    setOpen(false);
                    openProfile(id);
                  }}
                />
              </>
            ) : (
              <>
                {!!data?.unread ? (
                  <>
                    <button
                      type="button"
                      className="text-button"
                      disabled={loading}
                      onClick={() => void markRead()}
                    >
                      {loading ? "更新中…" : "未読の印を消す"}
                    </button>
                    <p className="muted">
                      通知は残したまま、未読の印とベルの件数を消します。
                    </p>
                  </>
                ) : (
                  data && (
                    <p className="muted" role="status">
                      すべて確認済みです。
                    </p>
                  )
                )}
                {!data && !error && <p>読み込み中…</p>}
                {data && !data.items.length && <p>通知はありません。</p>}
                {data?.items.map((item) => (
                  <button
                    type="button"
                    className={`notification-item ${item.unread ? "is-unread" : ""}`}
                    key={item.kind + item.id}
                    disabled={loading}
                    onClick={() => void choose(item)}
                  >
                    <span>
                      <strong>{item.name}</strong>
                      {labels[item.kind]}
                    </span>
                    <time>
                      {new Date(item.created_at).toLocaleString("ja-JP")}
                    </time>
                  </button>
                ))}
                <p className="muted">
                  最新100件を表示します。未読数はこの範囲の件数です。
                </p>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
