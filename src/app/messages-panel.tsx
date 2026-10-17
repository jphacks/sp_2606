"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  MessageCircle,
  Send,
  RefreshCw,
  Trash2,
  Check,
  X,
  ArrowLeft,
  LockKeyhole,
} from "lucide-react";
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
}: {
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
    [key, setKey] = useState("");
  const load = useCallback(async () => {
    const r = await fetch(
      "/api/messages" + (peer ? "?peer=" + encodeURIComponent(peer) : ""),
      { cache: "no-store" },
    );
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    setInbox(d.inbox);
    setMessages(d.messages || []);
    setStatus(d.status);
  }, [peer]);
  useEffect(() => {
    load().catch((e) => setError(e.message));
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
      <div className="card inbox">
        <div className="section-title">
          <h2>会話</h2>
          <button
            className="icon-button"
            aria-label="会話を更新"
            onClick={() => load().catch((e) => setError(e.message))}
          >
            <RefreshCw size={16} />
          </button>
        </div>
        {inbox.length === 0 && (
          <p className="muted">
            まだ会話がありません。ユーザーのプロフィールから送信できます。
          </p>
        )}
        {inbox.map((c) => (
          <div
            key={c.peer}
            className={"inbox-item " + (peer === c.peer ? "active" : "")}
          >
            <button
              className="profile-link"
              aria-label={c.display_name + "のプロフィール"}
              onClick={() => openProfile(c.peer)}
            >
              <span className="avatar small">{c.display_name.slice(0, 1)}</span>
            </button>
            <button
              className="text-button"
              onClick={() => {
                setPeer(c.peer);
                setKey(crypto.randomUUID());
                setError("");
              }}
            >
              {c.display_name}
              {c.incoming_status === "pending" && <small>リクエスト</small>}
            </button>
          </div>
        ))}
      </div>
      <div className="card conversation">
        {!peer ? (
          <div className="empty">
            <MessageCircle size={30} />
            <h3>メッセージ一覧</h3>
            <p>メッセージは当事者だけが閲覧できます。</p>
          </div>
        ) : (
          <>
            <div className="section-title">
              <button className="text-button" onClick={() => setPeer("")}>
                <ArrowLeft size={14} />
                一覧
              </button>
              <button
                className="text-button"
                onClick={() => openProfile(peer)}
                aria-label="相手のプロフィールを開く"
              >
                <strong>
                  {inbox.find((c) => c.peer === peer)?.display_name ||
                    "選択したユーザー"}
                </strong>
              </button>
              <LockKeyhole size={14} />
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
              {messages.length === 0 && (
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
                <button
                  className="primary"
                  disabled={!status?.can_send || busy}
                >
                  <Send size={15} />
                  送信する
                </button>
              </form>
            )}
            <p className="form-note">
              自動更新は未対応です。更新ボタンで新しいメッセージを取得します。
            </p>
          </>
        )}
      </div>
    </div>
  );
}
