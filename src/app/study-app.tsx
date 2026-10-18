"use client";
import Image from "next/image";
import DeleteAccountPanel from "./delete-account-panel";
import {
  useEffect,
  useState,
  useCallback,
  useRef,
  type FormEvent,
} from "react";
import {
  Heart,
  Eye,
  EyeOff,
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
import Avatar, { AvatarEditor } from "./profile-avatar";
import ProfileAttributesEditor from "./profile-attributes-editor";
import { PwaInstall } from "./pwa";
import MessagesPanel from "./messages-panel";
import CommentsPanel from "./comments-panel";
import LearningFieldsEditor from "./learning-fields-editor";
import GoalsEditor from "./goals-editor";
import FieldSearch from "./field-search";
import MfaSettings, { MfaChallenge, MfaRecovery } from "./mfa-panel";
import BackgroundBadge from "./background-badge";
import ActivityFields from "./activity-fields";
import { usePullRefresh } from "./use-pull-refresh";
import StudyDashboard from "./study-dashboard";
import { learningFieldLabel, learningFieldKind } from "@/lib/learning-catalog";
import { goalsSchema, profileGoalSummary } from "@/lib/goals";
import {
  fieldOptions,
  profileFields,
  profileSummary,
  fieldExperience,
  learningFieldsSchema,
  visibilityLabels,
  type Profile,
  type Post,
  type Study,
} from "@/lib/validation";
type SessionInfo = {
  configured: boolean;
  signup_enabled: boolean;
  mfa_required?: boolean;
  mfa_reenroll?: boolean;
  mfa_can_enroll?: boolean;
  mfa_factors?: { id: string; name: string }[];
  user: { id: string } | null;
  csrf: string;
  error?: string;
};
type Data = {
  me: Profile;
  profile?: Profile;
  profiles: Profile[];
  posts: (Post & {
    kind: "post" | "study";
    field: string | null;
    study_date: string | null;
    minutes: number | null;
    memo: string | null;
  })[];
  commentCounts: { post_id: string; total: number }[];
  reactions: { post_id: string; total: number; liked: boolean }[];
  studies: Study[];
  connections: {
    following: string[];
    followers: string[];
    blocked: string[];
    incoming: string[];
    outgoing: string[];
  };
  counts: { following: number; followers: number };
  settings: {
    visibility: keyof typeof visibilityLabels;
    dm_policy: string;
    profile_completed: boolean;
  };
  recommended: Profile[];
  owner: string;
  from: string;
  to: string;
};
const fields = fieldOptions;
export default function StudyApp() {
  const [session, setSession] = useState<SessionInfo | null>(null),
    [data, setData] = useState<Data | null>(null),
    [view, setView] = useState("feed"),
    [mode, setMode] = useState("similar"),
    [searchField, setSearchField] = useState(""),
    [owner, setOwner] = useState(""),
    [studyDay, setStudyDay] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [signup, setSignup] = useState(false),
    [showPassword, setShowPassword] = useState(false),
    [composer, setComposer] = useState(false),
    [record, setRecord] = useState(false),
    [authLoading, setAuthLoading] = useState(true),
    [recordRequest, setRecordRequest] = useState(""),
    [recordDate, setRecordDate] = useState(""),
    [dmPeer, setDmPeer] = useState("");
  const composerCard = useRef<HTMLButtonElement>(null);
  const [composerVisible, setComposerVisible] = useState(true);
  useEffect(() => {
    const card = composerCard.current;
    if (view !== "feed" || searchField || !card) {
      setComposerVisible(false);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setComposerVisible(entry.isIntersecting),
      { rootMargin: "-64px 0px 0px 0px", threshold: 0 },
    );
    observer.observe(card);
    return () => observer.disconnect();
  }, [view, searchField, !!data]);
  const [saveState, setSaveState] = useState<"saving" | "saved" | null>(null);
  const saveDialog = useRef<HTMLDivElement>(null);
  const saveFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!saveState) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    saveDialog.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      if (saveFocus.current?.isConnected) saveFocus.current.focus();
    };
  }, [saveState !== null]);
  useEffect(() => {
    if (saveState !== "saved") return;
    const timer = window.setTimeout(() => setSaveState(null), 1600);
    return () => window.clearTimeout(timer);
  }, [saveState]);
  const loadVersion = useRef(0);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  function openStudy(id: string, day = "") {
    setData(null);
    setOwner(id);
    setStudyDay(day);
    setSearchField("");
    setView("study");
    setError("");
  }
  function openProfile(id: string) {
    setData(null);
    setOwner(id);
    setView("profile");
    setError("");
  }
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
    const version = ++loadVersion.current;
    const r = await fetch(
      `/api/data?mode=${mode}${owner ? "&owner=" + encodeURIComponent(owner) : ""}${view === "profile" ? "&scope=profile" : ""}`,
      { cache: "no-store" },
    );
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    if (version !== loadVersion.current) return;
    setData(d);
    setError("");
    if (!d.settings.profile_completed) setView("settings");
  }, [session?.user, mode, owner, view]);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);
  const [searchRefresh, setSearchRefresh] = useState(0);
  const refreshFeed = async () => {
    try {
      await load();
      setSearchRefresh((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新できませんでした。");
    }
  };
  const pullRefresh = usePullRefresh(
    view === "feed" && !!data && !composer && !record,
    refreshFeed,
  );
  async function mutate(action: string, body: unknown) {
    if (busy) return false;
    if (action === "post" && !data?.settings.profile_completed) {
      setComposer(false);
      setView("settings");
      setError("プロフィールと公開範囲を先に保存してください。");
      return false;
    }
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
  function reactionButton(
    post: Post,
    reactions = data?.reactions,
    refresh?: () => void,
  ) {
    const reaction = reactions?.find((item) => item.post_id === post.id);
    const liked = reaction?.liked ?? false;
    return (
      <button
        type="button"
        className={"reaction-button" + (liked ? " is-liked" : "")}
        aria-label={liked ? "いいねを取り消す" : "いいねする"}
        aria-pressed={liked}
        disabled={busy}
        onClick={() =>
          void mutate("reaction", { post: post.id, enabled: !liked }).then(
            (ok) => {
              if (ok) refresh?.();
            },
          )
        }
      >
        <Heart size={17} fill={liked ? "currentColor" : "none"} />
        <span>いいね</span>
        <span>{reaction?.total ?? 0}</span>
      </button>
    );
  }
  function renderActivity(
    p: Data["posts"][number],
    a: Profile | undefined,
    counts = data?.commentCounts,
    reactions = data?.reactions,
    refresh?: () => void,
  ) {
    if (!data || !session) return null;
    return (
      <article className="post-card" key={`${p.kind}-${p.id}`}>
        <div className="post-head">
          <button
            className="profile-link"
            aria-label={(a?.display_name || "学習者") + "のプロフィール"}
            onClick={() => openProfile(p.owner_id)}
          >
            <Avatar id={a?.id} name={a?.display_name || "学習者"} />
          </button>
          <div>
            <button
              className="text-button"
              onClick={() => openProfile(p.owner_id)}
            >
              <strong>
                {a?.display_name || "学習者"}
                <BackgroundBadge attributes={a?.attributes} />
              </strong>
            </button>
            <div className="post-field-meta">
              {a && <ActivityFields key={a.id} fields={profileFields(a)} />}
            </div>
          </div>
          <div className="post-head-actions">
            <time className="time post-created-at" dateTime={p.created_at}>
              {new Date(p.created_at).toLocaleString("ja-JP", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
            {p.kind !== "study" && p.owner_id === data.me.id && (
              <button
                className="icon-button"
                aria-label="つぶやきを削除"
                onClick={() => {
                  if (confirm("このつぶやきを削除しますか？"))
                    void mutate("delete-post", { id: p.id }).then((ok) => {
                      if (ok) refresh?.();
                    });
                }}
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        </div>
        {p.kind === "study" ? (
          <div className="study-feed-card">
            <div className="study-feed-heading">
              <span className="study-feed-label">
                <ChartNoAxesColumn size={16} />
                学習記録
              </span>
              <button
                className="text-button"
                onClick={() => openStudy(p.owner_id, p.study_date || "")}
              >
                学習記録を見る <ArrowUpRight size={14} />
              </button>
            </div>
            <div className="study-feed-summary">
              <strong>{learningFieldLabel(p.field || "")}</strong>
              <span>{p.minutes}分</span>
            </div>
            {p.memo && <p className="study-feed-memo">{p.memo}</p>}
          </div>
        ) : (
          <>
            <p className="post-body">{p.body}</p>
            <CommentsPanel
              key={p.id + data.connections.blocked.join()}
              postId={p.id}
              initialTotal={counts?.find((c) => c.post_id === p.id)?.total ?? 0}
              actionsBefore={reactionButton(p, reactions, refresh)}
              actionsAfter={
                <button
                  className="text-button"
                  onClick={() => openStudy(p.owner_id)}
                >
                  学習記録を見る <ArrowUpRight size={14} />
                </button>
              }
              userId={data.me.id}
              csrf={session.csrf}
              people={data.profiles}
              openProfile={openProfile}
            />
          </>
        )}
      </article>
    );
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
    { id: "study", label: "学習記録", icon: ChartNoAxesColumn },
    { id: "people", label: "つながり", icon: Users },
    { id: "messages", label: "トーク", icon: MessageCircle },
    { id: "settings", label: "プロフィールと設定", icon: Settings },
  ];
  if (session?.mfa_reenroll && session.mfa_can_enroll)
    return (
      <main className="mfa-challenge">
        <MfaSettings csrf={session.csrf} onChanged={refreshSession} reenroll />
      </main>
    );
  if (session?.mfa_reenroll)
    return (
      <MfaRecovery
        csrf={session.csrf}
        onSuccess={refreshSession}
        onBack={() => void logout()}
      />
    );
  if (session?.mfa_required)
    return (
      <MfaChallenge
        csrf={session.csrf}
        factors={session.mfa_factors || []}
        onSuccess={refreshSession}
        onLogout={logout}
      />
    );
  if (!session?.user)
    return (
      <main className="auth-page auth-redesign">
        <section className="auth-intro" aria-label="CoStepについて">
          <a className="auth-brand" href="/" aria-label="CoStep ホーム">
            <span className="costep-logo">
              <Image
                src="/costep-logo.png"
                alt="CoStep"
                fill
                sizes="230px"
                priority
              />
            </span>
          </a>
          <div className="auth-intro-content">
            <span className="auth-kicker">学習記録・交流SNS</span>
            <h1>
              学習を記録。
              <br />
              仲間と共有。
            </h1>
            <ul className="auth-features">
              <li>
                <span className="auth-feature-icon">
                  <ChartNoAxesColumn size={22} />
                </span>
                <div>
                  <strong>学習記録</strong>
                  <p>時間を記録して、グラフで振り返る</p>
                </div>
              </li>
              <li>
                <span className="auth-feature-icon">
                  <Users size={22} />
                </span>
                <div>
                  <strong>仲間を探す</strong>
                  <p>学習分野・経験・目標が近い人を見つける</p>
                </div>
              </li>
              <li>
                <span className="auth-feature-icon">
                  <MessageCircle size={22} />
                </span>
                <div>
                  <strong>つぶやき・DM</strong>
                  <p>進捗や疑問を共有する</p>
                </div>
              </li>
            </ul>
          </div>
          <div className="auth-intro-footer">
            <span className="auth-status-dot" />
            CoStep<span>学習のためのコミュニティ</span>
          </div>
          <div className="auth-step-art" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
        </section>
        <section className="auth-form-area">
          <div className="auth-card">
            <div className="auth-card-heading">
              <span className="auth-card-eyebrow">CoStep</span>
              <h2>{signup ? "アカウントを作成" : "ログイン"}</h2>
              <p>
                {signup
                  ? "メールアドレスで登録できます。"
                  : "登録したメールアドレスでログインできます。"}
              </p>
            </div>
            <div className="auth-switch">
              <button
                type="button"
                aria-pressed={!signup}
                onClick={() => {
                  setShowPassword(false);
                  setSignup(false);
                  setError("");
                }}
                className={!signup ? "active" : ""}
              >
                ログイン
              </button>
              <button
                type="button"
                aria-pressed={signup}
                onClick={() => {
                  setShowPassword(false);
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
              <div className="auth-password-field">
                <label htmlFor="auth-password">パスワード</label>
                <span className="auth-password-input">
                  <input
                    id="auth-password"
                    type={showPassword ? "text" : "password"}
                    name="password"
                    autoComplete={signup ? "new-password" : "current-password"}
                    required
                    minLength={signup ? 12 : 1}
                    maxLength={128}
                    placeholder={signup ? "12文字以上" : "パスワードを入力"}
                  />
                  <button
                    type="button"
                    aria-label={
                      showPassword ? "パスワードを隠す" : "パスワードを表示"
                    }
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                  </button>
                </span>
              </div>
              {signup && (
                <p className="form-note">
                  メール確認後、プロフィールと公開範囲を設定します。初期の文章公開範囲は承認済みフォロワーのみです。
                </p>
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
            <p className="auth-recovery">
              <a href="/reset-password">パスワードを忘れた方</a>
            </p>
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
      <aside className="sidebar" inert={saveState !== null}>
        <p className="nav-caption">メニュー</p>
        <nav>
          {nav.map((n) => (
            <button
              key={n.id}
              className={view === n.id ? "nav-item active" : "nav-item"}
              onClick={() => {
                setView(n.id);
                setDmPeer("");
                setStudyDay("");
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
            setRecordDate("");
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
            <p>公開範囲は設定から変更できます。</p>
          </div>
          <button className="account" onClick={() => setView("settings")}>
            <Avatar id={me?.id} name={me?.display_name || "？"} small />
            <span>
              {me?.display_name || "読み込み中"}
              <small>
                {me
                  ? profileFields(me)
                      .map((item) => learningFieldLabel(item.field))
                      .join(" / ")
                  : "あなたのプロフィール"}
              </small>
            </span>
            <Settings size={16} />
          </button>
          <button className="logout" onClick={logout} disabled={busy}>
            <LogOut size={14} />
            ログアウト
          </button>
        </div>
      </aside>
      <div className="workspace" inert={saveState !== null}>
        <header className="topbar">
          <a href="/" className="topbar-brand" aria-label="CoStep ホーム">
            <span className="costep-logo">
              <Image
                src="/costep-logo.png"
                alt="CoStep"
                fill
                sizes="136px"
                priority
              />
            </span>
          </a>
          <div className="topbar-actions">
            <button
              className="icon-button"
              onClick={() => setNotice("通知機能は現在準備中です。")}
              aria-label="通知の対応状況"
            >
              <Bell size={20} />
            </button>
            <button className="topbar-logout" onClick={logout} disabled={busy}>
              <LogOut size={16} />
              ログアウト
            </button>
          </div>
        </header>
        <div className="mobile-nav">
          {nav.map((n) => (
            <button
              key={n.id}
              onClick={() => {
                setView(n.id);
                setDmPeer("");
                setStudyDay("");
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
            {view === "feed" &&
              (pullRefresh.distance > 0 || pullRefresh.refreshing) && (
                <div
                  className="pull-refresh-status"
                  role="status"
                  style={{
                    height: pullRefresh.refreshing ? 44 : pullRefresh.distance,
                  }}
                >
                  <RefreshCw
                    size={17}
                    className={pullRefresh.refreshing ? "spin" : ""}
                  />
                  {pullRefresh.refreshing
                    ? "更新中…"
                    : pullRefresh.distance >= 50.4
                      ? "離して更新"
                      : "下に引っ張って更新"}
                </div>
              )}
            <div className="page-heading">
              <div>
                <h1>
                  {view === "profile"
                    ? "プロフィール"
                    : view === "study"
                      ? "学習記録"
                      : view === "people"
                        ? "つながり"
                        : view === "settings"
                          ? "プロフィールと設定"
                          : view === "messages"
                            ? "トーク"
                            : "タイムライン"}
                </h1>
              </div>
              <button
                className={
                  view === "feed"
                    ? "icon-button desktop-feed-refresh"
                    : "icon-button"
                }
                aria-label="データを再取得"
                onClick={() => void refreshFeed()}
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
                <h3>読み込み中…</h3>
                <p>長く続く場合は接続設定とDBの準備をご確認ください。</p>
              </div>
            ) : (
              <>
                {view === "feed" && (
                  <FieldSearch
                    refreshKey={searchRefresh}
                    field={searchField}
                    onField={setSearchField}
                    renderActivity={renderActivity}
                    onCompose={() => setComposer(true)}
                    showCompose={!composerVisible}
                  />
                )}
                {((view === "feed" && !searchField) || view === "profile") && (
                  <>
                    {view === "profile" && data.profile && (
                      <div className="card profile-details">
                        <Avatar
                          id={data.profile.id}
                          name={data.profile.display_name}
                        />
                        <h2>
                          {data.profile.display_name}
                          <BackgroundBadge
                            attributes={data.profile.attributes}
                          />
                        </h2>
                        <p>{profileSummary(data.profile)}</p>
                        {profileGoalSummary(data.profile) && (
                          <p>目標：{profileGoalSummary(data.profile)}</p>
                        )}
                        <p className="post-body">
                          {data.profile.bio || "自己紹介は未設定です。"}
                        </p>
                        {data.profile.attributes && (
                          <dl className="profile-attributes-summary">
                            <div>
                              <dt>文系・理系</dt>
                              <dd>
                                {data.profile.attributes.background ===
                                "humanities"
                                  ? "文系"
                                  : "理系"}
                              </dd>
                            </div>
                            {data.profile.attributes.university && (
                              <div>
                                <dt>所属大学</dt>
                                <dd>{data.profile.attributes.university}</dd>
                              </div>
                            )}
                            {data.profile.attributes.faculty && (
                              <div>
                                <dt>学部</dt>
                                <dd>{data.profile.attributes.faculty}</dd>
                              </div>
                            )}
                            {data.profile.attributes.work && (
                              <div>
                                <dt>業務</dt>
                                <dd>{data.profile.attributes.work}</dd>
                              </div>
                            )}
                            {data.profile.attributes.prefecture && (
                              <div>
                                <dt>居住地</dt>
                                <dd>{data.profile.attributes.prefecture}</dd>
                              </div>
                            )}
                          </dl>
                        )}
                        <p>
                          フォロー {data.counts.following} · フォロワー{" "}
                          {data.counts.followers}
                        </p>
                        {data.profile.id !== me.id && (
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() =>
                              void mutate("follow", {
                                target: data.profile!.id,
                                enabled:
                                  !data.connections.following.includes(
                                    data.profile!.id,
                                  ) &&
                                  !data.connections.outgoing.includes(
                                    data.profile!.id,
                                  ),
                              })
                            }
                          >
                            {data.connections.following.includes(
                              data.profile.id,
                            )
                              ? "フォロー解除"
                              : data.connections.outgoing.includes(
                                    data.profile.id,
                                  )
                                ? "申請を取り消す"
                                : "フォロー申請"}
                          </button>
                        )}
                        <div className="profile-destination-actions">
                          <button
                            className="secondary"
                            onClick={() => openStudy(data.profile!.id)}
                          >
                            <ChartNoAxesColumn size={18} aria-hidden="true" />
                            学習記録を見る
                          </button>
                          {data.profile.id !== me.id && (
                            <button
                              className="secondary"
                              onClick={() => {
                                setDmPeer(data.profile!.id);
                                setOwner("");
                                setView("messages");
                              }}
                            >
                              <MessageCircle size={18} aria-hidden="true" />
                              メッセージを送る
                            </button>
                          )}
                        </div>
                        <p className="form-note">
                          この人の閲覧可能なつぶやき・学習記録を表示します。
                        </p>
                      </div>
                    )}
                    {view === "feed" && (
                      <>
                        <button
                          ref={composerCard}
                          className="composer-card"
                          onClick={() => setComposer(true)}
                        >
                          <Avatar id={me?.id} name={me?.display_name || ""} />
                          <span>
                            投稿する
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
                            ["similar", "おすすめ"],
                            ["following", "フォロー中"],
                            ["recommended", "最新投稿"],
                            ["mine", "自分の投稿"],
                          ].map(([k, v]) => (
                            <button
                              key={k}
                              onClick={() => setMode(k)}
                              className={mode === k ? "active" : ""}
                            >
                              {k === "similar" && <Sparkles size={15} />} {v}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    <div className="feed-list">
                      {data.posts.length === 0 ? (
                        <div className="card empty">
                          <BookOpen size={32} />
                          <h3>投稿はありません。</h3>
                          <p>
                            まだ表示できるつぶやき・学習記録がありません。
                            <br />
                            公開範囲によって表示されない投稿があります。
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
                        data.posts.map((p) =>
                          renderActivity(
                            p,
                            data.profiles.find((a) => a.id === p.owner_id),
                          ),
                        )
                      )}
                    </div>
                  </>
                )}
                {view === "study" && (
                  <StudyDashboard
                    key={(owner || me.id) + studyDay}
                    initialDay={studyDay}
                    owner={owner || me.id}
                    userId={me.id}
                    name={
                      data.profiles.find((p) => p.id === (owner || me.id))
                        ?.display_name || "ユーザー"
                    }
                    refreshKey={data.studies}
                    onAdd={(day) => {
                      setRecordDate(day);
                      setRecordRequest(crypto.randomUUID());
                      setRecord(true);
                    }}
                    onDelete={(id) => mutate("delete-study", { id })}
                  />
                )}
                {view === "people" && (
                  <>
                    <div className="tip">
                      <Sparkles size={19} />
                      <span>
                        学習分野・現在の経験・目標・学習期間の近さからおすすめしています。
                        <br />
                        <small>
                          DMや限定公開の文章は、おすすめに使用しません。
                        </small>
                      </span>
                    </div>
                    <div className="card follow-requests">
                      <h2>届いたフォロー申請</h2>
                      {data.connections.incoming.length === 0 && (
                        <p className="muted">申請はありません。</p>
                      )}
                      {data.connections.incoming.map((id) => (
                        <div className="request-row" key={id}>
                          <button
                            className="text-button"
                            onClick={() => openProfile(id)}
                          >
                            {data.profiles.find((p) => p.id === id)
                              ?.display_name || "プロフィールを見る"}
                          </button>
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() =>
                              void mutate("follow-respond", {
                                target: id,
                                enabled: true,
                              })
                            }
                          >
                            承認
                          </button>
                          <button
                            className="text-button"
                            disabled={busy}
                            onClick={() =>
                              void mutate("follow-respond", {
                                target: id,
                                enabled: false,
                              })
                            }
                          >
                            拒否
                          </button>
                        </div>
                      ))}
                      <p className="form-note">
                        承認しても自動でフォローバックはしません。
                      </p>
                    </div>
                    <div className="people-grid">
                      {data.recommended.length === 0 ? (
                        <div className="card empty">
                          <Users size={30} />
                          <h3>おすすめユーザーはいません。</h3>
                          <p>別のユーザーが登録すると、ここに表示されます。</p>
                        </div>
                      ) : (
                        data.recommended.map((p) => (
                          <div className="card person-card" key={p.id}>
                            <button
                              className="profile-link"
                              aria-label={p.display_name + "のプロフィール"}
                              onClick={() => openProfile(p.id)}
                            >
                              <Avatar id={p.id} name={p.display_name} />
                            </button>
                            <h3>
                              <button
                                className="text-button"
                                onClick={() => openProfile(p.id)}
                              >
                                {p.display_name}
                                <BackgroundBadge attributes={p.attributes} />
                              </button>
                            </h3>
                            <div className="tag-list">
                              {profileFields(p).map((item) => (
                                <span className="tag" key={item.field}>
                                  {learningFieldLabel(item.field)} ·{" "}
                                  {fieldExperience(item)}
                                </span>
                              ))}
                            </div>
                            <p>{profileGoalSummary(p) || "目標未設定"}</p>
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
                                  enabled:
                                    !data.connections.following.includes(
                                      p.id,
                                    ) &&
                                    !data.connections.outgoing.includes(p.id),
                                })
                              }
                            >
                              {data.connections.following.includes(p.id) ? (
                                <UserCheck size={16} />
                              ) : (
                                <UserPlus size={16} />
                              )}{" "}
                              {data.connections.following.includes(p.id)
                                ? "フォロー解除"
                                : data.connections.outgoing.includes(p.id)
                                  ? "申請を取り消す"
                                  : "フォロー申請"}
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
                              <button onClick={() => openStudy(p.id)}>
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
                    initialPeerName={
                      data.profiles.find((p) => p.id === dmPeer)
                        ?.display_name || ""
                    }
                    notify={setNotice}
                    openProfile={openProfile}
                  />
                )}
                {view === "settings" && (
                  <>
                    <MfaSettings
                      csrf={session.csrf}
                      onChanged={async () => {
                        setData(null);
                        await refreshSession();
                      }}
                    />
                    <form
                      className="card settings-form"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (busy || saveState) return;
                        const f = new FormData(e.currentTarget);
                        if (
                          f.get("visibility") !== data.settings.visibility &&
                          !confirm(
                            "公開範囲の変更は過去の文章にも適用されます。変更しますか？",
                          )
                        )
                          return;
                        const learningFields = learningFieldsSchema.safeParse(
                          JSON.parse(String(f.get("learning_fields") || "[]")),
                        );
                        if (!learningFields.success) {
                          setError(
                            "学習分野を1つ以上選び、経験を入力してください。",
                          );
                          return;
                        }
                        const goals = goalsSchema.safeParse(
                          JSON.parse(String(f.get("goals") || "[]")),
                        );
                        if (!goals.success) {
                          setError(
                            "目標の開始月・達成目標月と、技術の到達レベルを確認してください。",
                          );
                          return;
                        }
                        saveFocus.current =
                          document.activeElement instanceof HTMLElement
                            ? document.activeElement
                            : null;
                        setSaveState("saving");
                        const ok = await mutate("profile", {
                          attributes: {
                            background: f.get("background"),
                            university: f.get("university"),
                            faculty: f.get("faculty"),
                            work: f.get("work"),
                            prefecture: f.get("prefecture"),
                          },
                          display_name: f.get("display_name"),
                          learning_fields: learningFields.data,
                          goals: goals.data,
                          bio: f.get("bio"),
                          visibility: f.get("visibility"),
                          dm_policy: f.get("dm_policy"),
                          recommend: f.get("recommend") === "on",
                        });
                        setSaveState(ok ? "saved" : null);
                        if (ok) {
                          if (!data.settings.profile_completed) {
                            setOwner("");
                            setView("feed");
                          }
                        }
                      }}
                      key={
                        me.id +
                        data.settings.visibility +
                        JSON.stringify(me.learning_fields)
                      }
                    >
                      {!data.settings.profile_completed && (
                        <p className="form-note">
                          最初にプロフィールと文章の公開範囲を設定してください。保存後に投稿できます。
                        </p>
                      )}
                      <PwaInstall />
                      <div className="section-title">
                        <h2>基本プロフィール</h2>
                        <span className="tag">ログイン済み全員に公開</span>
                      </div>
                      <ProfileAttributesEditor initial={me.attributes} />
                      <AvatarEditor
                        id={me.id}
                        name={me.display_name}
                        csrf={session?.csrf || ""}
                      />
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
                      </div>
                      <LearningFieldsEditor
                        key={JSON.stringify(profileFields(me))}
                        initialFields={profileFields(me)}
                      />
                      <GoalsEditor
                        key={JSON.stringify(me.goals || [])}
                        initialGoals={me.goals || []}
                      />
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
                        過去のつぶやき・学習メモにも適用します。「フォロワーのみ」は承認済みのフォロワーが閲覧できます。フォローバックは不要です。学習時間とプロフィールの公開範囲は変わりません。
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
                        おすすめユーザーに自分を表示する
                      </label>
                      <button className="primary" disabled={busy}>
                        <Check size={17} />
                        変更を保存する
                      </button>
                      <hr />
                      <h2>ブロック中</h2>
                      <p>
                        <a href="/reset-password">パスワードを再設定する</a>
                      </p>
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
                        <p className="muted">
                          ブロック中のユーザーはいません。
                        </p>
                      )}
                    </form>
                    <DeleteAccountPanel csrf={session?.csrf || ""} />
                  </>
                )}
              </>
            )}
          </section>
          <aside className="right-column">
            <div className="card encouragement">
              <h3>学習記録</h3>
              <p>学習分野・日付・時間を保存します。</p>
              <button
                onClick={() => {
                  setRecordDate("");
                  setRecordRequest(crypto.randomUUID());
                  setRecord(true);
                }}
                disabled={!data}
              >
                学習を記録
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
                <h3>おすすめユーザー</h3>
                <Sparkles size={16} />
              </div>
              {data?.recommended.slice(0, 3).map((p) => (
                <button
                  className="mini-person"
                  key={p.id}
                  onClick={() => openProfile(p.id)}
                >
                  <Avatar id={p.id} name={p.display_name} small />
                  <span>
                    <strong>
                      {p.display_name}
                      <BackgroundBadge attributes={p.attributes} />
                    </strong>
                    <small>{profileSummary(p)}</small>
                  </span>
                  <Plus size={15} />
                </button>
              ))}
              {!data?.recommended.length && (
                <p className="muted">おすすめユーザーはいません。</p>
              )}
              <button className="text-button" onClick={() => setView("people")}>
                ユーザーを探す
                <ArrowRight size={14} />
              </button>
            </div>
            <p className="release-note">
              <Blocks size={14} />
              開発中の初期版
              <br />
              画像・通知・退会は未対応。実ユーザー公開前の安全確認は未完了です。
            </p>
            <p className="copyright">© 2026 CoStep</p>
          </aside>
        </div>
      </div>
      {saveState && (
        <div className="settings-save-backdrop">
          <div
            className="settings-save-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={
              saveState === "saving" ? "設定を保存中" : "設定を保存しました"
            }
            tabIndex={-1}
            ref={saveDialog}
            onKeyDown={(e) => {
              if (e.key === "Escape" && saveState === "saved")
                setSaveState(null);
            }}
          >
            <div role="status" aria-live="polite" aria-atomic="true">
              {saveState === "saving" ? (
                <LoaderCircle size={32} className="spin" aria-hidden="true" />
              ) : (
                <Check size={32} aria-hidden="true" />
              )}
              <strong>
                {saveState === "saving" ? "保存中…" : "保存しました"}
              </strong>
            </div>
          </div>
        </div>
      )}
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
              <h2 id="dialog-title">{record ? "学習を記録" : "つぶやき"}</h2>
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
                      memo: f.get("memo") || "",
                      request_id: f.get("request_id"),
                    })
                  : await mutate("post", { body: f.get("body") });
                if (ok) {
                  setComposer(false);
                  setRecord(false);
                  setNotice(
                    record
                      ? "学習時間を保存しました。"
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
                      {[
                        ...new Set([
                          ...(me
                            ? profileFields(me).map((item) => item.field)
                            : []),
                          ...fields,
                        ]),
                      ].map((f) => (
                        <option key={f} value={f}>
                          {learningFieldLabel(f)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="form-grid">
                    <label>
                      学習日
                      <input
                        name="date"
                        type="date"
                        defaultValue={
                          recordDate || new Date().toLocaleDateString("sv-SE")
                        }
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
                  <label>
                    学習メモ（任意）
                    <textarea
                      name="memo"
                      maxLength={500}
                      rows={3}
                      placeholder="学んだこと、次に取り組むことなど（500文字まで）"
                    />
                  </label>
                  <p className="form-note">
                    学習分野・日付・時間はログイン済み全員に公開されます。
                    メモの公開範囲：
                    {data ? visibilityLabels[data.settings.visibility] : ""}
                    （つぶやきと共通）
                  </p>
                </>
              ) : (
                <>
                  <textarea
                    name="body"
                    maxLength={2000}
                    rows={6}
                    required
                    placeholder="投稿内容を入力"
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
