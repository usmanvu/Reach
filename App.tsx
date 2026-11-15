import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase, isSupabaseConfigured } from "./supabaseClient";
import { Search, Plus, Download, Pencil, Trash2, X, Minus, ExternalLink, Copy, Check, ChevronDown, ChevronUp, GripVertical, AlertTriangle, Sun, Moon, Monitor } from "lucide-react";

type ContactValue = { name: string; channel: string; outreachDate: string; contactDetails: string; link: string; replied: boolean; followedUp: boolean; notes: string; createdAt: string; updatedAt: string; };
type Contact = { id: string; value: ContactValue };
type ThemeMode = "system" | "light" | "dark";
type Filter = "all" | "to-reach" | "replied" | "followed" | "today" | "needs-follow-up";
type TemplateItem = { id: string; title: string; text: string };
type SocialAccount = { id: string; platform: string; value: string; custom?: boolean };
type ProfileValue = { name: string; socials: SocialAccount[] };
const FIXED_PLATFORMS = ["Instagram", "Facebook", "Threads", "X", "LinkedIn", "Website / Portfolio"];
function defaultSocials(): SocialAccount[] {
  return FIXED_PLATFORMS.map((platform, i) => ({ id: `social-${i}`, platform, value: "", custom: false }));
}
const DEFAULT_PROFILE: ProfileValue = { name: "", socials: defaultSocials() };
function normalizeSocials(raw: unknown): SocialAccount[] {
  const base = defaultSocials();
  if (!Array.isArray(raw)) return base;
  const customs: SocialAccount[] = [];
  const byPlatform = new Map<string, string>();
  raw.forEach((item: any, idx: number) => {
    if (!item || typeof item !== "object") return;
    const platform = typeof item.platform === "string" ? item.platform.trim() : "";
    const value = typeof item.value === "string" ? item.value : "";
    if (!platform && !value) return;
    if (item.custom || !FIXED_PLATFORMS.includes(platform)) {
      customs.push({ id: typeof item.id === "string" && item.id ? item.id : `social-custom-${idx}`, platform, value, custom: true });
    } else if (!byPlatform.has(platform)) {
      byPlatform.set(platform, value);
    }
  });
  return [...base.map(s => ({ ...s, value: byPlatform.get(s.platform) || "" })), ...customs];
}
function socialPlaceholder(platform: string): string {
  if (platform === "LinkedIn") return "https://linkedin.com/in/your-name";
  if (platform === "Website / Portfolio") return "https://your-portfolio.com";
  return "@artbymemik";
}
function socialHref(platform: string, rawValue: string): string {
  const v = (rawValue || "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[^\s@/]+@[^\s@]+\.[^\s@]+$/.test(v)) return `mailto:${v}`;
  const handle = v.replace(/^@+/, "").replace(/\s+/g, "");
  if (!handle) return "";
  if (handle.includes("/") && handle.includes(".")) return `https://${handle}`;
  const p = (platform || "").trim().toLowerCase();
  if (p === "instagram") return `https://instagram.com/${handle}`;
  if (p === "facebook") return `https://facebook.com/${handle}`;
  if (p === "threads") return `https://threads.net/@${handle}`;
  if (p === "x") return `https://x.com/${handle}`;
  if (p === "linkedin") return `https://linkedin.com/in/${handle}`;
  if (p === "website / portfolio" || p === "website" || p === "portfolio") {
    if (handle.includes(".")) return `https://${handle}`;
    return "";
  }
  if (handle.includes(".")) return `https://${handle}`;
  return "";
}
function socialDisplay(platform: string, rawValue: string): string {
  const href = socialHref(platform, rawValue);
  if (!href) return (rawValue || "").trim();
  if (href.startsWith("mailto:")) return href.slice(7);
  try { const u = new URL(href); return `${u.hostname}${u.pathname === "/" ? "" : u.pathname}`; } catch { return href; }
}
function initialsFor(name: string) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

const DEFAULT_SHORTCUTS = {
  focusSearch: "/",
  newContact: "n",
  cycleTheme: "t",
  export: "mod+e",
  openSettings: "?",
  next: "j",
  prev: "k",
  openSelected: "Enter",
  filterAll: "1",
  filterToReach: "2",
  filterReplied: "3",
  filterFollowed: "4",
  edit: "e",
  toggleReplied: "r",
  toggleFollowed: "f",
  openLink: "l",
  copy: "c",
  minimize: "m",
  back: "b",
  delete: "Delete",
  close: "Escape",
  saveForm: "mod+Enter",
} as const;
type ShortcutAction = keyof typeof DEFAULT_SHORTCUTS;
type ShortcutMap = Record<ShortcutAction, string>;
const SHORTCUT_GROUPS: { group: string; items: { action: ShortcutAction; label: string }[] }[] = [
  { group: "Global", items: [
    { action: "focusSearch", label: "Focus search" },
    { action: "newContact", label: "New contact / Focus notes when DETAILS open" },
    { action: "cycleTheme", label: "Cycle theme" },
    { action: "export", label: "Export" },
    { action: "openSettings", label: "Settings / Shortcuts" },
  ]},
  { group: "List + Filters", items: [
    { action: "next", label: "Next" },
    { action: "prev", label: "Previous" },
    { action: "openSelected", label: "Open selected" },
    { action: "filterAll", label: "Filter: All" },
    { action: "filterToReach", label: "Filter: To reach" },
    { action: "filterReplied", label: "Filter: Replied" },
    { action: "filterFollowed", label: "Filter: Followed up" },
  ]},
  { group: "Details", items: [
    { action: "edit", label: "Edit" },
    { action: "toggleReplied", label: "Toggle Replied" },
    { action: "toggleFollowed", label: "Toggle Followed up" },
    { action: "openLink", label: "Open link" },
    { action: "copy", label: "Copy contact" },
    { action: "minimize", label: "Minimize / Expand" },
    { action: "back", label: "Back" },
    { action: "delete", label: "Delete (always confirms)" },
    { action: "close", label: "Close" },
    { action: "saveForm", label: "Save in form" },
  ]},
];
function canonicalFromEvent(e: KeyboardEvent | React.KeyboardEvent): string | null {
  const k = e.key;
  if (k === "Control" || k === "Meta" || k === "Alt" || k === "Shift") return null;
  let keyPart = "";
  if (k === " ") keyPart = "Space";
  else if (k.length === 1) keyPart = k.toLowerCase();
  else keyPart = k;
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("mod");
  if (e.altKey) parts.push("alt");
  parts.push(keyPart);
  return parts.join("+");
}
function displayShortcut(c: string): string {
  const parts = c.split("+");
  const key = parts[parts.length - 1];
  const mods = parts.slice(0, -1);
  let keyLabel = key;
  if (key === "Enter") keyLabel = "Enter";
  else if (key === "Delete") keyLabel = "Del";
  else if (key === "Escape") keyLabel = "Esc";
  else if (key === "ArrowDown") keyLabel = "↓";
  else if (key === "ArrowUp") keyLabel = "↑";
  else if (key === "Space") keyLabel = "Space";
  else if (key.length === 1) keyLabel = key.toUpperCase();
  const modLabel = mods.map(m => m === "mod" ? "Ctrl/Cmd" : m === "alt" ? "Alt" : m).join(" + ");
  return modLabel ? `${modLabel} + ${keyLabel}` : keyLabel;
}
function matchesShortcut(e: KeyboardEvent, canonical: string): boolean {
  const parts = canonical.split("+");
  const keyPart = parts[parts.length - 1];
  const mods = parts.slice(0, -1);
  const needsMod = mods.includes("mod");
  const needsAlt = mods.includes("alt");
  const hasMod = e.ctrlKey || e.metaKey;
  if (needsMod !== hasMod) return false;
  if (needsAlt !== e.altKey) return false;
  if (keyPart === "Enter") return e.key === "Enter";
  if (keyPart === "Delete") return e.key === "Delete" || e.key === "Backspace";
  if (keyPart === "Escape") return e.key === "Escape";
  if (keyPart === "ArrowDown") return e.key === "ArrowDown";
  if (keyPart === "ArrowUp") return e.key === "ArrowUp";
  if (keyPart === "Space") return e.key === " ";
  if (keyPart.length === 1) {
    if (keyPart === "?") return e.key === "?";
    if (keyPart === "/") return e.key === "/";
    return e.key.toLowerCase() === keyPart;
  }
  return e.key === keyPart;
}

const DEFAULT_TEMPLATES: TemplateItem[] = [
  { id: "first-outreach", title: "First outreach", text: "Hi [Name],\n\nI loved your recent [detail] — the way you handled it really stayed with me. I'm a visual designer focused on branding, editorial, and social, and I kept thinking about how your work and mine might fit together.\n\nIf you're open to it, I'd love to share a few relevant pieces. No pressure at all — I just admired the work and wanted to say hello.\n\nWarmly" },
  { id: "follow-up", title: "Polite follow-up", text: "Hi [Name],\n\nJust floating my last message back up — no pressure at all. I know inboxes get busy.\n\nIf it's helpful, I can share a quick idea or a relevant piece for [detail]. And if now isn't the right time, that's completely fine too.\n\nWarmly" },
  { id: "thank-you", title: "Thank you / after collab", text: "Hi [Name],\n\nThank you for the conversation — I really enjoyed [detail] and working through it with you.\n\nIf anything comes up down the line, I'm happy to help. Let's stay in touch.\n\nWarmly" },
];
type ModalState = { mode: "add" } | { mode: "edit"; contact: Contact } | null;
// --- Supabase: per-user cloud storage ---
// Each user has their own rows. RLS in Supabase ensures a user can only see their own data.
async function api(action: string, args: Record<string, unknown>) {
  if (!isSupabaseConfigured) throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel.");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Please sign in to see your contacts.");
  if (action === "records.list") {
    if (args.collection === "outreach-contacts") {
      const { data, error } = await supabase.from("outreach_contacts").select("id, value").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1000);
      if (error) throw error;
      const records = (data || []).map((r: any) => ({ id: r.id, value: r.value as ContactValue }));
      return { records, next_cursor: undefined };
    }
    if (args.collection === "outreach-settings") {
      const { data, error } = await supabase.from("outreach_settings").select("id, value").eq("user_id", user.id).limit(1).maybeSingle();
      if (error) throw error;
      return { records: data ? [{ id: data.id, value: data.value }] : [] };
    }
    return { records: [] };
  }
  if (action === "records.create") {
    if (args.collection === "outreach-contacts") {
      const { data, error } = await supabase.from("outreach_contacts").insert({ user_id: user.id, value: args.value }).select("id").single();
      if (error) throw error;
      return { id: data.id };
    }
    if (args.collection === "outreach-settings") {
      const { data, error } = await supabase.from("outreach_settings").insert({ user_id: user.id, value: args.value }).select("id").single();
      if (error) throw error;
      return { id: data.id };
    }
    return { id: uid() };
  }
  if (action === "records.replace") {
    if (args.collection === "outreach-contacts") {
      const { error } = await supabase.from("outreach_contacts").update({ value: args.value }).eq("id", args.id).eq("user_id", user.id);
      if (error) throw error;
      return {};
    }
    if (args.collection === "outreach-settings") {
      const { error } = await supabase.from("outreach_settings").update({ value: args.value }).eq("id", args.id).eq("user_id", user.id);
      if (error) throw error;
      return {};
    }
    return {};
  }
  if (action === "records.delete") {
    if (args.collection === "outreach-contacts") {
      const { error } = await supabase.from("outreach_contacts").delete().eq("id", args.id).eq("user_id", user.id);
      if (error) throw error;
      return {};
    }
    return {};
  }
  throw new Error(`Unknown action ${action}`);
}
function uid() { return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function todayISO() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function formatDate(v: string) {
  if (!v) return "—";
  const d = new Date(`${v}T12:00:00`);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
function formatTime(d: Date) { return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }); }
function isEmailValue(v: string) { return /^[^\s@/]+@[^\s@]+\.[^\s@]+$/.test(v.trim()); }
function isPhoneLike(v: string) { const digits = v.replace(/\D/g, ""); return digits.length >= 7 && /^\+?[\d\s().-]+$/.test(v.trim()); }
function channelKind(channel: string): string {
  const s = (channel || "").trim().toLowerCase();
  if (!s) return "";
  if (s.includes("insta") || s === "ig") return "instagram";
  if (s.includes("twitter") || s === "x" || s.includes("tweet")) return "x";
  if (s.includes("tiktok") || s.includes("tik tok") || s === "tt") return "tiktok";
  if (s.includes("youtube") || s === "yt" || s.includes("you tube")) return "youtube";
  if (s.includes("linkedin") || s.includes("linked") || s === "li") return "linkedin";
  if (s.includes("behance")) return "behance";
  if (s.includes("dribbble") || s.includes("dribble")) return "dribbble";
  if (s.includes("pinterest") || s === "pin" || s.includes("pinboard")) return "pinterest";
  if (s.includes("whatsapp") || s === "wa" || s.includes("whats app")) return "whatsapp";
  if (s.includes("telegram") || s === "tg") return "telegram";
  if (s.includes("facebook") || s === "fb" || s.includes("meta")) return "facebook";
  if (s.includes("threads")) return "threads";
  if (s.includes("snapchat") || s.includes("snap")) return "snapchat";
  if (s.includes("signal")) return "signal";
  if (s.includes("email") || s.includes("e-mail") || s === "mail") return "email";
  if (s.includes("website") || s.includes("portfolio") || s.includes("studio") || s === "web" || s.includes("site")) return "website";
  return "unknown";
}
function cleanNoSchemeUrl(s: string): string {
  const idx = s.indexOf("/");
  if (idx === -1) return s;
  const domain = s.slice(0, idx);
  const rest = s.slice(idx + 1);
  if (rest.startsWith("@")) {
    const dl = domain.toLowerCase();
    if (dl.includes("tiktok") || dl.includes("youtube")) return s;
    return `${domain}/${rest.slice(1)}`;
  }
  return s;
}
function cleanSchemeUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (!(host.includes("tiktok") || host.includes("youtube")) && u.pathname.startsWith("/@")) {
      u.pathname = "/" + u.pathname.slice(2);
    }
    if (u.pathname === "/") return `${u.protocol}//${u.host}`;
    return u.href.replace(/\/$/, "");
  } catch {
    const dl = url.toLowerCase();
    if (dl.includes("tiktok") || dl.includes("youtube")) return url;
    return url.replace(/\/@/, "/");
  }
}
function buildFromHandle(rawHandle: string, channel: string): string {
  const original = (rawHandle || "").trim();
  if (!original) return "";
  if (original.includes("/") && original.includes(".")) {
    const c = cleanNoSchemeUrl(original.replace(/^@+/, ""));
    return `https://${c}`;
  }
  if (isEmailValue(original)) return `mailto:${original}`;
  if (isPhoneLike(original)) {
    const kind0 = channelKind(channel);
    if (kind0 === "whatsapp") { const d = original.replace(/\D/g, ""); return d ? `https://wa.me/${d}` : ""; }
    return "";
  }
  const handle = original.replace(/^@+/, "").replace(/\//g, "").replace(/\s+/g, "");
  if (!handle) return "";
  const kind = channelKind(channel);
  switch (kind) {
    case "instagram": return `https://instagram.com/${handle}`;
    case "x": return `https://x.com/${handle}`;
    case "tiktok": return `https://tiktok.com/@${handle}`;
    case "youtube": return `https://youtube.com/@${handle}`;
    case "linkedin": return `https://linkedin.com/in/${handle}`;
    case "behance": return `https://behance.net/${handle}`;
    case "dribbble": return `https://dribbble.com/${handle}`;
    case "pinterest": return `https://pinterest.com/${handle}`;
    case "whatsapp": { const d = handle.replace(/\D/g, ""); return d ? `https://wa.me/${d}` : ""; }
    case "telegram": return `https://t.me/${handle}`;
    case "facebook": return `https://facebook.com/${handle}`;
    case "threads": return `https://threads.net/@${handle}`;
    case "snapchat": return `https://snapchat.com/add/${handle}`;
    case "signal": return "";
    case "email": return `mailto:${handle}`;
    case "website": {
      if (isEmailValue(handle)) return `mailto:${handle}`;
      return `https://${handle}`;
    }
    default: return "";
  }
}
function normalizeLink(rawLink: string, channel: string, contactDetails: string): string {
  const raw = (rawLink || "").trim();
  const ch = (channel || "").trim();
  const det = (contactDetails || "").trim();
  if (!raw) {
    if (!det || !ch) return "";
    return buildFromHandle(det, ch);
  }
  const lower = raw.toLowerCase();
  if (lower.startsWith("mailto:") || lower.startsWith("tel:")) return raw;
  if (isEmailValue(raw)) return `mailto:${raw}`;
  if (/^https?:\/\//i.test(raw)) return cleanSchemeUrl(raw);
  if (!raw.includes(".") && !raw.includes("/") && !raw.includes(" ") && ch) {
    const stripped = raw.replace(/^@+/, "");
    const built = buildFromHandle(stripped, ch);
    if (built) return built;
    return raw;
  }
  if (raw.includes(" ")) return raw;
  let cleaned = raw;
  if (cleaned.startsWith("@") && cleaned.slice(1).includes(".")) cleaned = cleaned.slice(1);
  cleaned = cleanNoSchemeUrl(cleaned);
  return `https://${cleaned}`;
}
function displayLink(c: Contact) { return normalizeLink(c.value.link, c.value.channel, c.value.contactDetails); }
function shortLinkText(url: string) {
  if (url.startsWith("mailto:")) return url.slice(7);
  try { const u = new URL(url); const path = u.pathname === "/" ? "" : u.pathname; return `${u.hostname}${path}`; } catch { return url; }
}
function looksLikeUrl(v: string) {
  if (!v.trim()) return true;
  try { const u = new URL(normalizeLink(v, "", "")); return !!u.hostname && u.hostname.includes("."); } catch { return false; }
}
function csvCell(v: string) { return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }
function useMedia(query: string) {
  const [match, setMatch] = useState(() => typeof window !== "undefined" ? window.matchMedia(query).matches : false);
  useEffect(() => {
    const m = window.matchMedia(query);
    const fn = () => setMatch(m.matches);
    fn(); m.addEventListener("change", fn); return () => m.removeEventListener("change", fn);
  }, [query]);
  return match;
}

export default function App() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [scratchpad, setScratchpad] = useState("");
  const [templates, setTemplates] = useState<TemplateItem[]>(DEFAULT_TEMPLATES);
  const [scratchpadSaving, setScratchpadSaving] = useState(false);
  const [scratchpadSavedAt, setScratchpadSavedAt] = useState<string | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [quickNoteFocused, setQuickNoteFocused] = useState(false);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [templateDraft, setTemplateDraft] = useState("");
  const [activeFocus, setActiveFocus] = useState<string | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [pendingClearScratchpad, setPendingClearScratchpad] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [panelWidth, setPanelWidth] = useState(400);
  const [sheetPct, setSheetPct] = useState(88);
  const [modal, setModal] = useState<ModalState>(null);
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [notesSavedAt, setNotesSavedAt] = useState<string | null>(null);
  const [notesSaving, setNotesSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [prevContact, setPrevContact] = useState<{ id: string; name: string } | null>(null);
  const [backStack, setBackStack] = useState<{ id: string; name: string }[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"profile" | "shortcuts">("profile");
  const [profile, setProfile] = useState<ProfileValue>(DEFAULT_PROFILE);
  const [profileDraft, setProfileDraft] = useState<ProfileValue>(DEFAULT_PROFILE);
  const [shortcuts, setShortcuts] = useState<ShortcutMap>({ ...DEFAULT_SHORTCUTS });
  const [capturing, setCapturing] = useState<ShortcutAction | null>(null);
  // --- Auth (Option B: per-user) ---
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authEmail, setAuthEmail] = useState("");
  const [authSent, setAuthSent] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [deleteAllBusy, setDeleteAllBusy] = useState(false);
  const isMobile = useMedia("(max-width: 767px)");
  const isTablet = useMedia("(min-width: 768px) and (max-width: 1023px)");
  const isDesktop = useMedia("(min-width: 1024px)");
  const notesTimer = useRef<number | null>(null);
  const scratchpadTimer = useRef<number | null>(null);
  const scratchpadRef = useRef("");
  const templatesRef = useRef<TemplateItem[]>(DEFAULT_TEMPLATES);
  const profileRef = useRef<ProfileValue>(DEFAULT_PROFILE);
  const shortcutsRef = useRef<ShortcutMap>({ ...DEFAULT_SHORTCUTS });
  const searchRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { scratchpadRef.current = scratchpad; }, [scratchpad]);
  useEffect(() => { templatesRef.current = templates; }, [templates]);
  useEffect(() => { profileRef.current = profile; }, [profile]);
  useEffect(() => { shortcutsRef.current = shortcuts; }, [shortcuts]);
  const notesFor = useRef<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  };

  // --- Auth effects ---
  useEffect(() => {
    if (!isSupabaseConfigured) { setAuthLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => { setUser(data.session?.user ?? null); setAuthLoading(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { setUser(session?.user ?? null); setAuthLoading(false); });
    return () => listener.subscription.unsubscribe();
  }, []);

  const handleSendMagicLink = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!authEmail.trim() || !authEmail.includes("@")) { setAuthError("Please enter a valid email."); return; }
    setAuthBusy(true); setAuthError(null);
    const { error } = await supabase.auth.signInWithOtp({ email: authEmail.trim(), options: { emailRedirectTo: window.location.origin } });
    setAuthBusy(false);
    if (error) { setAuthError(error.message); return; }
    setAuthSent(true);
  };
  const handleSignOut = async () => { await supabase.auth.signOut(); setContacts([]); setSelectedId(null); setPanelOpen(false); };
  const handleDeleteAllMyData = async () => {
    if (!user) return; setDeleteAllBusy(true);
    try {
      const { error: cErr } = await supabase.from("outreach_contacts").delete().eq("user_id", user.id);
      if (cErr) throw cErr;
      const { error: sErr } = await supabase.from("outreach_settings").delete().eq("user_id", user.id);
      if (sErr) throw sErr;
      setContacts([]); setSelectedId(null); setPanelOpen(false); setScratchpad(""); setTemplates(DEFAULT_TEMPLATES); setProfile(DEFAULT_PROFILE);
      setShowDeleteAll(false); showToast("All your data was deleted");
    } catch (e) { showToast(e instanceof Error ? e.message : "Could not delete data"); }
    finally { setDeleteAllBusy(false); }
  };

  const reloadContacts = useCallback(async () => {
    const out: Contact[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 12; i++) {
      const data = await api("records.list", { collection: "outreach-contacts", limit: 100, ...(cursor ? { cursor } : {}) }) as { records: Contact[]; next_cursor?: string };
      out.push(...(data.records || []));
      cursor = data.next_cursor;
      if (!cursor) break;
    }
    setContacts(out);
    return out;
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true); setLoadError(null);
    try {
      const list = await reloadContacts();
      try {
        const s = await api("records.list", { collection: "outreach-settings", limit: 10 }) as { records: { id: string; value: { themeMode?: ThemeMode; selectedId?: string | null; scratchpad?: string; templates?: TemplateItem[]; profile?: ProfileValue; shortcuts?: Partial<ShortcutMap> } }[] };
        const first = s.records?.[0];
        if (first) {
          setSettingsId(first.id);
          if (first.value.themeMode) setThemeMode(first.value.themeMode);
          if (typeof first.value.scratchpad === "string") { setScratchpad(first.value.scratchpad); scratchpadRef.current = first.value.scratchpad; }
          if (Array.isArray(first.value.templates) && first.value.templates.length > 0) { setTemplates(first.value.templates); templatesRef.current = first.value.templates; }
          if (first.value.profile && typeof first.value.profile === "object") {
            const rawSocials = (first.value.profile as { socials?: unknown; socialLinks?: unknown }).socials ?? (first.value.profile as { socials?: unknown; socialLinks?: unknown }).socialLinks
            const p: ProfileValue = { name: typeof first.value.profile.name === "string" ? first.value.profile.name : "", socials: normalizeSocials(rawSocials) };
            setProfile(p); profileRef.current = p; setProfileDraft(p);
          }
          if (first.value.shortcuts && typeof first.value.shortcuts === "object") {
            const merged: ShortcutMap = { ...DEFAULT_SHORTCUTS };
            (Object.keys(DEFAULT_SHORTCUTS) as ShortcutAction[]).forEach(k => { const v = (first.value.shortcuts as Partial<ShortcutMap>)[k]; if (typeof v === "string" && v) merged[k] = v; });
            setShortcuts(merged); shortcutsRef.current = merged;
          }
          const sel = first.value.selectedId || null;
          if (sel && list.some(c => c.id === sel)) { setSelectedId(sel); setPanelOpen(true); }
        }
      } catch { /* settings are best-effort; contacts already loaded */ }
      setSettingsLoaded(true);
    } catch (e) { setLoadError(e instanceof Error ? e.message : String(e)); setSettingsLoaded(true); }
    finally { setLoading(false); }
  }, [reloadContacts]);

  useEffect(() => { if (user) loadAll(); }, [user, loadAll]);

  useEffect(() => { document.title = "Reach — Outreach, curated."; }, []);

  const resolvedTheme = useMemo(() => {
    if (themeMode !== "system") return themeMode;
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }, [themeMode]);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const fn = () => { if (themeMode === "system") { document.documentElement.dataset.theme = mq.matches ? "dark" : "light"; } };
    mq.addEventListener("change", fn); return () => mq.removeEventListener("change", fn);
  }, [resolvedTheme, themeMode]);

  const saveSettings = useCallback(async (nextTheme: ThemeMode, nextSelected: string | null) => {
    if (!settingsLoaded) return;
    try {
      const value = { themeMode: nextTheme, selectedId: nextSelected, scratchpad: scratchpadRef.current, templates: templatesRef.current, profile: profileRef.current, shortcuts: shortcutsRef.current };
      if (settingsId) await api("records.replace", { collection: "outreach-settings", id: settingsId, value });
      else {
        const created = await api("records.create", { collection: "outreach-settings", value, idempotency_key: `settings-${uid()}` }) as { id: string };
        setSettingsId(created.id);
      }
    } catch { /* theme/selection persistence is best-effort; contacts remain authoritative */ }
  }, [settingsId, settingsLoaded]);

  const changeTheme = (m: ThemeMode) => { setThemeMode(m); saveSettings(m, selectedId); };
  const cycleTheme = () => { const order: ThemeMode[] = ["system", "light", "dark"]; const next = order[(order.indexOf(themeMode) + 1) % order.length]; changeTheme(next); };
  const selectContact = (id: string | null, opts?: { fromBack?: boolean }) => {
    if (id && selectedId && id !== selectedId && !opts?.fromBack) {
      const prev = contacts.find(c => c.id === selectedId);
      if (prev) {
        const entry = { id: prev.id, name: prev.value.name };
        setBackStack(prevStack => [...prevStack.slice(-1), entry]);
        setPrevContact(entry);
      }
    }
    setSelectedId(id); setPanelOpen(!!id);
    if (!isDesktop) setMinimized(false);
    if (id && isMobile) setSheetPct(88);
    saveSettings(themeMode, id);
  };
  const goBack = () => {
    if (backStack.length === 0) return;
    const last = backStack[backStack.length - 1];
    setBackStack(prev => prev.slice(0, -1));
    selectContact(last.id, { fromBack: true });
  };

  const selected = useMemo(() => contacts.find(c => c.id === selectedId) || null, [contacts, selectedId]);
  const selectedLink = selected ? displayLink(selected) : "";

  useEffect(() => {
    if (selected) { setNotesDraft(selected.value.notes || ""); notesFor.current = selected.id; setNotesSavedAt(null); }
    else { setNotesDraft(""); notesFor.current = null; }
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const persistContact = async (contact: Contact, patch: Partial<ContactValue>) => {
    const next: ContactValue = { ...contact.value, ...patch, updatedAt: new Date().toISOString() };
    await api("records.replace", { collection: "outreach-contacts", id: contact.id, value: next });
    setContacts(prev => prev.map(c => c.id === contact.id ? { ...c, value: next } : c));
    return next;
  };

  const saveNotesNow = useCallback(async (text: string) => {
    const id = notesFor.current; if (!id) return;
    const cur = contacts.find(c => c.id === id); if (!cur) return;
    if (cur.value.notes === text) return;
    setNotesSaving(true);
    try { await persistContact(cur, { notes: text }); setNotesSavedAt(formatTime(new Date())); }
    catch (e) { showToast(e instanceof Error ? e.message : "Couldn’t save notes"); }
    finally { setNotesSaving(false); }
  }, [contacts]); // eslint-disable-line

  const onNotesChange = (text: string) => {
    setNotesDraft(text);
    if (notesTimer.current) window.clearTimeout(notesTimer.current);
    notesTimer.current = window.setTimeout(() => { saveNotesNow(text); }, 400);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const today = todayISO();
    const daysSince = (d: string) => { if (!d) return -1; const then = new Date(`${d}T12:00:00`).getTime(); const now = new Date(`${today}T12:00:00`).getTime(); return Math.floor((now - then) / 86400000); };
    const list = contacts.filter(c => {
      if (filter === "to-reach" && c.value.replied) return false;
      if (filter === "replied" && !c.value.replied) return false;
      if (filter === "followed" && !c.value.followedUp) return false;
      if (filter === "today" && c.value.outreachDate !== today) return false;
      if (filter === "needs-follow-up" && (c.value.replied || daysSince(c.value.outreachDate) < 4)) return false;
      if (!q) return true;
      return [c.value.name, c.value.channel, c.value.contactDetails, c.value.link].some(v => (v || "").toLowerCase().includes(q));
    });
    return [...list].sort((a, b) => {
      if (filter === "needs-follow-up") {
        const ad = a.value.outreachDate, bd = b.value.outreachDate;
        if (ad && bd && ad !== bd) return ad.localeCompare(bd);
      }
      const ad = a.value.outreachDate, bd = b.value.outreachDate;
      if (ad && bd && ad !== bd) return bd.localeCompare(ad);
      if (ad && !bd) return -1; if (!ad && bd) return 1;
      return b.value.updatedAt.localeCompare(a.value.updatedAt);
    });
  }, [contacts, search, filter]);

  const counts = useMemo(() => {
    const today = todayISO();
    const daysSince = (d: string) => { if (!d) return -1; const then = new Date(`${d}T12:00:00`).getTime(); const now = new Date(`${today}T12:00:00`).getTime(); return Math.floor((now - then) / 86400000); };
    return { total: contacts.length, replied: contacts.filter(c => c.value.replied).length, followed: contacts.filter(c => c.value.followedUp).length, toReach: contacts.filter(c => !c.value.replied).length, outreachToday: contacts.filter(c => c.value.outreachDate === today).length, needsFollowUp: contacts.filter(c => !c.value.replied && daysSince(c.value.outreachDate) >= 4).length };
  }, [contacts]);

  const exportCSV = () => {
    const headers = ["name","channel","outreach date","contact","link","replied","followed up","notes"];
    const rows = contacts.map(c => [c.value.name, c.value.channel, c.value.outreachDate, c.value.contactDetails, displayLink(c), c.value.replied ? "Yes" : "No", c.value.followedUp ? "Yes" : "No", c.value.notes]);
    const csv = "\uFEFF" + [headers, ...rows].map(r => r.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `reach-${todayISO()}.csv`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 800);
    showToast(`Exported ${contacts.length} contacts`);
  };

  const copyText = (text: string, key: string) => {
    const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); setCopied(key); setTimeout(() => setCopied(null), 2000); showToast("Copied to clipboard"); } catch { showToast("Select the text to copy it"); }
    ta.remove();
  };

  const toggleStatus = async (field: "replied" | "followedUp") => {
    if (!selected) return;
    try { await persistContact(selected, { [field]: !selected.value[field] }); }
    catch (e) { showToast(e instanceof Error ? e.message : "Couldn’t update status"); }
  };

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX, startW = panelWidth;
    const move = (ev: MouseEvent) => setPanelWidth(Math.max(360, Math.min(540, startW + (startX - ev.clientX))));
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };

  const startSheetDrag = (e: React.PointerEvent) => {
    const startY = e.clientY, startPct = sheetPct;
    const move = (ev: PointerEvent) => setSheetPct(Math.max(32, Math.min(92, startPct + ((startY - ev.clientY) / window.innerHeight) * 100)));
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };

  // ---- Form ----
  const [form, setForm] = useState({ name: "", channel: "", outreachDate: todayISO(), contactDetails: "", link: "", replied: false, followedUp: false, notes: "" });
  const previewLink = modal ? normalizeLink(form.link, form.channel, form.contactDetails) : "";
  const showPreview = previewLink.startsWith("http") || previewLink.startsWith("mailto:");
  const openAdd = (prefillNotes?: string, opts?: { clearScratchpadAfterSave?: boolean }) => { setForm({ name: "", channel: "", outreachDate: todayISO(), contactDetails: "", link: "", replied: false, followedUp: false, notes: prefillNotes || "" }); setFormError(null); setPendingClearScratchpad(!!opts?.clearScratchpadAfterSave); setModal({ mode: "add" }); };
  const openEdit = (c: Contact) => { setForm({ name: c.value.name, channel: c.value.channel, outreachDate: c.value.outreachDate || todayISO(), contactDetails: c.value.contactDetails, link: c.value.link, replied: c.value.replied, followedUp: c.value.followedUp, notes: c.value.notes }); setFormError(null); setModal({ mode: "edit", contact: c }); };
  useEffect(() => {
    if (modal) { const t = setTimeout(() => formRef.current?.querySelector<HTMLInputElement>("input")?.focus(), 40); return () => clearTimeout(t); }
  }, [modal]);
  const submitForm = async () => {
    if (!form.name.trim()) { setFormError("Name is required."); return; }
    const normalized = normalizeLink(form.link, form.channel, form.contactDetails);
    if (form.link.trim() && (!normalized || (!normalized.startsWith("mailto:") && !/^https?:\/\//.test(normalized)))) { setFormError("Link should look like a URL, for example https://example.com."); return; }
    if (normalized.startsWith("http") && !looksLikeUrl(normalized)) { setFormError("Link should look like a URL, for example https://example.com."); return; }
    setBusy(true); setFormError(null);
    const now = new Date().toISOString();
    try {
      if (modal?.mode === "edit") {
        const c = modal.contact;
        await persistContact(c, { name: form.name.trim(), channel: form.channel.trim(), outreachDate: form.outreachDate, contactDetails: form.contactDetails.trim(), link: normalized, replied: form.replied, followedUp: form.followedUp, notes: form.notes });
        if (selectedId === c.id) setNotesDraft(form.notes);
        showToast("Contact updated"); selectContact(c.id);
      } else {
        const value: ContactValue = { name: form.name.trim(), channel: form.channel.trim(), outreachDate: form.outreachDate, contactDetails: form.contactDetails.trim(), link: normalized, replied: form.replied, followedUp: form.followedUp, notes: form.notes, createdAt: now, updatedAt: now };
        const created = await api("records.create", { collection: "outreach-contacts", value, idempotency_key: `contact-${uid()}` }) as { id: string };
        await reloadContacts(); setModal(null); showToast("Contact added");
        if (pendingClearScratchpad) { setScratchpad(""); scratchpadRef.current = ""; setScratchpadSavedAt(null); setClearConfirm(false); setPendingClearScratchpad(false); saveSettings(themeMode, selectedId); }
        selectContact(created.id);
      }
      setModal(null);
    } catch (e) { setFormError(e instanceof Error ? e.message : "Couldn’t save contact"); }
    finally { setBusy(false); }
  };
  const confirmDelete = async () => {
    if (!deleteTarget) return; setBusy(true);
    try {
      await api("records.delete", { collection: "outreach-contacts", id: deleteTarget.id });
      setContacts(prev => prev.filter(c => c.id !== deleteTarget.id));
      if (selectedId === deleteTarget.id) { setSelectedId(null); setPanelOpen(false); saveSettings(themeMode, null); }
      showToast("Contact deleted"); setDeleteTarget(null);
    } catch (e) { showToast(e instanceof Error ? e.message : "Couldn’t delete contact"); }
    finally { setBusy(false); }
  };

  const closePanel = () => { selectContact(null); };
  useEffect(() => {
    if (!panelOpen) return;
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") closePanel(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [panelOpen, selectedId]); // eslint-disable-line

  // ---- Settings: Profile + Shortcuts ----
  const openSettings = (tab: "profile" | "shortcuts") => {
    setProfileDraft({ name: profile.name, socials: normalizeSocials(profile.socials) });
    setSettingsTab(tab);
    setSettingsOpen(true);
    setCapturing(null);
  };
  const saveProfile = async () => {
    const next: ProfileValue = { name: profileDraft.name.trim(), socials: normalizeSocials(profileDraft.socials.map(s => ({ ...s, platform: s.platform.trim(), value: s.value.trim() }))) };
    setProfile(next); profileRef.current = next; setProfileDraft(next);
    try { await saveSettings(themeMode, selectedId); showToast("Profile saved"); } catch { showToast("Profile saved"); }
    setSettingsOpen(false);
  };
  const updateSocial = (id: string, field: "platform" | "value", nextValue: string) => {
    setProfileDraft(d => ({ ...d, socials: d.socials.map(s => s.id === id ? { ...s, [field]: nextValue } : s) }));
  };
  const addCustomSocial = () => {
    setProfileDraft(d => ({ ...d, socials: [...d.socials, { id: `social-custom-${uid()}`, platform: "", value: "", custom: true }] }));
  };
  const removeCustomSocial = (id: string) => {
    setProfileDraft(d => ({ ...d, socials: d.socials.filter(s => s.id !== id) }));
  };
  const saveShortcuts = async () => {
    shortcutsRef.current = shortcuts;
    try { await saveSettings(themeMode, selectedId); showToast("Shortcuts saved"); } catch { showToast("Shortcuts saved"); }
  };
  const resetShortcuts = async () => {
    const next: ShortcutMap = { ...DEFAULT_SHORTCUTS };
    setShortcuts(next); shortcutsRef.current = next;
    try { await saveSettings(themeMode, selectedId); showToast("Shortcuts reset"); } catch { showToast("Shortcuts reset"); }
  };

  // Capture a new shortcut key
  useEffect(() => {
    if (!capturing) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation();
      if (e.key === "Escape") { setCapturing(null); return; }
      const canon = canonicalFromEvent(e);
      if (!canon) return;
      setShortcuts(prev => { const next = { ...prev, [capturing]: canon }; shortcutsRef.current = next; return next; });
      setCapturing(null);
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [capturing]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (capturing) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName || "";
      const isTyping = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!target?.isContentEditable;
      const isModEnter = (e.ctrlKey || e.metaKey) && e.key === "Enter";
      const isEsc = e.key === "Escape";
      // While typing, only Esc and Cmd/Ctrl+Enter run.
      if (isTyping) {
        if (isEsc) {
          if (deleteTarget) { setDeleteTarget(null); return; }
          if (settingsOpen) { setSettingsOpen(false); return; }
          if (modal) { if (!busy) setModal(null); return; }
          if (panelOpen) { closePanel(); return; }
        }
        if (isModEnter && modal) { e.preventDefault(); submitForm(); return; }
        return;
      }
      if (settingsOpen) {
        if (isEsc) setSettingsOpen(false);
        return;
      }
      if (deleteTarget) {
        if (isEsc) setDeleteTarget(null);
        return;
      }
      if (modal) {
        if (isEsc && !busy) { setModal(null); return; }
        if (isModEnter) { e.preventDefault(); submitForm(); return; }
        return;
      }
      // Not typing, no overlay: shortcuts
      if (matchesShortcut(e, shortcuts.close)) { if (panelOpen) { e.preventDefault(); closePanel(); } return; }
      if (matchesShortcut(e, shortcuts.openSettings)) { e.preventDefault(); openSettings("shortcuts"); return; }
      if (matchesShortcut(e, shortcuts.focusSearch)) { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); return; }
      if (matchesShortcut(e, shortcuts.newContact)) {
        e.preventDefault();
        if (selected && panelOpen) { const el = document.getElementById("notes-editor") as HTMLTextAreaElement | null; if (el) { el.focus(); return; } }
        openAdd(); return;
      }
      if (matchesShortcut(e, shortcuts.cycleTheme)) { e.preventDefault(); cycleTheme(); return; }
      if (matchesShortcut(e, shortcuts.export)) { e.preventDefault(); exportCSV(); return; }
      if (matchesShortcut(e, shortcuts.next) || e.key === "ArrowDown") {
        if (filtered.length === 0) return; e.preventDefault();
        const idx = filtered.findIndex(c => c.id === selectedId);
        const next = idx < 0 ? filtered[0] : filtered[Math.min(filtered.length - 1, idx + 1)];
        selectContact(next.id); return;
      }
      if (matchesShortcut(e, shortcuts.prev) || e.key === "ArrowUp") {
        if (filtered.length === 0) return; e.preventDefault();
        const idx = filtered.findIndex(c => c.id === selectedId);
        const prev = idx <= 0 ? filtered[0] : filtered[idx - 1];
        selectContact(prev.id); return;
      }
      if (matchesShortcut(e, shortcuts.openSelected)) {
        e.preventDefault();
        if (selectedId) { setPanelOpen(true); return; }
        if (filtered[0]) selectContact(filtered[0].id);
        return;
      }
      if (matchesShortcut(e, shortcuts.filterAll)) { setFilter("all"); setActiveFocus(null); return; }
      if (matchesShortcut(e, shortcuts.filterToReach)) { setFilter("to-reach"); setActiveFocus(null); return; }
      if (matchesShortcut(e, shortcuts.filterReplied)) { setFilter("replied"); setActiveFocus(null); return; }
      if (matchesShortcut(e, shortcuts.filterFollowed)) { setFilter("followed"); setActiveFocus(null); return; }
      // Details shortcuts
      if (!selected) return;
      if (matchesShortcut(e, shortcuts.edit)) { e.preventDefault(); openEdit(selected); return; }
      if (matchesShortcut(e, shortcuts.toggleReplied)) { e.preventDefault(); toggleStatus("replied"); return; }
      if (matchesShortcut(e, shortcuts.toggleFollowed)) { e.preventDefault(); toggleStatus("followedUp"); return; }
      if (matchesShortcut(e, shortcuts.openLink)) { if (selectedLink) { e.preventDefault(); window.open(selectedLink, "_blank", "noopener"); } return; }
      if (matchesShortcut(e, shortcuts.copy)) { e.preventDefault(); const text = selected.value.contactDetails || selectedLink || selected.value.name; copyText(text, "shortcut-copy"); return; }
      if (matchesShortcut(e, shortcuts.minimize)) { e.preventDefault(); if (panelOpen) setMinimized(m => !m); else setPanelOpen(true); return; }
      if (matchesShortcut(e, shortcuts.back)) { e.preventDefault(); goBack(); return; }
      if (matchesShortcut(e, shortcuts.delete)) { e.preventDefault(); setDeleteTarget(selected); return; }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturing, settingsOpen, modal, deleteTarget, panelOpen, selected, selectedId, selectedLink, filtered, shortcuts, themeMode, busy, form]);

  const todayLabel = new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const focusLine = counts.needsFollowUp > 0 ? `Focus: Follow up with ${counts.needsFollowUp} ${counts.needsFollowUp === 1 ? "person" : "people"} today.` : counts.outreachToday === 0 && counts.total > 0 ? "Focus: Reach out to 1 new person today." : counts.total === 0 ? "Focus: Your first outreach will show here. Draft it below." : "Focus: You're caught up — pick one thread to deepen.";
  const applyFocus = (kind: "today" | "needs-follow-up" | "replied") => { setFilter(kind); setActiveFocus(kind === "today" ? "Outreach today" : kind === "needs-follow-up" ? "Needs follow-up" : "Replied"); if (isMobile || isTablet) { setPanelOpen(false); setMinimized(false); } };
  const onScratchpadChange = (text: string) => {
    setScratchpad(text); scratchpadRef.current = text; setScratchpadSavedAt(null); setClearConfirm(false); setScratchpadSaving(true);
    if (scratchpadTimer.current) window.clearTimeout(scratchpadTimer.current);
    scratchpadTimer.current = window.setTimeout(async () => { try { await saveSettings(themeMode, selectedId); setScratchpadSavedAt(formatTime(new Date())); } catch { /* keep draft in view; retry on next change */ } finally { setScratchpadSaving(false); } }, 400);
  };
  const clearScratchpad = async () => { setScratchpad(""); scratchpadRef.current = ""; setClearConfirm(false); setScratchpadSaving(true); try { await saveSettings(themeMode, selectedId); setScratchpadSavedAt(formatTime(new Date())); } catch { showToast("Couldn’t clear scratchpad"); } finally { setScratchpadSaving(false); } };
  const saveTemplate = async (id: string) => { const next = templates.map(t => t.id === id ? { ...t, text: templateDraft } : t); setTemplates(next); templatesRef.current = next; setEditingTemplateId(null); try { await saveSettings(themeMode, selectedId); showToast("Template saved"); } catch (e) { showToast(e instanceof Error ? e.message : "Couldn’t save template"); } };
  const resetTemplates = async () => { setTemplates(DEFAULT_TEMPLATES); templatesRef.current = DEFAULT_TEMPLATES; setEditingTemplateId(null); try { await saveSettings(themeMode, selectedId); showToast("Templates reset"); } catch (e) { showToast(e instanceof Error ? e.message : "Couldn’t reset templates"); } };

  const activeTemplate = templates.find(t => t.id === activeTemplateId) || null;
  const headerInitials = initialsFor(profile.name);
  const draftInitials = initialsFor(profileDraft.name);
  const linkedSocials = profileDraft.socials.filter(s => s.value.trim() && socialHref(s.platform, s.value));
  const emptyPanel = (
    <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-6 pb-12 pt-9 sm:px-7">
      <section aria-label="Today">
        <div className="small-caps" style={{ color: "var(--muted)" }}>Today</div>
        <div className="mt-6 grid grid-cols-3 gap-0" role="group" aria-label="Today overview">
          {([{ kind: "today", label: "Today", value: counts.outreachToday }, { kind: "needs-follow-up", label: "Needs follow-up", value: counts.needsFollowUp }, { kind: "replied", label: "Replied", value: counts.replied }] as const).map((row, i) => (
            <button key={row.kind} onClick={() => applyFocus(row.kind)} aria-label={`Show ${row.label}: ${row.value}`} className={`min-h-[56px] px-1 py-2.5 text-center ${i > 0 ? "border-l" : ""}`} style={{ borderColor: "var(--divider)" }}>
              <span className="block text-[20px] font-semibold leading-[1.3] tracking-[-0.01em]">{row.value}</span>
              <span className="small-caps mt-1 block leading-[1.3]" style={{ color: "var(--muted)" }}>{row.label}</span>
            </button>
          ))}
        </div>
        <p className="mt-4 truncate text-left text-[15px] leading-relaxed" title={focusLine}>{focusLine}</p>
      </section>

      <section aria-label="Quick note" className="mt-14">
        <label htmlFor="scratchpad" className="small-caps" style={{ color: "var(--muted)" }}>Quick note</label>
        {quickNoteFocused ? (
          <textarea id="scratchpad" autoFocus value={scratchpad} onChange={e => onScratchpadChange(e.target.value)} onBlur={() => { window.setTimeout(() => setQuickNoteFocused(false), 150); }} placeholder="Quick note to self..." rows={3} className="mt-4 w-full resize-y border-b bg-transparent pb-2 text-[15px] leading-relaxed outline-none" style={{ borderColor: "var(--divider)" }} />
        ) : (
          <input id="scratchpad" value={scratchpad} onChange={e => onScratchpadChange(e.target.value)} onFocus={() => setQuickNoteFocused(true)} onClick={() => setQuickNoteFocused(true)} placeholder="Quick note to self..." className="mt-4 w-full border-b bg-transparent pb-2 text-[15px] leading-relaxed outline-none" style={{ borderColor: "var(--divider)" }} />
        )}
        {quickNoteFocused && <p aria-live="polite" className="mt-2 text-xs" style={{ color: "var(--muted)" }}>{scratchpadSaving ? "Saving…" : scratchpadSavedAt ? `Saved • ${scratchpadSavedAt}` : `${scratchpad.length} characters`}</p>}
        <div className="mt-3 flex items-center gap-5">
          <button onClick={() => openAdd(scratchpad, { clearScratchpadAfterSave: true })} disabled={!scratchpad.trim()} className="min-h-[32px] text-xs font-medium underline underline-offset-4 disabled:opacity-40" style={{ color: "var(--muted)" }}>Turn into contact</button>
          <button onClick={() => { if (!scratchpad.trim()) return; if (!clearConfirm) { setClearConfirm(true); return; } clearScratchpad(); }} disabled={!scratchpad.trim()} className="min-h-[32px] text-xs font-medium underline underline-offset-4 disabled:opacity-40" style={{ color: clearConfirm ? "#DB200D" : "var(--muted)" }}>{clearConfirm ? "Confirm clear" : "Clear"}</button>
        </div>
      </section>

      <section aria-label="Templates" className="mt-14">
        <div className="flex items-center justify-between gap-2">
          <span className="small-caps" style={{ color: "var(--muted)" }}>Templates</span>
          <button onClick={() => setActiveTemplateId(activeTemplateId ? null : (templates[0]?.id || null))} aria-expanded={!!activeTemplateId} aria-label={activeTemplateId ? "Collapse templates" : "Expand templates"} className="flex min-h-[32px] min-w-[32px] items-center justify-center rounded-full" style={{ color: "var(--muted)" }}>
            <ChevronDown size={16} className="transition-transform" style={{ transform: activeTemplateId ? "rotate(180deg)" : "none" }} />
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {templates.map(t => {
            const active = t.id === activeTemplateId;
            return <button key={t.id} onClick={() => setActiveTemplateId(active ? null : t.id)} aria-pressed={active} className="min-h-[32px] rounded-full border px-3 text-xs font-medium" style={active ? { background: "var(--text)", color: "var(--bg)", borderColor: "var(--text)" } : { borderColor: "var(--divider)", color: "var(--muted)" }}>{t.title}</button>;
          })}
        </div>
        {activeTemplate && (
          <div className="mt-6">
            {editingTemplateId === activeTemplate.id ? (
              <div>
                <label htmlFor={`template-${activeTemplate.id}`} className="sr-only">Edit {activeTemplate.title}</label>
                <textarea id={`template-${activeTemplate.id}`} value={templateDraft} onChange={e => setTemplateDraft(e.target.value)} rows={6} className="w-full resize-y border-b bg-transparent pb-2 text-sm leading-relaxed outline-none" style={{ borderColor: "var(--divider)" }} />
                <div className="mt-3 flex items-center gap-5">
                  <button onClick={() => saveTemplate(activeTemplate.id)} className="min-h-[32px] text-xs font-medium underline underline-offset-4" style={{ color: "var(--muted)" }}>Save</button>
                  <button onClick={() => setEditingTemplateId(null)} className="min-h-[32px] text-xs font-medium underline underline-offset-4" style={{ color: "var(--muted)" }}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <p className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: "var(--muted)" }}>{activeTemplate.text}</p>
                <div className="mt-4 flex flex-wrap items-center gap-5">
                  <button onClick={() => copyText(activeTemplate.text, `template-${activeTemplate.id}`)} className="min-h-[32px] text-xs font-medium underline underline-offset-4" style={{ color: "var(--muted)" }}>{copied === `template-${activeTemplate.id}` ? "Copied" : "Copy"}</button>
                  <button onClick={() => openAdd(activeTemplate.text)} className="min-h-[32px] text-xs font-medium underline underline-offset-4" style={{ color: "var(--muted)" }}>Use in new contact</button>
                  <button onClick={() => { setEditingTemplateId(activeTemplate.id); setTemplateDraft(activeTemplate.text); }} className="min-h-[32px] text-xs font-medium underline underline-offset-4" style={{ color: "var(--muted)" }}>Edit</button>
                  <button onClick={resetTemplates} className="min-h-[32px] text-xs font-medium underline underline-offset-4" style={{ color: "var(--muted)" }}>Reset</button>
                </div>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );

  const panelContent = selected ? (
    <div className="flex min-h-0 flex-1 flex-col">
      {prevContact && selected.id !== prevContact.id && (
        <div className="px-6 pt-5 sm:px-7">
          <button onClick={goBack} className="min-h-[32px] text-sm" style={{ color: "var(--muted)" }}>← Back to {prevContact.name}</button>
        </div>
      )}
      <div className="px-6 pt-9 sm:px-7">
        <h2 className="break-words text-[clamp(30px,3vw,36px)] font-semibold leading-[1.1] tracking-[-0.02em]">{selected.value.name}</h2>
        <p className="mt-4 text-[13px] leading-relaxed" style={{ color: "var(--muted)" }}>
          {selected.value.channel || "—"} <span className="mx-1">•</span> {selected.value.outreachDate ? formatDate(selected.value.outreachDate) : "—"} <span className="mx-1">•</span> Updated {new Date(selected.value.updatedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-6 pb-10 pt-2 sm:px-7">
        <div className="mt-10 border-t" style={{ borderColor: "var(--divider)" }}>
          <div className="flex min-h-[40px] items-center gap-3 border-b py-2.5" style={{ borderColor: "var(--divider)" }}>
            <span className="small-caps w-[68px] shrink-0 text-left" style={{ color: "var(--muted)" }}>Contact</span>
            <span className="min-w-0 flex-1 truncate text-left text-sm leading-[1.3]" title={selected.value.contactDetails || undefined} style={!selected.value.contactDetails ? { color: "var(--muted)" } : undefined}>{selected.value.contactDetails || "—"}</span>
            {selected.value.contactDetails ? (
              <button onClick={() => copyText(selected.value.contactDetails, "details")} className="flex min-h-[32px] shrink-0 items-center text-sm font-medium underline decoration-1 underline-offset-4" style={{ color: "var(--muted)" }}>{copied === "details" ? "Copied" : "Copy"}</button>
            ) : (
              <span className="w-[36px] shrink-0" aria-hidden="true" />
            )}
          </div>
          <div className="flex min-h-[40px] items-center gap-3 border-b py-2.5" style={{ borderColor: "var(--divider)" }}>
            <span className="small-caps w-[68px] shrink-0 text-left" style={{ color: "var(--muted)" }}>Link</span>
            {selectedLink ? (
              <a href={selectedLink} target="_blank" rel="noopener noreferrer" title={selectedLink} className="min-w-0 flex-1 truncate text-left text-sm font-medium leading-[1.3] underline decoration-1 underline-offset-4" style={{ color: "var(--brand)" }}>{shortLinkText(selectedLink)}</a>
            ) : (
              <span className="min-w-0 flex-1 truncate text-left text-sm leading-[1.3]" style={{ color: "var(--muted)" }}>No link</span>
            )}
            {selectedLink ? (
              <a href={selectedLink} target="_blank" rel="noopener noreferrer" className="flex min-h-[32px] shrink-0 items-center text-sm font-medium underline decoration-1 underline-offset-4" style={{ color: "var(--muted)" }}>Open</a>
            ) : (
              <button onClick={() => openEdit(selected)} className="flex min-h-[32px] shrink-0 items-center whitespace-nowrap text-sm font-medium underline decoration-1 underline-offset-4" style={{ color: "var(--muted)" }}>Add link</button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4 border-b py-6" style={{ borderColor: "var(--divider)" }}>
            <span className="small-caps" style={{ color: "var(--muted)" }}>Status</span>
            <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
              {(["replied", "followedUp"] as const).map(field => {
                const on = selected.value[field];
                return (
                  <span key={field} className="flex items-center gap-2.5">
                    <span className="text-sm">{field === "replied" ? "Replied" : "Followed up"}</span>
                    <button role="switch" aria-checked={on} aria-pressed={on} aria-label={`Toggle ${field === "replied" ? "Replied" : "Followed up"} for ${selected.value.name}`} onClick={() => toggleStatus(field)} className="relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors" style={{ background: on ? "var(--text)" : "var(--divider)" }}>
                      <span className="absolute top-[3px] h-[16px] w-[16px] rounded-full shadow transition-all" style={{ left: on ? 19 : 3, background: "var(--bg)" }} />
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        </div>
        <section className="mt-12">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="notes-editor" className="small-caps" style={{ color: "var(--muted)" }}>Notes</label>
            {notesSavedAt && !notesSaving ? <span className="text-xs" style={{ color: "var(--muted)" }}>Saved • {notesSavedAt}</span> : <span />}
          </div>
          <textarea id="notes-editor" value={notesDraft} onChange={e => onNotesChange(e.target.value)} onBlur={() => saveNotesNow(notesDraft)} placeholder="Add context, what you sent, what they said, next step…" className="mt-2 w-full resize-y border-0 border-b bg-transparent px-0 py-3 text-[15px] leading-[1.8] outline-none" style={{ borderColor: "var(--divider)", minHeight: 180 }} />
        </section>
      </div>
      <div className="flex items-center justify-between gap-4 border-t px-6 py-4 sm:px-7" style={{ borderColor: "var(--divider)" }}>
        <button onClick={() => openEdit(selected)} className="min-h-[36px] text-sm font-medium underline decoration-1 underline-offset-4" style={{ color: "var(--brand)" }}>Edit contact</button>
        <button onClick={() => setDeleteTarget(selected)} className="min-h-[36px] text-sm font-medium underline decoration-1 underline-offset-4" style={{ color: "var(--muted)" }}>Delete</button>
      </div>
    </div>
  ) : null;

  const panelHeader = (
    <div className="flex shrink-0 items-center justify-between border-b px-4 py-3 sm:px-5" style={{ borderColor: "var(--divider)" }}>
      <span className="small-caps" style={{ color: "var(--muted)" }}>Details</span>
      <div className="flex items-center gap-1">
        <button onClick={() => setMinimized(true)} className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-[10px]" aria-label="Minimize details" title="Minimize"><Minus size={18} /></button>
        <button onClick={closePanel} className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-[10px]" aria-label="Close details" title="Close"><X size={18} /></button>
      </div>
    </div>
  );

  // --- Auth screens ---
  if (authLoading) {
    return (<div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", display: "flex", alignItems: "center", justifyContent: "center" }}><p style={{ color: "var(--muted)" }}>Loading Reach…</p></div>);
  }
  if (!isSupabaseConfigured) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ maxWidth: 520, width: "100%", textAlign: "center" }}>
          <p className="small-caps" style={{ color: "var(--muted)" }}>Reach • Setup needed</p>
          <h1 className="mt-3 text-[32px] font-semibold">Connect Supabase first</h1>
          <p className="mt-3 leading-relaxed" style={{ color: "var(--muted)" }}>Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel → Settings → Environment Variables, then redeploy. See SUPABASE-SETUP.txt in the files you downloaded.</p>
        </div>
      </div>
    );
  }
  if (!user) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }} className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-[440px]">
          <div className="text-center">
            <span className="mx-auto block h-[10px] w-[10px] rounded-[2px]" style={{ background: "#DB200D" }} />
            <h1 className="mt-4 text-[34px] font-semibold tracking-[-0.02em]">Reach</h1>
            <p className="mt-1 text-[15px]" style={{ color: "var(--muted)" }}>Outreach, curated. Your data, only yours.</p>
          </div>
          <div className="mt-8 rounded-[16px] border p-6" style={{ borderColor: "var(--divider)", background: "var(--surface)", boxShadow: "var(--shadow)" }}>
            <p className="small-caps" style={{ color: "var(--muted)" }}>Sign in</p>
            <h2 className="mt-2 text-[22px] font-semibold">Your outreach follows you</h2>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>Enter your email. We will send you a magic link. No password to remember. Each account sees only its own contacts.</p>
            {authSent ? (
              <div className="mt-5 rounded-[12px] border p-4" style={{ borderColor: "var(--divider)" }}>
                <p className="font-medium">Check your inbox</p>
                <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>We sent a sign-in link to <b style={{ color: "var(--text)" }}>{authEmail}</b>. Open it on this device. It expires in 1 hour.</p>
                <button onClick={() => setAuthSent(false)} className="mt-3 text-sm font-medium underline underline-offset-4" style={{ color: "var(--brand)" }}>Use a different email</button>
              </div>
            ) : (
              <form onSubmit={handleSendMagicLink} className="mt-5 space-y-3">
                <label className="small-caps block" style={{ color: "var(--muted)" }}>Email</label>
                <input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="you@example.com" required className="h-[48px] w-full rounded-[12px] border px-3.5 text-[15px]" style={{ borderColor: "var(--divider)", background: "var(--input)" }} />
                {authError && <p role="alert" className="text-sm font-medium" style={{ color: "#DB200D" }}>{authError}</p>}
                <button type="submit" disabled={authBusy} className="min-h-[48px] w-full rounded-[12px] text-sm font-medium text-white disabled:opacity-50" style={{ background: "#DB200D" }}>{authBusy ? "Sending…" : "Send magic link"}</button>
                <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>By signing in you agree your contacts are stored privately under your account. You can export or delete all your data anytime from Settings.</p>
              </form>
            )}
          </div>
          <p className="mt-4 text-center text-xs" style={{ color: "var(--muted)" }}>Data saved in Supabase • Row Level Security • You own your data</p>
        </div>
      </div>
    );
  }

  return (
    <div data-safe-area-inset-root style={{ boxSizing: "border-box", paddingTop: "var(--safe-area-inset-top)", minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }} className="overflow-x-clip">
      <header data-safe-area-sticky-top style={{ top: "var(--safe-area-inset-top)", background: "var(--bg)", borderColor: "var(--divider)" }} className="sticky z-30 border-b">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6 lg:flex-nowrap lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <span className="h-[10px] w-[10px] shrink-0 rounded-[2px]" style={{ background: "#DB200D" }} aria-hidden="true" />
            <div className="min-w-0"><p className="truncate text-[19px] font-medium leading-none tracking-[-0.01em]">Reach</p><p className="mt-1 truncate text-xs" style={{ color: "var(--muted)" }}>Outreach, curated.</p></div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="flex rounded-[12px] border p-1" style={{ borderColor: "var(--divider)", background: "var(--bg-soft)" }} role="group" aria-label="Theme">
              {([{ v: "system", label: "System", Icon: Monitor }, { v: "light", label: "Light", Icon: Sun }, { v: "dark", label: "Dark", Icon: Moon }] as const).map(({ v, label, Icon }) => (
                <button key={v} onClick={() => changeTheme(v)} aria-pressed={themeMode === v} className="flex min-h-[36px] items-center gap-1.5 rounded-[9px] px-2.5 text-xs font-medium sm:px-3" style={themeMode === v ? { background: "var(--text)", color: "var(--bg)" } : { color: "var(--muted)" }}><Icon size={14} /><span className="hidden sm:inline">{label}</span><span className="sm:hidden">{label.slice(0, 1)}</span></button>
              ))}
            </div>
            <button onClick={exportCSV} className="flex min-h-[44px] items-center gap-2 rounded-[12px] border px-3.5 text-sm font-medium sm:px-4" style={{ borderColor: "var(--divider)" }}><Download size={16} /><span className="hidden sm:inline">Export spreadsheet</span><span className="sm:hidden">Export</span></button>
            <button onClick={() => openAdd()} className="flex min-h-[44px] items-center gap-2 rounded-[12px] px-4 text-sm font-medium text-white" style={{ background: "#DB200D" }}><Plus size={17} /> Add contact</button>
            <div className="hidden items-center gap-2 md:flex"><span className="max-w-[180px] truncate rounded-full border px-3 py-2 text-xs font-medium" style={{ borderColor: "var(--divider)" }} title={user?.email || ""}>{user?.email || "Signed in"}</span><button onClick={handleSignOut} className="min-h-[36px] text-xs font-medium underline underline-offset-4" style={{ color: "var(--muted)" }}>Sign out</button></div>
            <button onClick={() => openSettings("profile")} aria-label="Open settings" title="Settings" className="flex min-h-[44px] items-center gap-2">
              <span className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full text-[16px] font-semibold" style={{ background: "#0D0D0C", color: "#F0EBE7" }} aria-hidden="true">{headerInitials}</span>
              {profile.name ? <span className="hidden max-w-[120px] truncate text-sm font-medium sm:inline">{profile.name}</span> : null}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-0 sm:px-6 lg:flex lg:max-w-none lg:items-start lg:px-0">
        <section className="min-w-0 flex-1 lg:px-8 lg:py-6">
          <div className="px-4 pt-5 sm:px-0 lg:pt-0">
            <p className="small-caps" style={{ color: "var(--muted)" }}>Your outreach</p>
            <h1 className="mt-2 text-[clamp(30px,4vw,44px)] font-semibold leading-[1.05] tracking-[-0.025em]">Every conversation,<br className="hidden sm:block" /> held with care.</h1>
            <p className="mt-3 max-w-[560px] text-[15px] leading-relaxed" style={{ color: "var(--muted)" }}>Track who you reached out to, what was said, and what comes next — without losing the human thread.</p>
          </div>

          <div className="mt-6 flex flex-col gap-3 px-4 sm:px-0 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--muted)" }} />
              <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, channel, contact, or link…" aria-label="Search contacts" className="h-[48px] w-full rounded-[12px] border pl-10 pr-10 text-[15px]" style={{ borderColor: "var(--divider)", background: "var(--input)" }} />
              {search && <button onClick={() => setSearch("")} aria-label="Clear search" className="absolute right-2 top-1/2 flex h-[32px] w-[32px] -translate-y-1/2 items-center justify-center rounded-full"><X size={16} /></button>}
            </div>
            <div className="flex gap-1 overflow-x-auto no-scrollbar" role="tablist" aria-label="Filter contacts">
              {([{ v: "all", label: "All" }, { v: "to-reach", label: "To reach" }, { v: "replied", label: "Replied" }, { v: "followed", label: "Followed up" }] as const).map(f => (
                <button key={f.v} role="tab" aria-selected={filter === f.v} onClick={() => { setFilter(f.v); setActiveFocus(null); }} className="h-[40px] shrink-0 rounded-full px-3.5 text-sm font-medium" style={filter === f.v ? { background: "var(--text)", color: "var(--bg)" } : { color: "var(--muted)" }}>{f.label}</button>
              ))}
            </div>
          </div>
          <p className="mt-4 px-4 text-sm sm:px-0" style={{ color: "var(--muted)" }} aria-live="polite">{counts.total} contacts • {counts.replied} replied • {counts.followed} followed up</p>
          {activeFocus && <div className="mt-3 flex flex-wrap items-center gap-2 px-4 sm:px-0"><span className="inline-flex min-h-[32px] items-center rounded-full px-3 text-xs font-medium" style={{ background: "var(--text)", color: "var(--bg)" }}>Showing: {activeFocus}</span><button onClick={() => { setActiveFocus(null); setFilter("all"); }} className="min-h-[32px] rounded-full border px-3 text-xs font-medium" style={{ borderColor: "var(--divider)" }}>Clear</button></div>}
          {!selected && <div className="mt-3 px-4 sm:px-0 lg:hidden"><button onClick={() => { setPanelOpen(true); setMinimized(false); }} className="min-h-[40px] rounded-[10px] border px-3.5 text-sm font-medium" style={{ borderColor: "var(--divider)" }}>Today focus &amp; quick capture</button></div>}

          {loadError && <div className="mx-4 mt-4 flex items-start gap-3 rounded-[12px] border p-4 sm:mx-0" style={{ borderColor: "var(--divider)" }}><AlertTriangle size={18} className="mt-0.5 shrink-0" /><div><p className="text-sm font-medium">Couldn’t reach your saved contacts.</p><p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>{loadError}</p><button onClick={loadAll} className="mt-3 min-h-[40px] rounded-[10px] border px-3 text-sm font-medium" style={{ borderColor: "var(--divider)" }}>Try again</button></div></div>}

          <div className="mt-3 border-t" style={{ borderColor: "var(--divider)" }}>
            {loading ? <p className="px-4 py-12 text-center text-sm" style={{ color: "var(--muted)" }}>Loading your outreach…</p> : filtered.length === 0 ? (
              contacts.length === 0 && !search && filter === "all" ? (
                <div className="px-4 py-16 text-center sm:py-20">
                  <p className="text-[26px] font-medium tracking-[-0.01em]">No contacts yet.</p>
                  <p className="mx-auto mt-3 max-w-[420px] leading-relaxed" style={{ color: "var(--muted)" }}>Add your first outreach to start tracking replies and follow-ups.</p>
                  <button onClick={() => openAdd()} className="mt-6 inline-flex min-h-[46px] items-center gap-2 rounded-[12px] px-5 text-sm font-medium text-white" style={{ background: "#DB200D" }}><Plus size={17} /> Add contact</button>
                </div>
              ) : (
                <div className="px-4 py-14 text-center"><p className="text-xl font-medium">No matches</p><p className="mt-2" style={{ color: "var(--muted)" }}>Try a different search or filter.</p><button onClick={() => { setSearch(""); setFilter("all"); }} className="mt-5 min-h-[44px] rounded-[12px] border px-4 text-sm font-medium" style={{ borderColor: "var(--divider)" }}>Clear search &amp; filters</button></div>
              )
            ) : filtered.map(c => {
              const isSel = c.id === selectedId;
              const norm = displayLink(c);
              return (
                <article key={c.id} onClick={() => selectContact(c.id)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectContact(c.id); } }} tabIndex={0} aria-label={`Open details for ${c.value.name}`} className="relative cursor-pointer" style={{ background: isSel ? "var(--tint)" : "transparent", borderBottom: "1px solid var(--divider)", padding: "14px 20px" }}>
                  <div className="flex flex-col gap-1 lg:grid lg:items-center lg:gap-4 lg:grid-cols-[minmax(200px,1.5fr)_minmax(180px,1.1fr)_88px_76px]">
                    <div className="min-w-0">
                      <h3 className="truncate text-[16px]" style={{ lineHeight: 1.3, fontWeight: isSel ? 600 : 500 }}>{c.value.name}</h3>
                      <p className="truncate text-[13px]" style={{ color: "var(--muted)", lineHeight: 1.3 }}>{c.value.channel || "—"} <span className="mx-1">•</span> {c.value.outreachDate ? formatDate(c.value.outreachDate) : "—"}</p>
                      {(c.value.replied || c.value.followedUp) && (
                        <span className="mt-1 flex gap-2 lg:hidden">
                          {c.value.replied && <span className="inline-flex items-center gap-1.5 text-xs font-medium"><span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--text)" }} />Replied</span>}
                          {c.value.followedUp && <span className="inline-flex items-center gap-1.5 text-xs font-medium"><span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--muted)" }} />Followed up</span>}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0"><p className="truncate text-left text-sm" title={c.value.contactDetails || undefined} style={{ lineHeight: 1.3, color: c.value.contactDetails ? undefined : "var(--muted)" }}>{c.value.contactDetails || "—"}</p></div>
                    <div className="flex items-center justify-between gap-3 lg:contents">
                      <div className="min-w-0 text-left">
                        {norm ? <a href={norm} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="flex h-8 items-center gap-1 whitespace-nowrap text-sm font-medium" style={{ color: "var(--brand)", lineHeight: 1.3 }} aria-label={`Open link for ${c.value.name}`}>Link <ExternalLink size={13} /></a> : <span className="flex h-8 items-center text-sm" style={{ color: "var(--muted)", lineHeight: 1.3 }}>—</span>}
                      </div>
                      <div className="flex shrink-0 items-center justify-end gap-2 lg:w-[76px]" onClick={e => e.stopPropagation()}>
                        <button onClick={() => openEdit(c)} aria-label={`Edit ${c.value.name}`} title={`Edit ${c.value.name}`} className="flex h-8 w-8 items-center justify-center rounded-[8px]"><Pencil size={15} /></button>
                        <button onClick={() => setDeleteTarget(c)} aria-label={`Delete ${c.value.name}`} title={`Delete ${c.value.name}`} className="flex h-8 w-8 items-center justify-center rounded-[8px]"><Trash2 size={15} /></button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          <footer className="px-4 py-6 text-xs sm:px-2" style={{ color: "var(--muted)" }}>{counts.total} contacts • Data saved to your private account • {user?.email || ""}</footer>
          <div className="px-4 py-3 text-xs sm:px-2" style={{ color: "var(--muted)" }}>
            Signed in as {user?.email} • <button onClick={handleSignOut} className="underline underline-offset-4" style={{ color: "var(--brand)" }}>Sign out</button> • <button onClick={() => setShowDeleteAll(true)} className="underline underline-offset-4" style={{ color: "#DB200D" }}>Delete all my data</button>
          </div>
          {showDeleteAll && (
            <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Delete all my data">
              <button aria-label="Close" onClick={() => setShowDeleteAll(false)} className="absolute inset-0 bg-black/35" />
              <div className="relative w-full max-w-[460px] rounded-t-[16px] p-6 sm:rounded-[16px]" style={{ background: "var(--surface)", boxShadow: "var(--shadow)" }}>
                <h2 className="text-[22px] font-semibold">Delete all my data?</h2>
                <p className="mt-2 leading-relaxed" style={{ color: "var(--muted)" }}>This will permanently delete all your contacts, notes, templates and settings from your account. This cannot be undone. Your login account will remain, but with no data.</p>
                <div className="mt-6 flex gap-2"><button onClick={() => setShowDeleteAll(false)} className="min-h-[46px] flex-1 rounded-[12px] border text-sm font-medium" style={{ borderColor: "var(--divider)" }}>Cancel</button><button onClick={handleDeleteAllMyData} disabled={deleteAllBusy} className="min-h-[46px] flex-1 rounded-[12px] text-sm font-medium text-white disabled:opacity-50" style={{ background: "#DB200D" }}>{deleteAllBusy ? "Deleting…" : "Delete everything"}</button></div>
              </div>
            </div>
          )}
        </section>
        {isDesktop && (
          <aside aria-label="Contact details" className="relative sticky flex shrink-0 flex-col border-l" style={{ top: "calc(var(--safe-area-inset-top) + 69px)", height: "calc(100vh - var(--safe-area-inset-top) - 69px)", width: minimized ? 56 : panelWidth, borderColor: "var(--divider)", background: "var(--bg)" }}>
            {!minimized && (
              <>
                <div role="separator" aria-orientation="vertical" aria-label="Resize details panel" aria-valuenow={panelWidth} aria-valuemin={360} aria-valuemax={540} tabIndex={0} onKeyDown={e => { if (e.key === "ArrowLeft") setPanelWidth(w => Math.max(360, w - 20)); if (e.key === "ArrowRight") setPanelWidth(w => Math.min(540, w + 20)); }} onMouseDown={startResize} className="absolute bottom-0 left-0 top-0 z-10 flex w-[12px] -translate-x-[6px] cursor-ew-resize items-center justify-center opacity-0 hover:opacity-100 focus:opacity-100" style={{ background: "transparent" }}><span className="flex h-[44px] w-[8px] items-center justify-center rounded-full" style={{ background: "var(--divider)" }}><GripVertical size={12} style={{ color: "var(--muted)" }} /></span></div>
                {panelHeader}
                {selected ? (
                  <div key={selected.id} className="animate-swap flex min-h-0 flex-1 flex-col">{panelContent}</div>
                ) : (
                  <div className="flex min-h-0 flex-1 flex-col">{emptyPanel}</div>
                )}
              </>
            )}
            {minimized && (
              <div className="flex min-h-0 flex-1 flex-col items-center gap-4 py-4">
                <button onClick={() => setMinimized(false)} className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-[10px]" aria-label="Expand details" title="Expand details"><ChevronUp size={18} className="-rotate-90" /></button>
                <span className="small-caps" style={{ color: "var(--muted)", writingMode: "vertical-rl" }}>Details</span>
              </div>
            )}
          </aside>
        )}
      </main>

      {isTablet && panelOpen && !minimized && (
        <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label="Contact details">
          <button aria-label="Close details" onClick={closePanel} className="absolute inset-0 bg-black/30" />
          <aside className="animate-fade relative flex w-[min(520px,92vw)] flex-col" style={{ background: "var(--surface)" }}>{panelHeader}{selected ? <div key={selected.id} className="animate-swap flex min-h-0 flex-1 flex-col">{panelContent}</div> : <div className="flex min-h-0 flex-1 flex-col">{emptyPanel}</div>}</aside>
        </div>
      )}

      {isMobile && panelOpen && !minimized && (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Contact details">
          <button aria-label="Close details" onClick={closePanel} className="absolute inset-0 bg-black/30" />
          <section className="absolute inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-[16px]" style={{ height: `${sheetPct}vh`, background: "var(--surface)" }}>
            <div onPointerDown={startSheetDrag} className="flex shrink-0 cursor-grab flex-col items-center gap-1 pt-2.5 pb-1 active:cursor-grabbing" aria-label="Drag to resize sheet"><span className="h-[4px] w-[40px] rounded-full" style={{ background: "var(--divider)" }} /><span className="text-xs" style={{ color: "var(--muted)" }}>Drag to resize</span></div>
            <div className="flex items-center justify-between px-3">
              <button onClick={() => setSheetPct(p => p > 60 ? 35 : 88)} className="flex min-h-[40px] items-center gap-1 px-2 text-sm font-medium">{sheetPct > 60 ? <><ChevronDown size={17} /> Collapse</> : <><ChevronUp size={17} /> Expand</>}</button>
              <div className="flex items-center gap-1"><button onClick={() => setMinimized(true)} className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-[10px]" aria-label="Minimize details" title="Minimize"><Minus size={18} /></button><button onClick={closePanel} className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-[10px]" aria-label="Close details" title="Close"><X size={18} /></button></div>
            </div>
            {selected ? <div key={selected.id} className="animate-swap flex min-h-0 flex-1 flex-col">{panelContent}</div> : <div className="flex min-h-0 flex-1 flex-col">{emptyPanel}</div>}
          </section>
        </div>
      )}

      {(isMobile || isTablet) && panelOpen && minimized && selected && (
        <button onClick={() => setMinimized(false)} className="fixed bottom-4 left-4 right-4 z-40 flex min-h-[52px] items-center justify-between rounded-[14px] border px-4 text-left shadow-lg" style={{ background: "var(--surface)", borderColor: "var(--divider)" }}>
          <span className="min-w-0"><span className="small-caps block" style={{ color: "var(--muted)" }}>Minimized</span><span className="block truncate font-medium">{selected.value.name}</span></span><span className="flex items-center gap-1 text-sm font-medium" style={{ color: "var(--brand)" }}><ChevronUp size={17} /> Expand</span>
        </button>
      )}

      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Settings">
          <button aria-label="Close settings" onClick={() => setSettingsOpen(false)} className="absolute inset-0 bg-black/35" />
          <div className="animate-fade relative max-h-[92vh] w-full max-w-[620px] overflow-y-auto rounded-t-[16px] p-5 sm:rounded-[16px] sm:p-6" style={{ background: "var(--surface)", boxShadow: "var(--shadow)" }}>
            <div className="flex items-start justify-between gap-4"><div><p className="small-caps" style={{ color: "var(--muted)" }}>Settings</p><h2 className="mt-2 text-[24px] font-semibold">Profile &amp; Shortcuts</h2></div><button onClick={() => setSettingsOpen(false)} aria-label="Close settings" className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-[10px]"><X size={19} /></button></div>
            <div className="mt-5 flex gap-1 border-b" style={{ borderColor: "var(--divider)" }} role="tablist" aria-label="Settings tabs">
              {(["profile", "shortcuts"] as const).map(t => (
                <button key={t} role="tab" aria-selected={settingsTab === t} onClick={() => setSettingsTab(t)} className="min-h-[40px] px-4 text-sm font-medium" style={settingsTab === t ? { borderBottom: "2px solid var(--text)" } : { color: "var(--muted)", borderBottom: "2px solid transparent" }}>{t === "profile" ? "Profile" : "Shortcuts"}</button>
              ))}
            </div>
            {settingsTab === "profile" ? (
              <div className="pt-6">
                <div className="flex flex-col items-center text-center">
                  <span className="flex h-[96px] w-[96px] items-center justify-center rounded-full text-[34px] font-semibold" style={{ background: "#0D0D0C", color: "#F0EBE7" }} aria-hidden="true">{draftInitials}</span>
                  <button type="button" disabled aria-disabled="true" title="Photo upload is not available yet" className="mt-4 min-h-[44px] cursor-not-allowed rounded-[12px] border px-4 text-sm font-medium opacity-50" style={{ borderColor: "var(--divider)" }}>Upload your photo</button>
                  <p className="mt-2 max-w-[340px] text-xs leading-relaxed" style={{ color: "var(--muted)" }}>Photo upload is not available yet in this app — your initials will show until then.</p>
                </div>
                <div className="mt-7"><label htmlFor="profile-name" className="small-caps block" style={{ color: "var(--muted)" }}>Name</label><input id="profile-name" value={profileDraft.name} onChange={e => setProfileDraft(d => ({ ...d, name: e.target.value }))} placeholder="Your name" className="mt-2 h-[48px] w-full rounded-[12px] border px-3.5 text-[15px]" style={{ borderColor: "var(--divider)", background: "var(--input)" }} /></div>
                <div className="mt-8">
                  <h3 className="text-[16px] font-semibold">Link social accounts</h3>
                  <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>Add a handle or a full URL for each account. Linked accounts save with your profile.</p>
                  <div className="mt-4 space-y-4">
                    {profileDraft.socials.map(s => s.custom ? (
                      <div key={s.id} className="space-y-2">
                        <div className="flex gap-2">
                          <input aria-label="Platform name" value={s.platform} onChange={e => updateSocial(s.id, "platform", e.target.value)} placeholder="Platform name" className="h-[48px] min-w-0 flex-1 rounded-[12px] border px-3.5 text-[15px]" style={{ borderColor: "var(--divider)", background: "var(--input)" }} />
                          <button onClick={() => removeCustomSocial(s.id)} aria-label="Remove custom platform" className="flex min-h-[44px] shrink-0 items-center rounded-[10px] border px-3 text-sm font-medium" style={{ borderColor: "var(--divider)", color: "var(--muted)" }}>Remove</button>
                        </div>
                        <input aria-label={`Handle or URL for ${s.platform || "custom platform"}`} value={s.value} onChange={e => updateSocial(s.id, "value", e.target.value)} placeholder="@handle or https://..." className="h-[48px] w-full rounded-[12px] border px-3.5 text-[15px]" style={{ borderColor: "var(--divider)", background: "var(--input)" }} />
                      </div>
                    ) : (
                      <div key={s.id}>
                        <label htmlFor={`social-${s.id}`} className="small-caps block" style={{ color: "var(--muted)" }}>{s.platform}</label>
                        <input id={`social-${s.id}`} value={s.value} onChange={e => updateSocial(s.id, "value", e.target.value)} placeholder={socialPlaceholder(s.platform)} className="mt-2 h-[48px] w-full rounded-[12px] border px-3.5 text-[15px]" style={{ borderColor: "var(--divider)", background: "var(--input)" }} />
                      </div>
                    ))}
                  </div>
                  <button onClick={addCustomSocial} className="mt-4 min-h-[40px] rounded-[10px] border px-4 text-sm font-medium" style={{ borderColor: "var(--divider)" }}>+ Add another</button>
                  {linkedSocials.length > 0 && (
                    <div className="mt-6">
                      <p className="small-caps" style={{ color: "var(--muted)" }}>Linked accounts</p>
                      <ul className="mt-2 border-t" style={{ borderColor: "var(--divider)" }}>
                        {linkedSocials.map(s => (
                          <li key={s.id} className="flex items-center justify-between gap-3 border-b py-3" style={{ borderColor: "var(--divider)" }}>
                            <span className="text-sm font-medium">{s.platform || "Custom platform"}</span>
                            <a href={socialHref(s.platform, s.value)} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-sm font-medium underline decoration-1 underline-offset-4" style={{ color: "var(--brand)" }}>{socialDisplay(s.platform, s.value)}</a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <div className="mt-8 flex gap-2"><button onClick={() => setSettingsOpen(false)} className="min-h-[46px] flex-1 rounded-[12px] border text-sm font-medium" style={{ borderColor: "var(--divider)" }}>Cancel</button><button onClick={saveProfile} className="min-h-[46px] flex-1 rounded-[12px] text-sm font-medium text-white" style={{ background: "#DB200D" }}>Save profile</button></div>
              </div>
            ) : (
              <div className="pt-2">
                <p className="mt-4 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>Shortcuts pause while typing, except Esc and Ctrl/Cmd + Enter. Press <span className="font-medium" style={{ color: "var(--text)" }}>?</span> to open this tab.</p>
                {SHORTCUT_GROUPS.map(g => (
                  <div key={g.group} className="mt-7">
                    <p className="small-caps" style={{ color: "var(--muted)" }}>{g.group}</p>
                    <div className="mt-2 border-t" style={{ borderColor: "var(--divider)" }}>
                      {g.items.map(item => {
                        const isCapturing = capturing === item.action;
                        return (
                          <div key={item.action} className="flex min-h-[48px] items-center justify-between gap-3 border-b py-2" style={{ borderColor: "var(--divider)" }}>
                            <span className="min-w-0 text-sm">{item.label}</span>
                            <span className="flex shrink-0 items-center gap-2">
                              <span className="inline-flex min-h-[28px] items-center rounded-full border px-2.5 text-xs font-medium" style={{ borderColor: "var(--divider)", color: "var(--muted)" }}>{isCapturing ? "Press a key…" : displayShortcut(shortcuts[item.action])}{item.action === "next" ? " / ↓" : item.action === "prev" ? " / ↑" : ""}</span>
                              <button onClick={() => setCapturing(item.action)} className="min-h-[32px] rounded-full border px-3 text-xs font-medium" style={{ borderColor: "var(--divider)" }}>{isCapturing ? "Cancel" : "Change"}</button>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {capturing && <p role="status" className="mt-4 text-sm" style={{ color: "var(--muted)" }}>Press a key… Esc cancels.</p>}
                <div className="mt-6 flex gap-2"><button onClick={resetShortcuts} className="min-h-[46px] flex-1 rounded-[12px] border text-sm font-medium" style={{ borderColor: "var(--divider)" }}>Reset to defaults</button><button onClick={saveShortcuts} className="min-h-[46px] flex-1 rounded-[12px] text-sm font-medium text-white" style={{ background: "#DB200D" }}>Save shortcuts</button></div>
              </div>
            )}
          </div>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={modal.mode === "add" ? "Add contact" : "Edit contact"}>
          <button aria-label="Close dialog" onClick={() => !busy && setModal(null)} className="absolute inset-0 bg-black/35" />
          <div ref={formRef} className="animate-fade relative max-h-[92vh] w-full max-w-[620px] overflow-y-auto rounded-t-[16px] p-5 sm:rounded-[16px] sm:p-6" style={{ background: "var(--surface)", boxShadow: "var(--shadow)" }}>
            <div className="flex items-start justify-between gap-4"><div><p className="small-caps" style={{ color: "var(--muted)" }}>{modal.mode === "add" ? "New outreach" : "Edit contact"}</p><h2 className="mt-2 text-[24px] font-semibold">{modal.mode === "add" ? "Add contact" : `Edit ${modal.contact.value.name}`}</h2></div><button onClick={() => setModal(null)} aria-label="Close form" className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-[10px]"><X size={19} /></button></div>
            <form className="mt-5 space-y-4" onSubmit={e => { e.preventDefault(); submitForm(); }}>
              <div><label htmlFor="f-name" className="small-caps block" style={{ color: "var(--muted)" }}>Name *</label><input id="f-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="Full name or studio" className="mt-2 h-[48px] w-full rounded-[12px] border px-3.5 text-[15px]" style={{ borderColor: "var(--divider)", background: "var(--input)" }} /></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label htmlFor="f-channel" className="small-caps block" style={{ color: "var(--muted)" }}>Channel</label><input id="f-channel" list="channel-suggestions" value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value })} placeholder="Instagram, Email, Studio…" className="mt-2 h-[48px] w-full rounded-[12px] border px-3.5 text-[15px]" style={{ borderColor: "var(--divider)", background: "var(--input)" }} /><datalist id="channel-suggestions"><option value="Instagram" /><option value="X (Twitter)" /><option value="TikTok" /><option value="YouTube" /><option value="LinkedIn" /><option value="Behance" /><option value="Dribbble" /><option value="Pinterest" /><option value="WhatsApp" /><option value="Telegram" /><option value="Email" /><option value="Website" /><option value="Portfolio" /><option value="Studio visit" /></datalist></div>
                <div><label htmlFor="f-date" className="small-caps block" style={{ color: "var(--muted)" }}>Outreach date</label><input id="f-date" type="date" value={form.outreachDate} onChange={e => setForm({ ...form, outreachDate: e.target.value })} className="mt-2 h-[48px] w-full rounded-[12px] border px-3.5 text-[15px]" style={{ borderColor: "var(--divider)", background: "var(--input)" }} /></div>
              </div>
              <div><label htmlFor="f-details" className="small-caps block" style={{ color: "var(--muted)" }}>Contact details</label><input id="f-details" value={form.contactDetails} onChange={e => setForm({ ...form, contactDetails: e.target.value })} placeholder="@handle, email, or phone" className="mt-2 h-[48px] w-full rounded-[12px] border px-3.5 text-[15px]" style={{ borderColor: "var(--divider)", background: "var(--input)" }} /></div>
              <div><label htmlFor="f-link" className="small-caps block" style={{ color: "var(--muted)" }}>Link</label><input id="f-link" value={form.link} onChange={e => setForm({ ...form, link: e.target.value })} placeholder="https://…" className="mt-2 h-[48px] w-full rounded-[12px] border px-3.5 text-[15px]" style={{ borderColor: "var(--divider)", background: "var(--input)" }} /><p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>Tip: just type a handle or a domain slash handle — we will complete it using the channel.</p>{showPreview && <p className="mt-1 break-all text-xs leading-relaxed" style={{ color: "var(--muted)" }}>Will save as: <a href={previewLink} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2" style={{ color: "var(--brand)" }}>{previewLink}</a></p>}</div>
              <div className="flex flex-wrap gap-2">
                {(["replied", "followedUp"] as const).map(k => (
                  <label key={k} className="flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-[12px] border px-3.5 text-sm font-medium" style={{ borderColor: "var(--divider)" }}><input type="checkbox" checked={form[k]} onChange={e => setForm({ ...form, [k]: e.target.checked })} className="h-[18px] w-[18px]" style={{ accentColor: "var(--text)" }} /> {k === "replied" ? "Replied" : "Followed up"}</label>
                ))}
              </div>
              <div><label htmlFor="f-notes" className="small-caps block" style={{ color: "var(--muted)" }}>Notes</label><textarea id="f-notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={4} placeholder="Context, next step…" className="mt-2 w-full resize-y rounded-[12px] border px-3.5 py-3 text-[15px] leading-relaxed" style={{ borderColor: "var(--divider)", background: "var(--input)", minHeight: 110 }} /></div>
              {formError && <p role="alert" className="text-sm font-medium" style={{ color: "#DB200D" }}>{formError}</p>}
              <div className="flex gap-2 pt-1"><button type="button" onClick={() => setModal(null)} className="min-h-[46px] flex-1 rounded-[12px] border text-sm font-medium" style={{ borderColor: "var(--divider)" }}>Cancel</button><button type="submit" disabled={busy || !form.name.trim()} className="min-h-[46px] flex-1 rounded-[12px] text-sm font-medium text-white disabled:opacity-50" style={{ background: "#DB200D" }}>{busy ? "Saving…" : modal.mode === "add" ? "Add contact" : "Save changes"}</button></div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Delete contact">
          <button aria-label="Close delete dialog" onClick={() => setDeleteTarget(null)} className="absolute inset-0 bg-black/35" />
          <div className="relative w-full max-w-[460px] rounded-t-[16px] p-6 sm:rounded-[16px]" style={{ background: "var(--surface)", boxShadow: "var(--shadow)" }}>
            <div className="flex h-[44px] w-[44px] items-center justify-center rounded-full" style={{ background: "var(--tint)" }}><Trash2 size={19} style={{ color: "#DB200D" }} /></div>
            <h2 className="mt-4 text-[22px] font-semibold">Delete {deleteTarget.value.name}?</h2>
            <p className="mt-2 leading-relaxed" style={{ color: "var(--muted)" }}>This will permanently remove this contact and its notes.</p>
            <div className="mt-6 flex gap-2"><button onClick={() => setDeleteTarget(null)} className="min-h-[46px] flex-1 rounded-[12px] border text-sm font-medium" style={{ borderColor: "var(--divider)" }}>Cancel</button><button onClick={confirmDelete} disabled={busy} className="min-h-[46px] flex-1 rounded-[12px] text-sm font-medium text-white disabled:opacity-50" style={{ background: "#DB200D" }}>{busy ? "Deleting…" : "Delete"}</button></div>
          </div>
        </div>
      )}

      {toast && <div role="status" className="toast-in fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full px-4 py-3 text-sm font-medium text-white shadow-lg" style={{ background: "#0D0D0C" }}><Check size={16} /> {toast}</div>}
    </div>
  );
}
