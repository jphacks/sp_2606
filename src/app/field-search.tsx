"use client";

import { useEffect, useState } from "react";
import { Search, X, Plus } from "lucide-react";
import ProfileAvatar from "./profile-avatar";
import {
  learningFieldKey,
  learningFieldLabel,
  searchLearningFields,
} from "@/lib/learning-catalog";

type Result = {
  id: string;
  owner_id: string;
  display_name: string;
  body?: string;
  created_at?: string;
  study_date?: string;
  minutes?: number;
  field?: string;
  kind?: "post" | "study";
  memo?: string | null;
};
export default function FieldSearch({
  field,
  onField,
  onProfile,
  onStudy,
  onCompose,
  showCompose,
}: {
  showCompose: boolean;
  onCompose: () => void;
  field: string;
  onField: (field: string) => void;
  onProfile: (id: string) => void;
  onStudy: (id: string, day?: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const candidates = query.trim() ? searchLearningFields(query) : [];
  useEffect(() => {
    if (!field) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setResults([]);
    void fetch(`/api/search?field=${encodeURIComponent(field)}&kind=posts`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "検索できませんでした。");
        if (!controller.signal.aborted) setResults(data.results);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [field]);
  return (
    <section className={`field-search${field ? " has-results" : ""}`} aria-label="分野で検索">
      <div className="card field-search-box">
        <div className="feed-search-toolbar">
        <label className="field-search-label">
          <Search size={18} aria-hidden="true" />
          <span className="visually-hidden">分野で検索</span>
          <input
            type="search"
            value={query}
            maxLength={100}
            placeholder="Python、AWS、基本情報など"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {showCompose && <button type="button" className="toolbar-compose" aria-label="つぶやきを投稿する" onClick={onCompose}><Plus size={22} aria-hidden="true" /></button>}
        </div>
        {query.trim() && (
          <>
            <p className="form-note" aria-live="polite">
              候補 {candidates.length}件
            </p>
            <ul className="goal-search-results" aria-label="検索する分野の候補">
              {candidates.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onField(learningFieldKey(item));
                      setQuery("");
                    }}
                  >
                    {item.label}
                    <small>
                      {item.kind === "certification"
                        ? "資格・認定"
                        : "技術・学習テーマ"}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
            {!candidates.length && (
              <p>該当する分野がありません。別名や略称でも検索できます。</p>
            )}
          </>
        )}
        {field && (
          <div className="section-title">
            <h2>{learningFieldLabel(field)}</h2>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                onField("");
                setQuery("");
              }}
            >
              <X size={16} />
              検索を解除
            </button>
          </div>
        )}
      </div>
      {field && (
        <>
          <p className="form-note">
            この分野を登録している人のタイムラインを、新着順で最大20件表示します。
          </p>
          {loading ? (
            <p role="status">検索中…</p>
          ) : error ? (
            <p role="alert" className="alert error">
              {error}
            </p>
          ) : (
            <div className="feed-list" aria-label="分野の検索結果">
              {!results.length && (
                <div className="card empty">表示できる結果はありません。</div>
              )}
              {results.map((r) => (
                <article className="post-card" key={`${r.kind}-${r.id}`}>
                  <button
                    type="button"
                    className="text-button search-post-author"
                    aria-label={`${r.display_name}のプロフィール`}
                    onClick={() => onProfile(r.owner_id)}
                  >
                    <ProfileAvatar id={r.owner_id} name={r.display_name} />
                    <strong>{r.display_name}</strong>
                  </button>
                  {r.kind !== "study" ? (
                    <>
                      <small>
                        {new Date(r.created_at!).toLocaleString("ja-JP")}
                      </small>
                      <p className="search-post-body">{r.body}</p>
                    </>
                  ) : (
                    <>
                      <p>
                        {learningFieldLabel(r.field || field)}
                      </p>
                      <strong>{r.minutes}分</strong>
                      {r.memo && <p className="search-post-body">{r.memo}</p>}
                      <button
                        className="secondary"
                        onClick={() => onStudy(r.owner_id, r.study_date)}
                      >
                        学習記録を見る
                      </button>
                    </>
                  )}
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
