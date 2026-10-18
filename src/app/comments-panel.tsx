"use client";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { MessageCircle, Send, Trash2, RefreshCw } from "lucide-react";
import ProfileAvatar from "./profile-avatar";
import { fieldExperience, type Profile } from "@/lib/validation";
import { learningFieldLabel, learningFieldKind } from "@/lib/learning-catalog";
type Comment = {
  id: string;
  owner_id: string;
  body: string;
  created_at: string;
  author?: Profile;
};
export default function CommentsPanel({
  postId,
  userId,
  csrf,
  people,
  openProfile,
  initialTotal = 0,
  actionsBefore,
  actionsAfter,
}: {
  initialTotal?: number;
  actionsBefore?: ReactNode;
  actionsAfter?: ReactNode;
  postId: string;
  userId: string;
  csrf: string;
  people: Profile[];
  openProfile: (id: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [comments, setComments] = useState<Comment[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [total, setTotal] = useState(initialTotal);
  useEffect(() => {
    setTotal(initialTotal);
  }, [initialTotal]);
  async function load() {
    const r = await fetch("/api/comments?post=" + encodeURIComponent(postId), {
      cache: "no-store",
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    setComments(d.comments);
    setTotal(d.total);
  }
  async function toggle() {
    setError("");
    setOpen(!open);
    if (!open)
      try {
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "取得できませんでした。");
      }
  }
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
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form);
    if (await operation("comment", { post: postId, body: f.get("body") }))
      form.reset();
  }
  return (
    <div className="comments-panel">
      <div className="post-action-row">
        {actionsBefore}
        <button className="text-button" onClick={toggle} aria-expanded={open}>
          <MessageCircle size={14} />
          {open ? "閉じる" : "返信"} <span>{total}</span>
        </button>
        {actionsAfter}
      </div>
      {open && (
        <>
          <div className="section-title">
            <small>返信は親の投稿と同じ相手に公開されます。</small>
            <button
              className="icon-button"
              aria-label="返信を更新"
              onClick={() => load().catch((e) => setError(e.message))}
            >
              <RefreshCw size={13} />
            </button>
          </div>
          {error && (
            <p className="alert error" role="alert">
              {error}
            </p>
          )}
          {comments.map((c) => (
            <div className="comment" key={c.id}>
              <div>
                <button
                  type="button"
                  className="text-button comment-author"
                  aria-label={`${(c.author || people.find((p) => p.id === c.owner_id))?.display_name || "学習者"}のプロフィール`}
                  onClick={() => openProfile(c.owner_id)}
                >
                  <ProfileAvatar
                    id={c.owner_id}
                    name={
                      (c.author || people.find((p) => p.id === c.owner_id))
                        ?.display_name || "学習者"
                    }
                    small
                  />
                  <strong>
                    {(c.author || people.find((p) => p.id === c.owner_id))
                      ?.display_name || "学習者"}
                  </strong>
                </button>
                <div className="post-field-meta">
                  {(
                    c.author?.learning_fields ||
                    people.find((p) => p.id === c.owner_id)?.learning_fields ||
                    []
                  ).map((item) => (
                    <span
                      className={`post-field-badge field-kind-${learningFieldKind(item.field)}`}
                      key={item.field}
                    >
                      <span>{learningFieldLabel(item.field)}</span>
                      <span className="post-field-level">
                        {fieldExperience(item)}
                      </span>
                    </span>
                  ))}
                </div>
                <small>
                  {new Date(c.created_at).toLocaleDateString("ja-JP")}
                </small>
                {c.owner_id === userId && (
                  <button
                    className="icon-button"
                    aria-label="返信を削除"
                    disabled={busy}
                    onClick={() => {
                      if (confirm("この返信を削除しますか？"))
                        void operation("comment-delete", { id: c.id });
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
              <p>{c.body}</p>
            </div>
          ))}
          {comments.length === 0 && (
            <p className="muted">まだ返信がありません。</p>
          )}
          <form onSubmit={send}>
            <textarea
              name="body"
              maxLength={500}
              rows={2}
              placeholder="返信内容を入力"
              required
            />
            <button className="secondary" disabled={busy}>
              <Send size={13} />
              返信する
            </button>
          </form>
        </>
      )}
    </div>
  );
}
