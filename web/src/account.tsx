import { createContext, useContext, useEffect, useState, useRef, type ReactNode, type FormEvent } from "react";
import { clearTrendCache } from "./utils/trendCache";
import { Layers3, LockKeyhole, UserRound, KeyRound, LogOut } from "lucide-react";

type AccountState = { initialized: boolean; authenticated: boolean; username: string | null; guest_mode?: boolean };
const AccountContext = createContext<{ username: string; guestMode: boolean; logout: () => Promise<void> } | null>(null);
const EVENT_KEY = "keeps.account-event";

export async function accountRequest(path: string, body?: unknown) {
  const res = await fetch(`/api/auth/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", "X-Keeps-Request": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(typeof error.detail === "string" ? error.detail : "请检查输入内容后重试");
  }
  return res.status === 204 ? undefined : res.json();
}

export function accountChanged(notice?: string) {
  try { if (notice) sessionStorage.setItem("keeps.account-notice", notice); } catch { /* Storage is optional. */ }
  try { localStorage.setItem(EVENT_KEY, `${Date.now()}-${Math.random()}`); } catch { /* Still notify this tab. */ }
  window.dispatchEvent(new Event("keeps-auth-refresh"));
}

export function useAccount() {
  const value = useContext(AccountContext);
  if (!value) throw new Error("Account unavailable");
  return value;
}

export function AccountGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AccountState | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const authenticatedUser = useRef<string | null>(null);
  useEffect(() => {
    let live = true;
    let sequence = 0;
    const refresh = async () => {
      const current = ++sequence;
      try {
        const message = sessionStorage.getItem("keeps.account-notice");
        if (message) { setNotice(message); sessionStorage.removeItem("keeps.account-notice"); }
      } catch { /* Login does not require browser storage. */ }
      try {
        const next = await accountRequest("status");
        if (live && current === sequence) {
          if (!next.authenticated || (authenticatedUser.current && authenticatedUser.current !== next.username)) void clearTrendCache();
          authenticatedUser.current = next.authenticated ? next.username : null;
          setState(next); setError("");
        }
      } catch (e) {
        if (live && current === sequence) { setError((e as Error).message); setState(null); }
      }
    };
    const expired = () => {
      void clearTrendCache();
      authenticatedUser.current = null;
      setState(previous => previous ? { ...previous, authenticated: false, username: null } : null);
      setNotice("登录已失效，请重新登录");
      void refresh();
    };
    const storage = (event: StorageEvent) => { if (event.key === EVENT_KEY) { void clearTrendCache(); setState(null); void refresh(); } };
    const changed = () => { void clearTrendCache(); setState(null); void refresh(); };
    void refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", storage);
    window.addEventListener("keeps-auth-refresh", changed);
    window.addEventListener("keeps-auth-expired", expired);
    return () => {
      live = false;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", storage);
      window.removeEventListener("keeps-auth-refresh", changed);
      window.removeEventListener("keeps-auth-expired", expired);
    };
  }, []);
  if (!state) return <main className="account-page"><div className="account-card"><h1>有物</h1><p role="status">{error || "正在连接你的空间…"}</p>{error && <button className="btn primary" onClick={() => accountChanged()}>重新连接</button>}</div></main>;
  if (!state.authenticated) return <Login state={state} notice={notice} onSuccess={() => { setNotice(""); accountChanged(); }} />;
  return <AccountContext.Provider key={`${state.username}:${!!state.guest_mode}`} value={{ username: state.username!, guestMode: !!state.guest_mode, logout: async () => {
    await accountRequest("logout", {});
    await clearTrendCache();
    setNotice("已退出登录");
    accountChanged();
  } }}>{children}</AccountContext.Provider>;
}

function Login({ state, notice, onSuccess }: { state: AccountState; notice: string; onSuccess: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const guestMode = !!state.guest_mode;
  const setup = !state.initialized;
  useEffect(() => { document.title = `${setup ? "设置账号" : "登录"} · 有物`; }, [setup]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (setup && password !== confirmation) { setError("两次输入的密码不一致"); return; }
    setBusy(true); setError("");
    try { await accountRequest(setup ? "setup" : "login", { username: username.trim(), password }); onSuccess(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return <main className="account-page"><section className="account-card">
    <div className="account-brand"><Layers3 size={22} /><span>有物</span></div>
    <h1>{setup ? "开启你的个人空间" : "欢迎回来"}</h1>
    <p className="muted">{setup ? "设置一个账号，保护本机保存的资产与照片。已有数据会完整保留。" : guestMode ? "输入 guest 即可进入共享体验空间。" : "登录，继续整理你的物品。"}</p>
    <form className="account-form" onSubmit={submit}>
      <label>账号<input autoComplete="username" maxLength={64} required value={username} onChange={e => setUsername(e.target.value)} /></label>
      {!guestMode && <label>密码<input type="password" autoComplete={setup ? "new-password" : "current-password"} minLength={10} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} /></label>}
      {setup && <><span className="muted small">至少 10 个字符，可以使用密码管理器生成。</span><label>确认密码<input type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label></>}
      {error && <p role="alert" className="account-error">{error}</p>}
      {!error && notice && <p role="status" className="muted">{notice}</p>}
      <button className="btn primary block" disabled={busy || !username.trim()}>{busy ? "请稍候…" : setup ? "创建账号并进入" : "登录"}</button>
    </form>
    <p className="account-footer"><LockKeyhole size={13} /> 数据保存在当前部署设备</p>
  </section></main>;
}

export function AccountSettings() {
  const { username, guestMode, logout } = useAccount();
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const change = async (e: FormEvent) => {
    e.preventDefault();
    if (next !== confirmation) { setError("两次输入的新密码不一致"); return; }
    setBusy(true); setError("");
    try { await accountRequest("password", { current_password: current, new_password: next }); accountChanged("密码已修改，请使用新密码登录"); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return <><div className="section-label">账号与登录</div><section className="card list-card">
    <AccountField icon={<UserRound size={16} />} label="当前账号"><strong>{username}</strong></AccountField>
    {!guestMode && <AccountField icon={<KeyRound size={16} />} label="登录密码"><button className="link" onClick={() => { setEditing(!editing); setError(""); setCurrent(""); setNext(""); setConfirmation(""); }}>{editing ? "取消修改" : "修改密码"}</button></AccountField>}
    {editing && <form className="account-form account-password" onSubmit={change}>
      <input autoComplete="username" value={username} readOnly hidden />
      <label>当前密码<input type="password" autoComplete="current-password" maxLength={128} required value={current} onChange={e => setCurrent(e.target.value)} /></label>
      <label>新密码<input type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={next} onChange={e => setNext(e.target.value)} /></label>
      <label>确认新密码<input type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>
      <p className="muted small">至少 10 个字符。修改后所有设备都需要重新登录。</p>
      <button className="btn primary" disabled={busy}>{busy ? "正在保存…" : "保存新密码"}</button>
    </form>}
    {error && <p role="alert" className="account-error account-password">{error}</p>}
    <AccountField icon={<LogOut size={16} />} label="退出当前设备"><button className="link" disabled={busy} onClick={async () => {
      if (!window.confirm("确定退出登录？本地资产数据会保留。")) return;
      setBusy(true); setError("");
      try { await logout(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    }}>退出登录</button></AccountField>
  </section></>;
}

function AccountField({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return <div className="field setting-row"><span className="setting-label"><span className="list-icon" aria-hidden="true">{icon}</span>{label}</span>{children}</div>;
}
