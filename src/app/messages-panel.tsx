"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ChevronRight,
  Send,
  RefreshCw,
  Trash2,
  Check,
  X,
  ArrowLeft,
} from "lucide-react";
import ProfileAvatar from "./profile-avatar";
type Message = {
  id: string;
  sender: string;
  recipient: string;
  body: string | null;
  deleted: boolean;
  created_at: string;
};
type Inbox = {
  id: string;
  peer: string;
  display_name: string;
  incoming_status: string | null;
};
type Status = {
  can_contact: boolean;
  can_send: boolean;
  mutual: boolean;
  outgoing_status: string | null;
  incoming_status: string | null;
  attempts: number;
};
export default function MessagesPanel({
  userId,
  csrf,
  initialPeer,
  notify,
  openProfile,
  initialPeerName = "",
}: {
  initialPeerName?: string;
  userId: string;
  csrf: string;
  initialPeer: string;
  notify: (message: string) => void;
  openProfile: (id: string) => void;
}) {
  const [inbox, setInbox] = useState<Inbox[]>([]),
    [peer, setPeer] = useState(initialPeer),
    [messages, setMessages] = useState<Message[]>([]),
    [status, setStatus] = useState<Status | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [key, setKey] = useState(""),
    [loading, setLoading] = useState(true);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const r = await fetch(
        "/api/messages" + (peer ? "?peer=" + encodeURIComponent(peer) : ""),
        { cache: "no-store", signal },
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (signal?.aborted) return;
      setInbox(d.inbox);
      setMessages(d.messages || []);
      setStatus(d.status);
    },
    [peer],
  );
  useEffect(() => {
    const controller = new AbortController();
    setMessages([]);
    setStatus(null);
    setError("");
    setLoading(true);
    void load(controller.signal)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [load]);
  useEffect(() => {
    setPeer(initialPeer);
    setKey(crypto.randomUUID());
  }, [initialPeer]);
  async function operation(action: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/mutate/" + action, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作できませんでした。");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form);
    if (
      await operation("dm-send", {
        target: peer,
        body: f.get("body"),
        request_id: key,
      })
    ) {
      form.reset();
      setKey(crypto.randomUUID());
      notify("メッセージを送信しました。");
    }
  }
  return (
    <div className="messages-layout">
      {!peer && (
        <div className="card inbox">
          <div className="section-title">
            <span className="visually-hidden">会話相手</span>
            <button
              className="icon-button"
              aria-label="会話を更新"
              onClick={() => load().catch((e) => setError(e.message))}
            >
              <RefreshCw size={16} />
            </button>
          </div>
          {error && (
            <p role="alert" className="alert error">
              {error}
            </p>
          )}
          {loading && <p role="status">読み込み中…</p>}
          {!loading && !error && inbox.length === 0 && (
            <p className="muted">
              まだ会話がありません。ユーザーのプロフィールから送信できます。
            </p>
          )}
          {inbox.map((c) => (
            <button
              type="button"
              key={c.peer}
              className="inbox-item conversation-list-item"
              onClick={() => {
                setPeer(c.peer);
                setKey(crypto.randomUUID());
                setError("");
              }}
            >
              <ProfileAvatar id={c.peer} name={c.display_name} />
              <span className="conversation-list-name">
                <strong>{c.display_name}</strong>
                {c.incoming_status === "pending" && (
                  <small>メッセージリクエスト</small>
                )}
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
      {peer && (
        <div className="card conversation" key={peer}>
          <div className="section-title">
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                setPeer("");
                setError("");
              }}
            >
              <ArrowLeft size={14} />
              一覧
            </button>
            <button
              className="text-button"
              onClick={() => openProfile(peer)}
              aria-label="相手のプロフィールを開く"
            >
              <ProfileAvatar
                id={peer}
                name={
                  inbox.find((c) => c.peer === peer)?.display_name ||
                  initialPeerName ||
                  "学習者"
                }
                small
              />
              <strong>
                {inbox.find((c) => c.peer === peer)?.display_name ||
                  initialPeerName ||
                  "選択したユーザー"}
              </strong>
            </button>
            <button
              className="icon-button"
              aria-label="メッセージを更新"
              disabled={loading || busy}
              onClick={() => load().catch((e) => setError(e.message))}
            >
              <RefreshCw size={16} />
            </button>
          </div>
          {error && (
            <p className="alert error" role="alert">
              {error}
            </p>
          )}
          {status?.incoming_status === "pending" && (
            <div className="request-box">
              <p>メッセージリクエストが届いています。</p>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  operation("dm-respond", { target: peer, enabled: true })
                }
              >
                <Check size={14} />
                承認
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  operation("dm-respond", { target: peer, enabled: false })
                }
              >
                <X size={14} />
                拒否
              </button>
            </div>
          )}
          <div className="message-history">
            {loading && <p role="status">読み込み中…</p>}
            {!loading && messages.length === 0 && (
              <p className="muted">メッセージはありません。</p>
            )}
            {[...messages].reverse().map((m) => (
              <div
                key={m.id}
                className={"message " + (m.sender === userId ? "mine" : "")}
              >
                <p className={m.deleted ? "deleted" : ""}>
                  {m.deleted ? "メッセージを削除しました" : m.body}
                </p>
                <small>
                  {new Date(m.created_at).toLocaleString("ja-JP", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {m.sender === userId && !m.deleted && (
                    <button
                      className="icon-button"
                      aria-label="このメッセージを削除"
                      disabled={busy}
                      onClick={() => {
                        if (confirm("双方の画面から本文を削除しますか？"))
                          void operation("dm-delete", { id: m.id });
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </small>
              </div>
            ))}
          </div>
          {status && !status.can_send ? (
            <p className="form-note">
              {status.outgoing_status === "pending"
                ? "承認待ちです。承認前の追加送信はできません。"
                : status.attempts >= 2 && !status.mutual
                  ? "申請は初回を含め2回までです。"
                  : "受信設定・相互関係・ブロック等により、現在は送信できません。"}
            </p>
          ) : (
            <form onSubmit={submit}>
              <textarea
                name="body"
                rows={3}
                maxLength={2000}
                required
                placeholder="メッセージを入力"
                disabled={!status || busy}
              />
              <p className="form-note">
                相手の受信設定が適用されます。非相互の場合、承認前1件・申請は合計2回までです。
              </p>
              <button className="primary" disabled={!status?.can_send || busy}>
                <Send size={15} />
                送信する
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
