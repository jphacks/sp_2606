"use client";
import { useEffect, useState, useCallback, type FormEvent } from "react";
import {
  BookOpen,
  ArrowUpRight,
  Sparkles,
  Users,
  ChartNoAxesColumn,
  MessageCircle,
  Settings,
  LogOut,
  Plus,
  ShieldCheck,
  ChevronRight,
  Check,
  LoaderCircle,
  LockKeyhole,
  Leaf,
  Clock3,
  Send,
  Trash2,
  UserPlus,
  UserCheck,
  ArrowRight,
  RefreshCw,
  Bell,
  Blocks,
} from "lucide-react";
import MessagesPanel from "./messages-panel";
import CommentsPanel from "./comments-panel";
import {
  levels,
  visibilityLabels,
  type Profile,
  type Post,
  type Study,
} from "@/lib/validation";
type SessionInfo = {
  configured: boolean;
  signup_enabled: boolean;
  user: { id: string } | null;
  csrf: string;
  error?: string;
};
type Data = {
  me: Profile;
  profiles: Profile[];
  posts: Post[];
  studies: Study[];
  connections: { following: string[]; followers: string[]; blocked: string[] };
  counts: { following: number; followers: number };
  settings: { visibility: keyof typeof visibilityLabels; dm_policy: string };
  recommended: Profile[];
  owner: string;
  from: string;
  to: string;
};
const fields = [
  "Python",
  "JavaScript",
  "TypeScript",
  "AWS",
  "基本情報",
  "応用情報",
  "その他",
];
function Avatar({ name, small = false }: { name: string; small?: boolean }) {
  return (
    <span className={`avatar ${small ? "small" : ""}`}>{name.slice(0, 1)}</span>
  );
}
export default function StudyApp() {
  const [session, setSession] = useState<SessionInfo | null>(null),
    [data, setData] = useState<Data | null>(null),
    [view, setView] = useState("feed"),
    [mode, setMode] = useState("recommended"),
    [owner, setOwner] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [signup, setSignup] = useState(false),
    [composer, setComposer] = useState(false),
    [record, setRecord] = useState(false),
    [authLoading, setAuthLoading] = useState(true),
    [recordRequest, setRecordRequest] = useState(""),
    [dmPeer, setDmPeer] = useState("");
  useEffect(() => {
    const flag = new URLSearchParams(window.location.search).get("auth");
    if (flag === "failed")
      setError(
        "確認リンクからログインを完了できませんでした。別のブラウザでメール確認した場合は、確認後にメールアドレスとパスワードでログインしてください。",
      );
  }, []);
  const refreshSession = useCallback(async () => {
    const r = await fetch("/api/session", { cache: "no-store" });
    const s = await r.json();
    setSession(s);
    if (!r.ok) throw new Error(s.error);
    if (s.user && window.location.search.includes("auth=")) {
      window.history.replaceState(null, "", window.location.pathname);
      setError("");
    }
    return s as SessionInfo;
  }, []);
  useEffect(() => {
    refreshSession()
      .catch((e) => setError(e.message))
      .finally(() => setAuthLoading(false));
  }, [refreshSession]);
  const load = useCallback(async () => {
    if (!session?.user) return;
    const r = await fetch(
      `/api/data?mode=${mode}${owner ? "&owner=" + encodeURIComponent(owner) : ""}`,
      { cache: "no-store" },
    );
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    setData(d);
    if (d.me?.display_name === "新しい学習者") setView("settings");
  }, [session?.user, mode, owner]);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);
  async function mutate(action: string, body: unknown) {
    if (busy) return false;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/mutate/" + action, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": session?.csrf || "",
        },
        body: JSON.stringify(body),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作できませんでした。");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function authSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const f = new FormData(event.currentTarget);
    try {
      const r = await fetch("/api/auth/" + (signup ? "signup" : "login"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": session?.csrf || "",
        },
        body: JSON.stringify({
          email: f.get("email"),
          password: f.get("password"),
          ...(signup ? { visibility: f.get("visibility") } : {}),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setNotice(d.message || "ログインしました。");
      await refreshSession();
    } catch (e) {
      setError(e instanceof Error ? e.message : "接続できませんでした。");
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    try {
      const r = await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": session?.csrf || "",
        },
        body: "{}",
      });
      if (!r.ok) throw new Error();
      setData(null);
      setOwner("");
      await refreshSession();
      setNotice("ログアウトしました。");
    } catch {
      setError("ログアウトできませんでした。通信をご確認ください。");
    } finally {
      setBusy(false);
    }
  }
  const me = data?.me as Profile;
  const nav = [
    { id: "feed", label: "タイムライン", icon: BookOpen },
    { id: "study", label: "学習のきろく", icon: ChartNoAxesColumn },
    { id: "people", label: "仲間を見つける", icon: Users },
    { id: "messages", label: "メッセージ", icon: MessageCircle },
    { id: "settings", label: "プロフィールと設定", icon: Settings },
  ];
  if (!session?.user)
    return (
      <main className="auth-page">
        <section className="welcome">
          <a className="brand" href="/">
            <span className="brand-mark">
              <Leaf size={23} />
            </span>
            となりで学ぶ<span className="brand-en">STUDY CIRCLE</span>
          </a>
          <div className="welcome-copy">
            <span className="eyebrow">
              <span className="dot" /> SMALL STEPS, TOGETHER.
            </span>
            <h1>
              ひとりの一歩を、
              <br />
              ふたりの<span>原動力</span>に。
            </h1>
            <p>
              「まだ分からない」を、分かち合える。
              <br />
              同じ目線の仲間と、あなたのペースで学ぼう。
            </p>
          </div>
          <div className="illustration" aria-hidden="true">
            <div className="orbit one" />
            <div className="orbit two" />
            <div className="illus-book">
              <BookOpen size={66} strokeWidth={1.3} />
              <span>今日も、ひとつ前へ。</span>
            </div>
            <span className="floating badge-one">
              <Sparkles size={16} /> 小さな達成を重ねよう
            </span>
            <span className="floating badge-two">
              <Users size={17} /> 同じ目標の仲間がいる
            </span>
            <span className="float-dot fd1" />
            <span className="float-dot fd2" />
          </div>
          <div className="welcome-bottom">
            <ShieldCheck size={17} />
            あなたの公開範囲を、あなたが選べます。
          </div>
        </section>
        <section className="auth-form-area">
          <div className="auth-card">
            <span className="mini-label">YOUR LEARNING SPACE</span>
            <h2>{signup ? "はじめまして。" : "おかえりなさい。"}</h2>
            <p className="muted">
              {signup
                ? "今日の一歩から、つながっていこう。"
                : "今日の学びを、仲間と重ねよう。"}
            </p>
            <div className="auth-switch">
              <button
                onClick={() => {
                  setSignup(false);
                  setError("");
                }}
                className={!signup ? "active" : ""}
              >
                ログイン
              </button>
              <button
                onClick={() => {
                  setSignup(true);
                  setError("");
                }}
                className={signup ? "active" : ""}
              >
                新規登録
              </button>
            </div>
            {authLoading ? (
              <p className="info">
                <LoaderCircle className="spin" size={16} />
                接続を確認しています
              </p>
            ) : !session?.configured ? (
              <div className="setup-note">
                <strong>接続の準備中です</strong>
                <p>
                  Supabaseを接続すると、登録・ログインを利用できます。画面の準備は完了していますが、まだ登録や保存はできません。
                </p>
              </div>
            ) : null}
            <form onSubmit={authSubmit}>
              <label>
                メールアドレス
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  placeholder="you@example.com"
                  maxLength={254}
                />
              </label>
              <label>
                パスワード
                <input
                  type="password"
                  name="password"
                  autoComplete={signup ? "new-password" : "current-password"}
                  required
                  minLength={signup ? 12 : 1}
                  maxLength={128}
                  placeholder={signup ? "12文字以上" : "パスワードを入力"}
                />
              </label>
              {signup && (
                <>
                  <label>
                    文章と画像を見せる相手
                    <select name="visibility" defaultValue="mutual">
                      {Object.entries(visibilityLabels).map(([k, v]) => (
                        <option value={k} key={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="form-note">
                    つぶやきと画像に共通の設定です。基本プロフィールと学習時間はログイン済みの人に公開されます。
                  </p>
                  {!session?.signup_enabled && (
                    <p className="form-note">
                      登録受付は、メール確認・不正利用対策の設定後に開始します。
                    </p>
                  )}
                </>
              )}
              {error && (
                <p className="alert error" role="alert">
                  {error}
                </p>
              )}
              {notice && (
                <p className="alert success" role="status">
                  {notice}
                </p>
              )}
              <button
                className="primary wide"
                disabled={
                  busy ||
                  !session?.configured ||
                  (signup && !session.signup_enabled)
                }
              >
                {busy ? (
                  <LoaderCircle size={18} className="spin" />
                ) : signup ? (
                  "確認メールを送る"
                ) : (
                  "ログインする"
                )}
                <ArrowRight size={17} />
              </button>
            </form>
            <p><a href="/reset-password">パスワードを忘れた方・再設定する方</a></p>
            <p className="auth-foot">
              <LockKeyhole size={14} />
              メールアドレスは他のユーザーに公開されません。
            </p>
            <p className="dev-note">
              開発中の初期版です。画像・通知は順次対応します。
            </p>
          </div>
        </section>
      </main>
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a href="/" className="brand">
          <span className="brand-mark">
            <Leaf size={22} />
          </span>
          <span>
            となりで学ぶ<small>STUDY CIRCLE</small>
          </span>
        </a>
        <p className="nav-caption">MY LEARNING SPACE</p>
        <nav>
          {nav.map((n) => (
            <button
              key={n.id}
              className={view === n.id ? "nav-item active" : "nav-item"}
              onClick={() => {
                setView(n.id);
                setOwner("");
                setError("");
              }}
            >
              <n.icon size={19} />
              {n.label}
              {view === n.id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <button
          className="primary"
          onClick={() => {
            setRecordRequest(crypto.randomUUID());
            setRecord(true);
          }}
          disabled={!data}
        >
          <Plus size={19} />
          学習を記録する
        </button>
        <div className="sidebar-bottom">
          <div className="safe-note">
            <ShieldCheck size={18} />
            <p>
              自分のペースを、大切に。
              <br />
              <span>公開範囲は設定から変更できます。</span>
            </p>
          </div>
          <button className="account" onClick={() => setView("settings")}>
            <Avatar name={me?.display_name || "？"} small />
            <span>
              {me?.display_name || "読み込み中"}
              <small>{me?.field || "あなたのプロフィール"}</small>
            </span>
            <Settings size={16} />
          </button>
          <button className="logout" onClick={logout} disabled={busy}>
            <LogOut size={14} />
            ログアウト
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>
            <span className="dot" />
            あなたの小さな一歩が、誰かの力になる。
          </span>
          <button
            className="icon-button"
            onClick={() => setNotice("通知機能は現在準備中です。")}
            aria-label="通知の対応状況"
          >
            <Bell size={20} />
          </button>
        </header>
        <div className="mobile-nav">
          {nav.map((n) => (
            <button
              key={n.id}
              onClick={() => {
                setView(n.id);
                setOwner("");
              }}
              className={view === n.id ? "selected" : ""}
            >
              <n.icon size={18} />
              <span>{n.label.replace("プロフィールと", "")}</span>
            </button>
          ))}
        </div>
        <div className="content-wrap">
          <section className="main-content">
            <div className="page-heading">
              <div>
                <span className="eyebrow">
                  {view === "study"
                    ? "YOUR SMALL STEPS"
                    : view === "people"
                      ? "FIND YOUR PEOPLE"
                      : view === "settings"
                        ? "MAKE IT YOURS"
                        : "LEARN, SHARE, GROW"}
                </span>
                <h1>
                  {view === "study"
                    ? "学習のきろく"
                    : view === "people"
                      ? "同じ目線の、仲間たち。"
                      : view === "settings"
                        ? "あなたのプロフィール"
                        : "今日も、となりで。"}
                  <span className="heading-leaf">✳</span>
                </h1>
                <p>
                  {view === "study"
                    ? "積み重ねた時間は、ちゃんとあなたの力になる。"
                    : view === "people"
                      ? "近い分野やレベルから、一緒に学ぶ仲間を見つけよう。"
                      : view === "settings"
                        ? "公開する情報と、つながり方を選びましょう。"
                        : "小さな気づきも、つまずきも。学びの途中をシェアしよう。"}
                </p>
              </div>
              <button
                className="icon-button"
                aria-label="データを再取得"
                onClick={() => load().catch((e) => setError(e.message))}
              >
                <RefreshCw size={18} />
              </button>
            </div>
            {error && (
              <p role="alert" className="alert error">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="alert success">
                {notice}
                <button onClick={() => setNotice("")} aria-label="閉じる">
                  ×
                </button>
              </p>
            )}
            {!data ? (
              <div className="card empty">
                <LoaderCircle className="spin" />
                <h3>あなたの学びを読み込んでいます</h3>
                <p>長く続く場合は接続設定とDBの準備をご確認ください。</p>
              </div>
            ) : (
              <>
                {view === "feed" && (
                  <>
                    <button
                      className="composer-card"
                      onClick={() => setComposer(true)}
                    >
                      <Avatar name={me?.display_name || ""} />
                      <span>
                        今日は、どんな発見がありましたか？
                        <small>
                          <LockKeyhole size={12} />
                          {visibilityLabels[data.settings.visibility]}
                        </small>
                      </span>
                      <span className="compose-plus">
                        <Plus size={20} />
                      </span>
                    </button>
                    <div className="feed-tabs">
                      {[
                        ["recommended", "おすすめ"],
                        ["similar", "学習レベルが近い"],
                        ["following", "フォロー中"],
                      ].map(([k, v]) => (
                        <button
                          key={k}
                          onClick={() => setMode(k)}
                          className={mode === k ? "active" : ""}
                        >
                          {k === "recommended" && <Sparkles size={15} />} {v}
                        </button>
                      ))}
                    </div>
                    <div className="feed-list">
                      {data.posts.length === 0 ? (
                        <div className="card empty">
                          <BookOpen size={32} />
                          <h3>ここから、学びがつながる。</h3>
                          <p>
                            まだ表示できるつぶやきがありません。
                            <br />
                            最初の気づきを投稿したり、仲間をフォローしてみましょう。
                          </p>
                          <button
                            className="secondary"
                            onClick={() => setComposer(true)}
                          >
                            つぶやきを書く
                            <Plus size={16} />
                          </button>
                        </div>
                      ) : (
                        data.posts.map((p) => {
                          const a = data.profiles.find(
                            (x) => x.id === p.owner_id,
                          );
                          return (
                            <article className="post-card" key={p.id}>
                              <div className="post-head">
                                <Avatar name={a?.display_name || "学習者"} />
                                <div>
                                  <strong>{a?.display_name || "学習者"}</strong>
                                  <small>
                                    {a?.field} · {levels[a?.level || 0]}{" "}
                                    <span className="time">
                                      {new Date(p.created_at).toLocaleString(
                                        "ja-JP",
                                        {
                                          month: "short",
                                          day: "numeric",
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        },
                                      )}
                                    </span>
                                  </small>
                                </div>
                                {p.owner_id === me?.id && (
                                  <button
                                    className="icon-button"
                                    aria-label="つぶやきを削除"
                                    onClick={() => {
                                      if (
                                        confirm("このつぶやきを削除しますか？")
                                      )
                                        void mutate("delete-post", {
                                          id: p.id,
                                        });
                                    }}
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                )}
                              </div>
                              <p className="post-body">{p.body}</p>
                              <CommentsPanel
                                key={p.id + data.connections.blocked.join()}
                                postId={p.id}
                                userId={me.id}
                                csrf={session.csrf}
                                people={data.profiles}
                              />
                              <div className="post-footer">
                                <span>
                                  <BookOpen size={14} />
                                  学びのひとこと
                                </span>
                                <button
                                  onClick={() => {
                                    setOwner(p.owner_id);
                                    setView("study");
                                  }}
                                >
                                  学習のきろくを見る
                                  <ArrowUpRight size={14} />
                                </button>
                              </div>
                            </article>
                          );
                        })
                      )}
                    </div>
                  </>
                )}
                {view === "study" && (
                  <>
                    <div className="card study-card">
                      <div className="section-title">
                        <div>
                          <span className="mini-label">THIS WEEK</span>
                          <h2>
                            {owner && owner !== me.id
                              ? data.profiles.find((p) => p.id === owner)
                                  ?.display_name + "さんの学習時間"
                              : "あなたの1週間"}
                          </h2>
                        </div>
                        <span className="tag">ログイン済み全員に公開</span>
                      </div>
                      <div className="study-total">
                        <strong>
                          {Math.floor(
                            data.studies.reduce((a, b) => a + b.minutes, 0) /
                              60,
                          )}
                          <span>時間</span>
                          {data.studies.reduce((a, b) => a + b.minutes, 0) % 60}
                          <span>分</span>
                        </strong>
                        <span>一歩ずつ、積み重ねよう。</span>
                      </div>
                      <div className="chart">
                        {Array.from({ length: 7 }, (_, i) => {
                          const d = new Date(data.from + "T00:00:00Z");
                          d.setUTCDate(d.getUTCDate() + i);
                          const key = d.toISOString().slice(0, 10),
                            mins = data.studies
                              .filter((x) => x.study_date === key)
                              .reduce((a, b) => a + b.minutes, 0),
                            max = Math.max(
                              60,
                              ...data.studies.map((x) =>
                                data.studies
                                  .filter((y) => y.study_date === x.study_date)
                                  .reduce((a, b) => a + b.minutes, 0),
                              ),
                            );
                          return (
                            <div className="chart-col" key={key}>
                              <span className="chart-value">
                                {mins > 0 ? mins + "分" : ""}
                              </span>
                              <div className="bar-track">
                                <span
                                  className="bar"
                                  style={{
                                    height: `${Math.max(mins ? 3 : 0, (mins / max) * 100)}%`,
                                  }}
                                />
                              </div>
                              <span className="chart-label">
                                {d.getUTCMonth() + 1}/{d.getUTCDate()}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <p className="form-note">
                        この初期版は直近7日間を表示します。画像や文章はこのタブに含みません。
                      </p>
                    </div>
                    <div className="section-title">
                      <h2>日々のきろく</h2>
                      {(!owner || owner === me.id) && (
                        <button
                          className="text-button"
                          onClick={() => {
                            setRecordRequest(crypto.randomUUID());
                            setRecord(true);
                          }}
                        >
                          <Plus size={16} />
                          記録する
                        </button>
                      )}
                    </div>
                    {data.studies.length === 0 ? (
                      <div className="card empty">
                        <Clock3 size={30} />
                        <h3>最初の15分から。</h3>
                        <p>学んだ分野と時間を記録してみましょう。</p>
                      </div>
                    ) : (
                      data.studies.map((r) => (
                        <div className="record-row card" key={r.id}>
                          <span className="record-icon">
                            <BookOpen size={20} />
                          </span>
                          <div>
                            <strong>{r.field}</strong>
                            <small>{r.study_date}</small>
                          </div>
                          <span className="minutes">
                            {r.minutes}
                            <small>分</small>
                          </span>
                          {r.owner_id === me.id && (
                            <button
                              className="icon-button"
                              aria-label="学習記録を削除"
                              onClick={() => {
                                if (confirm("この記録を削除しますか？"))
                                  void mutate("delete-study", { id: r.id });
                              }}
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </>
                )}
                {view === "people" && (
                  <>
                    <div className="tip">
                      <Sparkles size={19} />
                      <span>
                        分野・自己申告のレベル・目標からおすすめしています。
                        <br />
                        <small>
                          DMや限定公開の文章は、おすすめに使用しません。
                        </small>
                      </span>
                    </div>
                    <div className="people-grid">
                      {data.recommended.length === 0 ? (
                        <div className="card empty">
                          <Users size={30} />
                          <h3>仲間を待っています。</h3>
                          <p>別のユーザーが登録すると、ここに表示されます。</p>
                        </div>
                      ) : (
                        data.recommended.map((p) => (
                          <div className="card person-card" key={p.id}>
                            <Avatar name={p.display_name} />
                            <h3>{p.display_name}</h3>
                            <div className="tag-list">
                              <span className="tag">{p.field}</span>
                              <span className="tag lilac">
                                {levels[p.level]}
                              </span>
                            </div>
                            <p>{p.goal || "自分のペースで学習中"}</p>
                            <button
                              className={
                                data.connections.following.includes(p.id)
                                  ? "secondary"
                                  : "primary"
                              }
                              disabled={busy}
                              onClick={() =>
                                void mutate("follow", {
                                  target: p.id,
                                  enabled: !data.connections.following.includes(
                                    p.id,
                                  ),
                                })
                              }
                            >
                              {data.connections.following.includes(p.id) ? (
                                <UserCheck size={16} />
                              ) : (
                                <UserPlus size={16} />
                              )}{" "}
                              {data.connections.following.includes(p.id)
                                ? "フォロー中"
                                : "フォローする"}
                            </button>
                            <button
                              className="text-button"
                              onClick={() => {
                                setDmPeer(p.id);
                                setView("messages");
                              }}
                            >
                              メッセージを送る
                            </button>
                            <div className="person-actions">
                              <button
                                onClick={() => {
                                  setOwner(p.id);
                                  setView("study");
                                }}
                              >
                                学習時間
                                <ArrowUpRight size={12} />
                              </button>
                              <button
                                onClick={() => {
                                  if (
                                    confirm(
                                      "ブロックするとお互いの投稿・学習実績が見えなくなり、フォローも解除されます。",
                                    )
                                  )
                                    void mutate("block", {
                                      target: p.id,
                                      enabled: true,
                                    });
                                }}
                              >
                                ブロック
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
                {view === "messages" && (
                  <MessagesPanel
                    userId={me.id}
                    csrf={session.csrf}
                    initialPeer={dmPeer}
                    notify={setNotice}
                  />
                )}
                {view === "settings" && (
                  <form
                    className="card settings-form"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      if (
                        f.get("visibility") !== data.settings.visibility &&
                        !confirm(
                          "公開範囲の変更は過去の文章にも適用されます。変更しますか？",
                        )
                      )
                        return;
                      const ok = await mutate("profile", {
                        display_name: f.get("display_name"),
                        field: f.get("field"),
                        level: Number(f.get("level")),
                        goal: f.get("goal"),
                        bio: f.get("bio"),
                        visibility: f.get("visibility"),
                        dm_policy: f.get("dm_policy"),
                        recommend: f.get("recommend") === "on",
                      });
                      if (ok)
                        setNotice("プロフィールと公開設定を保存しました。");
                    }}
                    key={me.id + data.settings.visibility}
                  >
                    <div className="section-title">
                      <h2>基本プロフィール</h2>
                      <span className="tag">ログイン済み全員に公開</span>
                    </div>
                    <div className="form-grid">
                      <label>
                        表示名
                        <input
                          name="display_name"
                          defaultValue={me.display_name}
                          required
                          maxLength={30}
                        />
                      </label>
                      <label>
                        学習分野
                        <select name="field" defaultValue={me.field}>
                          {fields.map((f) => (
                            <option key={f}>{f}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        習熟度（自己申告）
                        <select name="level" defaultValue={me.level}>
                          {levels.map((v, i) => (
                            <option key={i} value={i}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        目標
                        <input
                          name="goal"
                          defaultValue={me.goal}
                          maxLength={100}
                          placeholder="例：基本情報に合格する"
                        />
                      </label>
                    </div>
                    <label>
                      自己紹介
                      <textarea
                        name="bio"
                        defaultValue={me.bio}
                        maxLength={500}
                        rows={3}
                      />
                    </label>
                    <hr />
                    <h2>公開範囲とつながり</h2>
                    <label>
                      文章と画像を見せる相手
                      <select
                        name="visibility"
                        defaultValue={data.settings.visibility}
                      >
                        {Object.entries(visibilityLabels).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="form-note">
                      過去のつぶやきにも適用します。学習時間とプロフィールの公開範囲は変わりません。
                    </p>
                    <label>
                      DMの受信範囲
                      <select
                        name="dm_policy"
                        defaultValue={data.settings.dm_policy}
                      >
                        <option value="mutual">相互フォローのみ</option>
                        <option value="anyone">誰でも（リクエスト）</option>
                      </select>
                    </label>
                    <p className="form-note">
                      送信のたびに相手の最新設定を確認します。相互フォローを解除すると、過去の会話でも送信できなくなる場合があります。
                    </p>
                    <label className="check-label">
                      <input
                        type="checkbox"
                        name="recommend"
                        defaultChecked={me.recommend}
                      />
                      仲間のおすすめに自分を表示する
                    </label>
                    <button className="primary" disabled={busy}>
                      <Check size={17} />
                      変更を保存する
                    </button>
                    <hr />
                    <h2>ブロック中</h2>
                    <p><a href="/reset-password">パスワードを再設定する</a></p>
                    {data.connections.blocked.length ? (
                      data.connections.blocked.map((id) => (
                        <div className="blocked-row" key={id}>
                          <span>ブロックしたユーザー</span>
                          <button
                            type="button"
                            className="text-button"
                            onClick={() =>
                              void mutate("block", {
                                target: id,
                                enabled: false,
                              })
                            }
                          >
                            解除する
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="muted">ブロック中のユーザーはいません。</p>
                    )}
                  </form>
                )}
              </>
            )}
          </section>
          <aside className="right-column">
            <div className="card encouragement">
              <span className="mini-label">A LITTLE REMINDER</span>
              <Leaf size={26} />
              <h3>
                昨日の自分より、
                <br />
                ほんの少し先へ。
              </h3>
              <p>
                大きな成果じゃなくてもいい。
                <br />
                今日、学んだことを残そう。
              </p>
              <button
                onClick={() => {
                  setRecordRequest(crypto.randomUUID());
                  setRecord(true);
                }}
                disabled={!data}
              >
                今日の学びを記録
                <ChevronRight size={15} />
              </button>
            </div>
            {data && (
              <div className="card">
                <div className="section-title">
                  <h3>つながり</h3>
                  <Users size={17} />
                </div>
                <div className="counts">
                  <div>
                    <strong>{data.counts.following}</strong>
                    <span>フォロー</span>
                  </div>
                  <div>
                    <strong>{data.counts.followers}</strong>
                    <span>フォロワー</span>
                  </div>
                </div>
                <p className="form-note">
                  人数は公開、一覧は本人だけが確認できます。
                </p>
              </div>
            )}
            <div className="card mini-people">
              <div className="section-title">
                <h3>近い目線の仲間</h3>
                <Sparkles size={16} />
              </div>
              {data?.recommended.slice(0, 3).map((p) => (
                <button
                  className="mini-person"
                  key={p.id}
                  onClick={() => setView("people")}
                >
                  <Avatar name={p.display_name} small />
                  <span>
                    <strong>{p.display_name}</strong>
                    <small>
                      {p.field} · {levels[p.level]}
                    </small>
                  </span>
                  <Plus size={15} />
                </button>
              ))}
              {!data?.recommended.length && (
                <p className="muted">
                  プロフィールを整えて、
                  <br />
                  新しいつながりを待とう。
                </p>
              )}
              <button className="text-button" onClick={() => setView("people")}>
                仲間を見つける
                <ArrowRight size={14} />
              </button>
            </div>
            <p className="release-note">
              <Blocks size={14} />
              開発中の初期版
              <br />
              画像・通知・退会は未対応。実ユーザー公開前の安全確認は未完了です。
            </p>
            <p className="copyright">© 2026 Study Circle</p>
          </aside>
        </div>
      </div>
      {(composer || record) && (
        <div
          className="modal-backdrop"
          onClick={() => {
            if (!busy) {
              setComposer(false);
              setRecord(false);
            }
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="section-title">
              <h2 id="dialog-title">
                {record ? "今日の学びを記録" : "学びのひとこと"}
              </h2>
              <button
                className="icon-button"
                onClick={() => {
                  setComposer(false);
                  setRecord(false);
                }}
                aria-label="閉じる"
              >
                ×
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const ok = record
                  ? await mutate("study", {
                      field: f.get("field"),
                      date: f.get("date"),
                      minutes: Number(f.get("minutes")),
                      request_id: f.get("request_id"),
                    })
                  : await mutate("post", { body: f.get("body") });
                if (ok) {
                  setComposer(false);
                  setRecord(false);
                  setNotice(
                    record
                      ? "今日の一歩を記録しました。"
                      : "つぶやきを投稿しました。",
                  );
                }
              }}
            >
              {record ? (
                <>
                  <input
                    type="hidden"
                    name="request_id"
                    value={recordRequest}
                  />
                  <label>
                    学習分野
                    <select name="field" defaultValue={me?.field}>
                      {fields.map((f) => (
                        <option key={f}>{f}</option>
                      ))}
                    </select>
                  </label>
                  <div className="form-grid">
                    <label>
                      学習日
                      <input
                        name="date"
                        type="date"
                        defaultValue={new Date().toLocaleDateString("sv-SE")}
                        required
                      />
                    </label>
                    <label>
                      学習時間（分）
                      <input
                        name="minutes"
                        type="number"
                        min={1}
                        max={1440}
                        defaultValue={30}
                        required
                      />
                    </label>
                  </div>
                  <p className="form-note">
                    学習分野・日付・時間はログイン済み全員に公開されます。文章・画像は含みません。
                  </p>
                </>
              ) : (
                <>
                  <textarea
                    name="body"
                    maxLength={2000}
                    rows={6}
                    required
                    placeholder="学んだこと、つまずいたこと。あなたの言葉で。"
                    autoFocus
                  />
                  <p className="form-note">
                    <LockKeyhole size={13} />
                    公開範囲：
                    {data ? visibilityLabels[data.settings.visibility] : ""}
                    （全体設定）
                  </p>
                  <p className="form-note">
                    画像・タグは準備中です。まずはテキストで共有できます。
                  </p>
                </>
              )}
              {error && (
                <p className="alert error" role="alert">
                  {error}
                </p>
              )}
              <button className="primary wide" disabled={busy}>
                {busy ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <Send size={16} />
                )}{" "}
                {record ? "記録する" : "投稿する"}
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
