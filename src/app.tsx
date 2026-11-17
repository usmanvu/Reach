import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase, isSupabaseConfigured } from "./supabaseClient";
import {
  Search,
  Plus,
  Download,
  Trash2,
  X,
  ExternalLink,
  Copy,
  Check,
  AlertTriangle,
  Sun,
  Moon,
  Monitor,
  Camera,
  Command,
  CornerDownLeft,
  ArrowUpRight,
  Clock,
} from "lucide-react";

type Stage = "to-reach" | "pitched" | "in-conversation" | "follow-up" | "won" | "paused" | "archived";
type WorkType = "branding" | "editorial" | "social" | "collaboration" | "other" | "";
type ContactValue = {
  name: string;
  channel: string;
  outreachDate: string;
  contactDetails: string;
  link: string;
  replied: boolean;
  followedUp: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
  stage?: Stage;
  whyThem?: string;
  whatSent?: string;
  nextStep?: string;
  workType?: WorkType;
  followUpDate?: string;
  featuredLink?: string;
  testimonial?: string;
  referredById?: string;
  deletedAt?: string;
  winNote?: string;
};
type Contact = { id: string; value: ContactValue };
type ThemeMode = "system" | "light" | "dark";
type NavView = "queue" | "pipeline" | "archived";
type TemplateItem = { id: string; title: string; text: string; workType?: WorkType; portfolioLink?: string };
type ProfileValue = {
  name: string;
  avatarUrl?: string;
  whatIDo?: string;
  openFor?: string;
  featuredLink?: string;
};
type SaveStatus = "idle" | "saving" | "saved" | "error";

const DEFAULT_PROFILE: ProfileValue = {
  name: "",
  avatarUrl: "",
  whatIDo: "",
  openFor: "",
  featuredLink: "",
};

const STAGES: { value: Stage; label: string; key: string; dot: string }[] = [
  { value: "to-reach", label: "To reach", key: "1", dot: "#6B6660" },
  { value: "pitched", label: "Pitched", key: "2", dot: "#A8A29E" },
  { value: "in-conversation", label: "In convo", key: "3", dot: "#1A9A4A" },
  { value: "follow-up", label: "Follow-up", key: "4", dot: "#DB200D" },
  { value: "won", label: "Won", key: "5", dot: "#1A9A4A" },
  { value: "paused", label: "Paused", key: "6", dot: "#6B6660" },
  { value: "archived", label: "Archived", key: "7", dot: "#6B6660" },
];

const WORK_TYPES: { value: WorkType; label: string }[] = [
  { value: "", label: "Any work" },
  { value: "branding", label: "Branding" },
  { value: "editorial", label: "Editorial" },
  { value: "social", label: "Social" },
  { value: "collaboration", label: "Collab" },
  { value: "other", label: "Other" },
];

const DEFAULT_TEMPLATES: TemplateItem[] = [
  {
    id: "first-outreach",
    title: "1. First outreach",
    workType: "branding",
    portfolioLink: "",
    text: "Hi [Name],\n\nLoved your recent work on [detail] — the direction really stayed with me. I focus on [whatIDo] and kept thinking about how our work might fit together.\n\nHere is a relevant piece: [link]\n\nWarmly",
  },
  {
    id: "follow-up",
    title: "2. Polite follow-up",
    workType: "",
    portfolioLink: "",
    text: "Hi [Name],\n\nFloating my last note back up — no rush at all. Would love to share a quick thought on [detail] whenever timing feels right.\n\nSelected work: [link]\n\nWarmly",
  },
  {
    id: "thank-you",
    title: "3. Thank you / Collab",
    workType: "collaboration",
    portfolioLink: "",
    text: "Hi [Name],\n\nThank you for the conversation around [detail]. Loved connecting and excited to stay in touch for what's ahead.\n\nWarmly",
  },
];

const LOCKED_SHORTCUTS = [
  { key: "Mod+K", label: "Command Palette" },
  { key: "C", label: "Capture handle / URL" },
  { key: "/", label: "Search contacts" },
  { key: "J / K", label: "Next / Previous row" },
  { key: "E", label: "Edit context & notes" },
  { key: "S then 1–7", label: "Set stage directly" },
  { key: "Mod+Shift+C", label: "Copy pitch, log Pitched (+4d) & open link" },
  { key: "Mod+Enter", label: "Save & return to list" },
  { key: "B", label: "Back to previous contact" },
  { key: "Esc", label: "Blur input / Close pane" },
];

function uid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDaysISO(baseISO: string, days: number): string {
  const base = baseISO ? new Date(`${baseISO}T12:00:00`) : new Date();
  base.setDate(base.getDate() + days);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
}

function daysSinceISO(d: string, today: string): number {
  if (!d) return -1;
  const then = new Date(`${d}T12:00:00`).getTime();
  const now = new Date(`${today}T12:00:00`).getTime();
  return Math.floor((now - then) / 86400000);
}

function formatShortDate(v: string) {
  if (!v) return "—";
  const d = new Date(`${v}T12:00:00`);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatTime(d: Date) {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function stageLabel(s?: Stage): string {
  return STAGES.find((x) => x.value === s)?.label || "To reach";
}

function stageFromLegacy(replied: boolean, followedUp: boolean): Stage {
  if (followedUp && replied) return "follow-up";
  if (replied) return "in-conversation";
  if (followedUp) return "follow-up";
  return "to-reach";
}

// SINGLE SOURCE OF TRUTH for follow-up due logic
function isFollowUpDue(c: ContactValue, today: string): boolean {
  const s = c.stage || stageFromLegacy(c.replied, c.followedUp);
  if (s === "won" || s === "archived" || s === "paused") return false;
  if (c.deletedAt) return false;
  if (c.followUpDate && c.followUpDate <= today) return true;
  if (s === "follow-up") return true;
  if (!c.followUpDate && !c.replied && s === "pitched" && daysSinceISO(c.outreachDate, today) >= 4) return true;
  return false;
}

function isEmailValue(v: string) {
  return /^[^\s@/]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function isPhoneLike(v: string) {
  const digits = v.replace(/\D/g, "");
  return digits.length >= 7 && /^\+?[\d\s().-]+$/.test(v.trim());
}

function channelKind(channel: string): string {
  const s = (channel || "").trim().toLowerCase();
  if (!s) return "";
  if (s.includes("insta") || s === "ig") return "instagram";
  if (s.includes("twitter") || s === "x" || s.includes("tweet")) return "x";
  if (s.includes("tiktok") || s.includes("tik tok") || s === "tt") return "tiktok";
  if (s.includes("youtube") || s === "yt") return "youtube";
  if (s.includes("linkedin") || s.includes("linked") || s === "li") return "linkedin";
  if (s.includes("behance")) return "behance";
  if (s.includes("dribbble")) return "dribbble";
  if (s.includes("pinterest")) return "pinterest";
  if (s.includes("whatsapp") || s === "wa") return "whatsapp";
  if (s.includes("telegram") || s === "tg") return "telegram";
  if (s.includes("threads")) return "threads";
  if (s.includes("email") || s.includes("mail")) return "email";
  if (s.includes("website") || s.includes("portfolio") || s.includes("studio") || s.includes("site")) return "website";
  return "unknown";
}

function cleanNoSchemeUrl(s: string): string {
  const idx = s.indexOf("/");
  if (idx === -1) return s;
  const domain = s.slice(0, idx);
  const rest = s.slice(idx + 1);
  if (rest.startsWith("@")) {
    const dl = domain.toLowerCase();
    if (dl.includes("tiktok") || dl.includes("youtube") || dl.includes("threads")) return s;
    return `${domain}/${rest.slice(1)}`;
  }
  return s;
}

function cleanSchemeUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (!(host.includes("tiktok") || host.includes("youtube") || host.includes("threads")) && u.pathname.startsWith("/@")) {
      u.pathname = "/" + u.pathname.slice(2);
    }
    if (u.pathname === "/") return `${u.protocol}//${u.host}`;
    return u.href.replace(/\/$/, "");
  } catch {
    return url;
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
    if (channelKind(channel) === "whatsapp") {
      const d = original.replace(/\D/g, "");
      return d ? `https://wa.me/${d}` : "";
    }
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
    case "threads": return `https://threads.net/@${handle}`;
    case "telegram": return `https://t.me/${handle}`;
    case "email": return `mailto:${handle}`;
    case "website": return handle.includes(".") ? `https://${handle}` : "";
    default: return handle.includes(".") ? `https://${handle}` : `https://instagram.com/${handle}`;
  }
}

function normalizeLink(rawLink: string, channel: string, contactDetails: string): string {
  const raw = (rawLink || "").trim();
  const ch = (channel || "").trim();
  const det = (contactDetails || "").trim();
  if (!raw) {
    if (!det) return "";
    return buildFromHandle(det, ch || "Instagram");
  }
  const lower = raw.toLowerCase();
  if (lower.startsWith("mailto:") || lower.startsWith("tel:")) return raw;
  if (isEmailValue(raw)) return `mailto:${raw}`;
  if (/^https?:\/\//i.test(raw)) return cleanSchemeUrl(raw);
  if (!raw.includes(".") && !raw.includes("/") && !raw.includes(" ")) {
    return buildFromHandle(raw.replace(/^@+/, ""), ch || "Instagram");
  }
  if (raw.includes(" ")) return "";
  let cleaned = raw;
  if (cleaned.startsWith("@") && cleaned.slice(1).includes(".")) cleaned = cleaned.slice(1);
  return `https://${cleanNoSchemeUrl(cleaned)}`;
}

function displayLink(c: Contact) {
  return normalizeLink(c.value.link, c.value.channel, c.value.contactDetails);
}

function safeHref(raw: string): string {
  const v = (raw || "").trim();
  if (!v) return "";
  if (v.toLowerCase().startsWith("javascript:") || v.toLowerCase().startsWith("data:")) return "";
  if (/^https?:\/\//i.test(v) || /^mailto:/i.test(v)) return v;
  if (isEmailValue(v)) return `mailto:${v}`;
  if (v.includes(".") && !v.includes(" ")) return `https://${v.replace(/^@+/, "")}`;
  return "";
}

// OMNIBAR MULTI-TOKEN PARSER: Splits "@handle / URL / email" from trailing "whyThem" context
function parseOmnibarCapture(raw: string): {
  name: string;
  channel: string;
  link: string;
  contactDetails: string;
  whyThem: string;
} {
  const input = (raw || "").trim();
  if (!input) return { name: "", channel: "", link: "", contactDetails: "", whyThem: "" };

  const tokens = input.split(/\s+/);
  const firstToken = tokens[0];
  const restText = tokens.slice(1).join(" ").replace(/^[-—|•:]+\s*/, "").trim();

  // 1. URL match in first token
  if (/^(https?:\/\/|www\.|[a-z0-9-]+\.(com|org|net|io|co|studio|design|work|me|ai)\b)/i.test(firstToken)) {
    const link = normalizeLink(firstToken, "", firstToken);
    const hostKind = channelKind(link);
    const segments = link.replace(/^https?:\/\//, "").split("/").filter(Boolean);
    const lastSeg = segments.length > 1 ? segments[segments.length - 1] : segments[0].split(".")[0];
    const cleanName = lastSeg
      .replace(/^@/, "")
      .replace(/[-_.]/g, " ")
      .replace(/\b\w/g, (ch) => ch.toUpperCase());
    const channel = hostKind && hostKind !== "unknown"
      ? hostKind.charAt(0).toUpperCase() + hostKind.slice(1)
      : "Website";
    return {
      name: cleanName || firstToken,
      channel,
      link,
      contactDetails: firstToken,
      whyThem: restText,
    };
  }

  // 2. Email match in first token
  if (isEmailValue(firstToken)) {
    const local = firstToken.split("@")[0].replace(/[.\-_]/g, " ");
    const cleanName = local.replace(/\b\w/g, (ch) => ch.toUpperCase());
    return {
      name: cleanName || firstToken,
      channel: "Email",
      link: `mailto:${firstToken}`,
      contactDetails: firstToken,
      whyThem: restText,
    };
  }

  // 3. @handle match in first token
  if (firstToken.startsWith("@") && firstToken.length > 1) {
    const handle = firstToken.replace(/^@+/, "");
    const cleanName = handle.replace(/[-_.]/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
    return {
      name: cleanName || handle,
      channel: "Instagram",
      link: `https://instagram.com/${handle}`,
      contactDetails: `@${handle}`,
      whyThem: restText,
    };
  }

  // 4. Single-word handle without @ when followed by context or no spaces
  if (tokens.length === 1 && !firstToken.includes(" ")) {
    const handle = firstToken.replace(/^@+/, "");
    const cleanName = handle.replace(/[-_.]/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
    return {
      name: cleanName,
      channel: "Instagram",
      link: `https://instagram.com/${handle}`,
      contactDetails: `@${handle}`,
      whyThem: "",
    };
  }

  // 5. Name + separator ("Studio Koto — loved their typography")
  const sepMatch = input.match(/^([^—|\-:]+?)\s*(?:—|\||-|:)\s*(.+)$/);
  if (sepMatch) {
    return {
      name: sepMatch[1].trim(),
      channel: "Instagram",
      link: "",
      contactDetails: "",
      whyThem: sepMatch[2].trim(),
    };
  }

  return {
    name: input,
    channel: "Instagram",
    link: "",
    contactDetails: "",
    whyThem: "",
  };
}

function normalizeContactValue(v: any): ContactValue {
  const replied = !!v?.replied;
  const followedUp = !!v?.followedUp;
  const stage: Stage =
    typeof v?.stage === "string" && STAGES.some((s) => s.value === v.stage)
      ? v.stage
      : stageFromLegacy(replied, followedUp);
  return {
    name: typeof v?.name === "string" ? v.name : "",
    channel: typeof v?.channel === "string" ? v.channel : "",
    outreachDate: typeof v?.outreachDate === "string" ? v.outreachDate : todayISO(),
    contactDetails: typeof v?.contactDetails === "string" ? v.contactDetails : "",
    link: typeof v?.link === "string" ? v.link : "",
    replied,
    followedUp,
    notes: typeof v?.notes === "string" ? v.notes : "",
    createdAt: typeof v?.createdAt === "string" ? v.createdAt : new Date().toISOString(),
    updatedAt: typeof v?.updatedAt === "string" ? v.updatedAt : new Date().toISOString(),
    stage,
    whyThem: typeof v?.whyThem === "string" ? v.whyThem : "",
    whatSent: typeof v?.whatSent === "string" ? v.whatSent : "",
    nextStep: typeof v?.nextStep === "string" ? v.nextStep : "",
    workType: typeof v?.workType === "string" && WORK_TYPES.some((w) => w.value === v.workType) ? v.workType : "",
    followUpDate: typeof v?.followUpDate === "string" ? v.followUpDate : "",
    featuredLink: typeof v?.featuredLink === "string" ? v.featuredLink : "",
    testimonial: typeof v?.testimonial === "string" ? v.testimonial : "",
    referredById: typeof v?.referredById === "string" ? v.referredById : "",
    deletedAt: typeof v?.deletedAt === "string" ? v.deletedAt : "",
    winNote: typeof v?.winNote === "string" ? v.winNote : "",
  };
}

function normalizeProfileValue(raw: any, fallbackName = ""): ProfileValue {
  return {
    name: typeof raw?.name === "string" && raw.name ? raw.name : fallbackName,
    avatarUrl: typeof raw?.avatarUrl === "string" ? raw.avatarUrl : "",
    whatIDo: typeof raw?.whatIDo === "string" ? raw.whatIDo : "",
    openFor: typeof raw?.openFor === "string" ? raw.openFor : "",
    featuredLink: typeof raw?.featuredLink === "string" ? raw.featuredLink : "",
  };
}

function initialsFor(name: string) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "R";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function csvCell(v: string) {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function useMedia(query: string) {
  const [match, setMatch] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false
  );
  useEffect(() => {
    const m = window.matchMedia(query);
    const fn = () => setMatch(m.matches);
    fn();
    m.addEventListener("change", fn);
    return () => m.removeEventListener("change", fn);
  }, [query]);
  return match;
}

// --- Supabase API Layer ---
async function api(action: string, args: Record<string, unknown>) {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Please sign in to access your outreach queue.");

  if (action === "records.list") {
    if (args.collection === "outreach-contacts") {
      const { data, error } = await supabase
        .from("outreach_contacts")
        .select("id, value")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return {
        records: (data || []).map((r: any) => ({ id: r.id, value: r.value as ContactValue })),
      };
    }
    if (args.collection === "outreach-settings") {
      const { data, error } = await supabase
        .from("outreach_settings")
        .select("id, value")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return { records: data ? [{ id: data.id, value: data.value }] : [] };
    }
    return { records: [] };
  }

  if (action === "records.create") {
    if (args.collection === "outreach-contacts") {
      const { data, error } = await supabase
        .from("outreach_contacts")
        .insert({ user_id: user.id, value: args.value })
        .select("id")
        .single();
      if (error) throw error;
      return { id: data.id };
    }
    if (args.collection === "outreach-settings") {
      const { data, error } = await supabase
        .from("outreach_settings")
        .insert({ user_id: user.id, value: args.value })
        .select("id")
        .single();
      if (error) throw error;
      return { id: data.id };
    }
    return { id: uid() };
  }

  if (action === "records.replace") {
    if (args.collection === "outreach-contacts") {
      const { error } = await supabase
        .from("outreach_contacts")
        .update({ value: args.value })
        .eq("id", args.id)
        .eq("user_id", user.id);
      if (error) throw error;
      return {};
    }
    if (args.collection === "outreach-settings") {
      const { error } = await supabase
        .from("outreach_settings")
        .update({ value: args.value })
        .eq("id", args.id)
        .eq("user_id", user.id);
      if (error) throw error;
      return {};
    }
    return {};
  }

  if (action === "records.delete") {
    if (args.collection === "outreach-contacts") {
      const { error } = await supabase
        .from("outreach_contacts")
        .delete()
        .eq("id", args.id)
        .eq("user_id", user.id);
      if (error) throw error;
      return {};
    }
    return {};
  }

  throw new Error(`Unknown action ${action}`);
}

export default function App() {
  // Core Data State
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [navView, setNavView] = useState<NavView>("queue");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [backStack, setBackStack] = useState<{ id: string; name: string }[]>([]);

  // Omnibar & Command Palette State
  const [omnibarText, setOmnibarText] = useState("");
  const [omnibarMode, setOmnibarMode] = useState<"capture" | "search">("capture");
  const [omnibarError, setOmnibarError] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState("");
  const [stageChordOpen, setStageChordOpen] = useState(false);

  // Settings, Templates & Studio Identity
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [templates, setTemplates] = useState<TemplateItem[]>(DEFAULT_TEMPLATES);
  const [activeTemplateIdx, setActiveTemplateIdx] = useState(0);
  const [profile, setProfile] = useState<ProfileValue>(DEFAULT_PROFILE);
  const [drawerMode, setDrawerMode] = useState<"templates" | "settings" | "shortcuts" | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [deleteAllBusy, setDeleteAllBusy] = useState(false);

  // Inline Inspector Auto-Save & Feedback State
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [savedTimeLabel, setSavedTimeLabel] = useState<string>("");
  const [toast, setToast] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ contact: Contact; timer: number } | null>(null);
  const [referralInput, setReferralInput] = useState("");

  // Auth State
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authTab, setAuthTab] = useState<"signin" | "signup">("signin");
  const [authMethod, setAuthMethod] = useState<"password" | "magic">("password");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authConfirmPassword, setAuthConfirmPassword] = useState("");
  const [authAgree, setAuthAgree] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSent, setAuthSent] = useState(false);
  const [authNeedsConfirm, setAuthNeedsConfirm] = useState(false);
  const [authForgotMode, setAuthForgotMode] = useState(false);
  const [authForgotSent, setAuthForgotSent] = useState(false);
  const [authRecoveryMode, setAuthRecoveryMode] = useState(false);
  const [authNewPassword, setAuthNewPassword] = useState("");

  // Touch Swipe State (Mobile 72px threshold)
  const touchStartX = useRef<number | null>(null);

  const isDesktop = useMedia("(min-width: 1024px)");
  const omnibarRef = useRef<HTMLInputElement | null>(null);
  const cmdInputRef = useRef<HTMLInputElement | null>(null);
  const whyInputRef = useRef<HTMLInputElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const chordTimerRef = useRef<number | null>(null);

  const templatesRef = useRef<TemplateItem[]>(DEFAULT_TEMPLATES);
  const profileRef = useRef<ProfileValue>(DEFAULT_PROFILE);
  useEffect(() => { templatesRef.current = templates; }, [templates]);
  useEffect(() => { profileRef.current = profile; }, [profile]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2800);
  }, []);

  // --- Auth Lifecycle ---
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAuthLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
      if (event === "PASSWORD_RECOVERY") setAuthRecoveryMode(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // --- Theme Resolution ---
  const resolvedTheme = useMemo(() => {
    if (themeMode !== "system") return themeMode;
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }, [themeMode]);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  // --- Settings Persistence ---
  const saveSettings = useCallback(
    async (
      nextTheme: ThemeMode,
      nextSelected: string | null,
      nextTemplates = templatesRef.current,
      nextProfile = profileRef.current
    ) => {
      if (!settingsLoaded) return;
      try {
        const value = {
          themeMode: nextTheme,
          selectedId: nextSelected,
          templates: nextTemplates,
          profile: nextProfile,
        };
        if (settingsId) {
          await api("records.replace", { collection: "outreach-settings", id: settingsId, value });
        } else {
          const created = (await api("records.create", {
            collection: "outreach-settings",
            value,
          })) as { id: string };
          setSettingsId(created.id);
        }
      } catch {
        /* non-blocking settings sync */
      }
    },
    [settingsId, settingsLoaded]
  );

  // --- Load Contacts & Settings ---
  const reloadContacts = useCallback(async () => {
    const data = (await api("records.list", { collection: "outreach-contacts" })) as {
      records: { id: string; value: any }[];
    };
    const list = (data.records || []).map((r) => ({
      id: r.id,
      value: normalizeContactValue(r.value),
    }));
    setContacts(list);
    return list;
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await reloadContacts();
      try {
        const s = (await api("records.list", { collection: "outreach-settings" })) as {
          records: {
            id: string;
            value: {
              themeMode?: ThemeMode;
              selectedId?: string | null;
              templates?: TemplateItem[];
              profile?: ProfileValue;
            };
          }[];
        };
        const first = s.records?.[0];
        if (first) {
          setSettingsId(first.id);
          if (first.value.themeMode) setThemeMode(first.value.themeMode);
          if (Array.isArray(first.value.templates) && first.value.templates.length > 0) {
            setTemplates(first.value.templates);
            templatesRef.current = first.value.templates;
          }
          if (first.value.profile) {
            const metaName = user?.user_metadata?.full_name || "";
            const normP = normalizeProfileValue(first.value.profile, metaName);
            setProfile(normP);
            profileRef.current = normP;
          }
          const sel = first.value.selectedId || null;
          if (sel && list.some((c) => c.id === sel)) {
            setSelectedId(sel);
          }
        }
      } catch {
        /* settings fallback */
      }
      setSettingsLoaded(true);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Sync paused: couldn't reach Supabase.");
      setSettingsLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [reloadContacts, user]);

  useEffect(() => {
    if (user) loadAll();
  }, [user, loadAll]);

  // --- Selection & Back Stack ---
  const selectContact = useCallback(
    (id: string | null, opts?: { fromBack?: boolean }) => {
      if (id && selectedId && id !== selectedId && !opts?.fromBack) {
        const prev = contacts.find((c) => c.id === selectedId);
        if (prev) {
          setBackStack((stack) => [...stack.slice(-4), { id: prev.id, name: prev.value.name }]);
        }
      }
      setSelectedId(id);
      setSaveStatus("idle");
      saveSettings(themeMode, id);
    },
    [contacts, saveSettings, selectedId, themeMode]
  );

  const goBack = useCallback(() => {
    if (backStack.length === 0) return;
    const last = backStack[backStack.length - 1];
    setBackStack((prev) => prev.slice(0, -1));
    selectContact(last.id, { fromBack: true });
  }, [backStack, selectContact]);

  const selected = useMemo(
    () => contacts.find((c) => c.id === selectedId) || null,
    [contacts, selectedId]
  );
  const selectedLink = selected ? displayLink(selected) : "";

  // --- Optimistic Inline Persistence (400ms debounce) ---
  const updateSelectedField = useCallback(
    (patch: Partial<ContactValue>, immediate = false) => {
      if (!selected) return;
      const nextValue: ContactValue = {
        ...selected.value,
        ...patch,
        link:
          patch.link !== undefined || patch.channel !== undefined || patch.contactDetails !== undefined
            ? normalizeLink(
                patch.link ?? selected.value.link,
                patch.channel ?? selected.value.channel,
                patch.contactDetails ?? selected.value.contactDetails
              )
            : selected.value.link,
        updatedAt: new Date().toISOString(),
      };

      // Instant 0ms optimistic update
      setContacts((prev) =>
        prev.map((c) => (c.id === selected.id ? { ...c, value: nextValue } : c))
      );
      setSaveStatus("saving");

      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);

      const commit = async () => {
        try {
          await api("records.replace", {
            collection: "outreach-contacts",
            id: selected.id,
            value: nextValue,
          });
          setSaveStatus("saved");
          setSavedTimeLabel(formatTime(new Date()));
        } catch {
          setSaveStatus("error");
        }
      };

      if (immediate) {
        commit();
      } else {
        saveTimerRef.current = window.setTimeout(commit, 400);
      }
    },
    [selected]
  );

  // --- Stage Transition Engine ---
  const setStage = useCallback(
    (stage: Stage, targetContact?: Contact) => {
      const target = targetContact || selected;
      if (!target) return;
      const patch: Partial<ContactValue> = { stage };
      if (stage === "in-conversation" || stage === "won") patch.replied = true;
      if (stage === "follow-up") patch.followedUp = true;
      if (stage === "pitched" && !target.value.followUpDate) {
        patch.followUpDate = addDaysISO(todayISO(), 4);
      }

      const nextValue: ContactValue = {
        ...target.value,
        ...patch,
        updatedAt: new Date().toISOString(),
      };

      setContacts((prev) =>
        prev.map((c) => (c.id === target.id ? { ...c, value: nextValue } : c))
      );
      setSaveStatus("saving");
      api("records.replace", {
        collection: "outreach-contacts",
        id: target.id,
        value: nextValue,
      })
        .then(() => {
          setSaveStatus("saved");
          setSavedTimeLabel(formatTime(new Date()));
          showToast(
            stage === "pitched"
              ? "Pitched • Follow-up set for +4d"
              : `Moved to ${stageLabel(stage)}`
          );
        })
        .catch(() => setSaveStatus("error"));
    },
    [selected, showToast]
  );

  // --- Single-Action Soft Delete with 5s Undo Toast ---
  const archiveContact = useCallback(
    (target: Contact) => {
      if (pendingDelete) {
        window.clearTimeout(pendingDelete.timer);
      }
      const currentIdx = filteredRef.current.findIndex((c) => c.id === target.id);
      setContacts((prev) => prev.filter((c) => c.id !== target.id));

      if (selectedId === target.id) {
        const nextRow =
          filteredRef.current[currentIdx + 1] || filteredRef.current[currentIdx - 1] || null;
        setSelectedId(nextRow ? nextRow.id : null);
      }

      const timer = window.setTimeout(async () => {
        try {
          await api("records.delete", { collection: "outreach-contacts", id: target.id });
        } catch {
          /* already removed */
        }
        setPendingDelete((cur) => (cur?.contact.id === target.id ? null : cur));
      }, 5000);

      setPendingDelete({ contact: target, timer });
    },
    [pendingDelete, selectedId]
  );

  const undoDelete = useCallback(() => {
    if (!pendingDelete) return;
    window.clearTimeout(pendingDelete.timer);
    const restored = pendingDelete.contact;
    setContacts((prev) => [restored, ...prev]);
    setSelectedId(restored.id);
    setPendingDelete(null);
    showToast(`Restored ${restored.value.name}`);
  }, [pendingDelete, showToast]);

  // --- Omnibar Capture Execution (0-Modal Core Loop) ---
  const handleOmnibarSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const raw = omnibarText.trim();
    if (!raw) {
      setOmnibarError(true);
      window.setTimeout(() => setOmnibarError(false), 200);
      return;
    }

    if (omnibarMode === "search") {
      if (filtered.length > 0) {
        selectContact(filtered[0].id);
        omnibarRef.current?.blur();
      }
      return;
    }

    const parsed = parseOmnibarCapture(raw);
    const existing = contacts.find(
      (c) =>
        (parsed.link && displayLink(c) === parsed.link) ||
        (parsed.name && c.value.name.toLowerCase() === parsed.name.toLowerCase())
    );

    if (existing) {
      selectContact(existing.id);
      setOmnibarText("");
      showToast(`Opened existing thread: ${existing.value.name}`);
      return;
    }

    const now = new Date().toISOString();
    const newContactValue: ContactValue = {
      name: parsed.name || raw,
      channel: parsed.channel || "Instagram",
      outreachDate: todayISO(),
      contactDetails: parsed.contactDetails || raw,
      link: parsed.link,
      replied: false,
      followedUp: false,
      notes: "",
      createdAt: now,
      updatedAt: now,
      stage: "to-reach",
      whyThem: parsed.whyThem,
      whatSent: "",
      nextStep: "",
      workType: "",
      followUpDate: "",
      featuredLink: profile.featuredLink || "",
    };

    const tempId = `temp-${uid()}`;
    const optimisticContact: Contact = { id: tempId, value: newContactValue };
    setContacts((prev) => [optimisticContact, ...prev]);
    setSelectedId(tempId);
    setOmnibarText("");
    setNavView("queue");

    window.setTimeout(() => {
      whyInputRef.current?.focus();
    }, 40);

    try {
      const created = (await api("records.create", {
        collection: "outreach-contacts",
        value: newContactValue,
      })) as { id: string };
      setContacts((prev) =>
        prev.map((c) => (c.id === tempId ? { id: created.id, value: newContactValue } : c))
      );
      setSelectedId(created.id);
      showToast(`Added ${newContactValue.name} to Queue`);
    } catch {
      setLoadError("Sync paused: couldn't reach Supabase. Changes are queued locally.");
    }
  };

  // --- Context-Bound Pitch Composer Interpolation & 1-Key Execution ---
  const activeTemplate = templates[activeTemplateIdx] || templates[0];

  const interpolatedPitch = useMemo(() => {
    if (!selected || !activeTemplate) return "";
    const firstName = (selected.value.name || "there").trim().split(/\s+/)[0];
    const detail = (selected.value.whyThem || "your recent work").trim();
    const whatIDo = (profile.whatIDo || "visual design across branding and editorial").trim();
    const workLink =
      selected.value.featuredLink ||
      activeTemplate.portfolioLink ||
      profile.featuredLink ||
      "https://your-portfolio.com";

    return activeTemplate.text
      .replace(/\[Name\]/gi, firstName)
      .replace(/\[detail\]/gi, detail)
      .replace(/\[whatIDo\]/gi, whatIDo)
      .replace(/\[link\]/gi, workLink);
  }, [activeTemplate, profile.featuredLink, profile.whatIDo, selected]);

  const executeCopyPitchAndOpen = useCallback(async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(interpolatedPitch);
    } catch {
      /* fallback copy */
    }

    const curStage = selected.value.stage || "to-reach";
    const nextStage: Stage = curStage === "to-reach" ? "pitched" : curStage;
    const nextFollowUp = addDaysISO(todayISO(), 4);

    updateSelectedField(
      {
        stage: nextStage,
        whatSent: activeTemplate?.title || "Outreach pitch",
        followUpDate: nextFollowUp,
      },
      true
    );

    showToast("Pitched • Follow-up set for +4d");
    if (selectedLink) {
      window.open(selectedLink, "_blank", "noopener,noreferrer");
    }
  }, [activeTemplate?.title, interpolatedPitch, selected, selectedLink, showToast, updateSelectedField]);

  // --- Inline Referral Capture (Won State) ---
  const handleAddReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !referralInput.trim()) return;
    const parsed = parseOmnibarCapture(referralInput.trim());
    const now = new Date().toISOString();
    const newValue: ContactValue = {
      name: parsed.name || referralInput.trim(),
      channel: parsed.channel || "Instagram",
      outreachDate: todayISO(),
      contactDetails: parsed.contactDetails || referralInput.trim(),
      link: parsed.link,
      replied: false,
      followedUp: false,
      notes: "",
      createdAt: now,
      updatedAt: now,
      stage: "to-reach",
      whyThem: parsed.whyThem || `Referred by ${selected.value.name}`,
      whatSent: "",
      nextStep: `Intro via ${selected.value.name}`,
      workType: selected.value.workType || "",
      followUpDate: "",
      featuredLink: profile.featuredLink || "",
      referredById: selected.id,
    };
    setReferralInput("");
    try {
      const created = (await api("records.create", {
        collection: "outreach-contacts",
        value: newValue,
      })) as { id: string };
      await reloadContacts();
      setNavView("queue");
      selectContact(created.id);
      showToast(`Queued ${newValue.name} (Via ${selected.value.name})`);
    } catch {
      showToast("Save failed — press Enter to retry");
    }
  };

  // --- Auto-Cadence Queue & Pipeline Filtering ---
  const today = todayISO();

  const counts = useMemo(() => {
    let dueCount = 0;
    let queueCount = 0;
    let pipelineCount = 0;
    let archivedCount = 0;

    contacts.forEach((c) => {
      const s = c.value.stage || stageFromLegacy(c.value.replied, c.value.followedUp);
      const due = isFollowUpDue(c.value, today);
      if (s === "archived" || s === "paused") {
        archivedCount++;
      } else if (due || s === "to-reach" || s === "follow-up") {
        queueCount++;
        if (due) dueCount++;
      } else {
        pipelineCount++;
      }
    });

    return { dueCount, queueCount, pipelineCount, archivedCount, total: contacts.length };
  }, [contacts, today]);

  const filtered = useMemo(() => {
    const q = omnibarMode === "search" ? omnibarText.trim().toLowerCase() : "";
    const list = contacts.filter((c) => {
      const s = c.value.stage || stageFromLegacy(c.value.replied, c.value.followedUp);
      const due = isFollowUpDue(c.value, today);

      if (!q) {
        if (navView === "queue") {
          if (s === "archived" || s === "paused") return false;
          if (!due && s !== "to-reach" && s !== "follow-up") return false;
        } else if (navView === "pipeline") {
          if (!["pitched", "in-conversation", "won"].includes(s)) return false;
        } else if (navView === "archived") {
          if (!["archived", "paused"].includes(s)) return false;
        }
      }

      if (!q) return true;
      return [
        c.value.name,
        c.value.channel,
        c.value.contactDetails,
        c.value.link,
        c.value.whyThem,
        c.value.whatSent,
        c.value.notes,
        c.value.workType,
      ].some((field) => (field || "").toLowerCase().includes(q));
    });

    return [...list].sort((a, b) => {
      const aDue = isFollowUpDue(a.value, today);
      const bDue = isFollowUpDue(b.value, today);
      if (aDue && !bDue) return -1;
      if (!aDue && bDue) return 1;
      if (aDue && bDue) {
        return (a.value.outreachDate || "").localeCompare(b.value.outreachDate || "");
      }
      return (b.value.updatedAt || "").localeCompare(a.value.updatedAt || "");
    });
  }, [contacts, navView, omnibarMode, omnibarText, today]);

  const filteredRef = useRef<Contact[]>(filtered);
  useEffect(() => {
    filteredRef.current = filtered;
  }, [filtered]);

  // --- CSV Export & Theme Cycle ---
  const exportCSV = useCallback(() => {
    const headers = [
      "name",
      "channel",
      "stage",
      "outreach_date",
      "follow_up_date",
      "contact_details",
      "link",
      "work_type",
      "why_them",
      "what_sent",
      "notes",
    ];
    const rows = contacts.map((c) => [
      c.value.name,
      c.value.channel,
      stageLabel(c.value.stage),
      c.value.outreachDate,
      c.value.followUpDate || "",
      c.value.contactDetails,
      displayLink(c),
      c.value.workType || "",
      c.value.whyThem || "",
      c.value.whatSent || "",
      c.value.notes || "",
    ]);
    const csv =
      "\uFEFF" + [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reach-${todayISO()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 800);
    showToast(`Exported ${contacts.length} contacts`);
  }, [contacts, showToast]);

  const cycleTheme = useCallback(() => {
    const order: ThemeMode[] = ["system", "light", "dark"];
    const next = order[(order.indexOf(themeMode) + 1) % order.length];
    setThemeMode(next);
    saveSettings(next, selectedId);
    showToast(`Theme: ${next}`);
  }, [saveSettings, selectedId, showToast, themeMode]);

  // --- Locked 10-Shortcut Global Keyboard Engine ---
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName || "";
      const isTyping =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!target?.isContentEditable;
      const isMod = e.ctrlKey || e.metaKey;

      // 1. Mod+K: Command Palette (Always Active)
      if (isMod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((prev) => !prev);
        setCmdQuery("");
        return;
      }

      // 2. Mod+Shift+C: Copy Pitch, Advance to Pitched (+4d) & Open Channel
      if (isMod && e.shiftKey && e.key.toLowerCase() === "c") {
        if (selected) {
          e.preventDefault();
          executeCopyPitchAndOpen();
        }
        return;
      }

      // 3. Mod+R: Retry Sync when Load Error is present
      if (isMod && e.key.toLowerCase() === "r" && loadError) {
        e.preventDefault();
        loadAll();
        return;
      }

      // 4. While Typing in Inputs: Handle Escape & Mod+Enter
      if (isTyping) {
        if (e.key === "Escape") {
          e.preventDefault();
          if (cmdOpen) {
            setCmdOpen(false);
            return;
          }
          target?.blur();
          return;
        }
        if (isMod && e.key === "Enter") {
          e.preventDefault();
          if (target === omnibarRef.current) {
            handleOmnibarSubmit();
          } else {
            target?.blur();
            showToast("Saved");
          }
          return;
        }
        return;
      }

      // 5. Stage Chord ("S" then "1"-"7")
      if (stageChordOpen) {
        const matched = STAGES.find((s) => s.key === e.key);
        if (matched && selected) {
          e.preventDefault();
          setStageChordOpen(false);
          setStage(matched.value);
          return;
        }
        if (e.key === "Escape") {
          setStageChordOpen(false);
          return;
        }
        setStageChordOpen(false);
      }

      // 6. Escape: Close Popover / Drawer / Inspector
      if (e.key === "Escape") {
        if (cmdOpen) {
          e.preventDefault();
          setCmdOpen(false);
          return;
        }
        if (drawerMode) {
          e.preventDefault();
          setDrawerMode(null);
          return;
        }
        if (selectedId) {
          e.preventDefault();
          selectContact(null);
          return;
        }
        return;
      }

      // 7. "Z": Undo pending delete
      if (e.key.toLowerCase() === "z" && pendingDelete && !isMod) {
        e.preventDefault();
        undoDelete();
        return;
      }

      // 8. "C": Focus Omnibar in Capture Mode
      if (e.key.toLowerCase() === "c" && !isMod) {
        e.preventDefault();
        setOmnibarMode("capture");
        omnibarRef.current?.focus();
        omnibarRef.current?.select();
        return;
      }

      // 9. "/": Focus Omnibar in Search Mode
      if (e.key === "/") {
        e.preventDefault();
        setOmnibarMode("search");
        omnibarRef.current?.focus();
        omnibarRef.current?.select();
        return;
      }

      // 10. "?": Toggle Shortcuts Drawer
      if (e.key === "?") {
        e.preventDefault();
        setDrawerMode((m) => (m === "shortcuts" ? null : "shortcuts"));
        return;
      }

      // 11. "J" / ArrowDown & "K" / ArrowUp: Navigate List
      if (e.key.toLowerCase() === "j" || e.key === "ArrowDown") {
        if (filtered.length === 0) return;
        e.preventDefault();
        const idx = filtered.findIndex((c) => c.id === selectedId);
        const next = idx < 0 ? filtered[0] : filtered[Math.min(filtered.length - 1, idx + 1)];
        selectContact(next.id);
        return;
      }

      if (e.key.toLowerCase() === "k" || e.key === "ArrowUp") {
        if (filtered.length === 0) return;
        e.preventDefault();
        const idx = filtered.findIndex((c) => c.id === selectedId);
        const prev = idx <= 0 ? filtered[0] : filtered[idx - 1];
        selectContact(prev.id);
        return;
      }

      // 12. Inspector Context Shortcuts (When a contact is selected)
      if (!selected) return;

      if (e.key.toLowerCase() === "e" && !isMod) {
        e.preventDefault();
        whyInputRef.current?.focus();
        return;
      }

      if (e.key.toLowerCase() === "s" && !isMod) {
        e.preventDefault();
        setStageChordOpen(true);
        if (chordTimerRef.current) window.clearTimeout(chordTimerRef.current);
        chordTimerRef.current = window.setTimeout(() => setStageChordOpen(false), 2500);
        return;
      }

      if (e.key.toLowerCase() === "b" && !isMod) {
        e.preventDefault();
        goBack();
        return;
      }

      if (e.key === "1" || e.key === "2" || e.key === "3") {
        e.preventDefault();
        setActiveTemplateIdx(Number(e.key) - 1);
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        archiveContact(selected);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    archiveContact,
    cmdOpen,
    drawerMode,
    executeCopyPitchAndOpen,
    filtered,
    goBack,
     loadAll,
    loadError,
    pendingDelete,
    selectContact,
    selected,
    selectedId,
    setStage,
     showToast,
    stageChordOpen,
    undoDelete,
  ]);

  useEffect(() => {
    if (cmdOpen) {
      window.setTimeout(() => cmdInputRef.current?.focus(), 20);
    }
  }, [cmdOpen]);

  // --- Avatar Upload & Data Wipe ---
  const handleAvatarFile = async (file: File) => {
    if (!user || !file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
      showToast("Choose an image under 5MB");
      return;
    }
    setAvatarUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const safeExt = ["jpg", "jpeg", "png", "webp"].includes(ext) ? ext : "jpg";
      const path = `${user.id}/avatar.${safeExt}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const nextProfile = { ...profile, avatarUrl: `${data.publicUrl}?t=${Date.now()}` };
      setProfile(nextProfile);
      profileRef.current = nextProfile;
      await saveSettings(themeMode, selectedId, templates, nextProfile);
      showToast("Avatar updated");
    } catch {
      showToast("Avatar upload failed");
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleDeleteAllMyData = async () => {
    if (!user) return;
    setDeleteAllBusy(true);
    try {
      await supabase.from("outreach_contacts").delete().eq("user_id", user.id);
      await supabase.from("outreach_settings").delete().eq("user_id", user.id);
      setContacts([]);
      setSelectedId(null);
      setProfile(DEFAULT_PROFILE);
      setTemplates(DEFAULT_TEMPLATES);
      setShowDeleteAll(false);
      setDrawerMode(null);
      showToast("All account data deleted");
    } catch {
      showToast("Could not delete data");
    } finally {
      setDeleteAllBusy(false);
    }
  };

  // --- Auth Handlers ---
  const handleOAuth = async (provider: "google" | "github" | "apple") => {
    setAuthBusy(true);
    setAuthError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setAuthError(error.message);
      setAuthBusy(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthBusy(true);
    setAuthError(null);
    try {
      if (authForgotMode) {
        const { error } = await supabase.auth.resetPasswordForEmail(authEmail.trim(), {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        setAuthForgotSent(true);
      } else if (authMethod === "magic") {
        const { error } = await supabase.auth.signInWithOtp({
          email: authEmail.trim(),
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setAuthSent(true);
      } else if (authTab === "signup") {
        if (authPassword !== authConfirmPassword) throw new Error("Passwords do not match.");
        if (!authAgree) throw new Error("Please accept the data privacy terms.");
        const { data, error } = await supabase.auth.signUp({
          email: authEmail.trim(),
          password: authPassword,
          options: {
            data: { full_name: authName.trim() },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        if (data.user && !data.session) setAuthNeedsConfirm(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail.trim(),
          password: authPassword,
        });
        if (error) throw error;
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setAuthBusy(false);
    }
  };

  const handlePasswordRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authNewPassword.length < 8) {
      setAuthError("Password must be at least 8 characters.");
      return;
    }
    setAuthBusy(true);
    const { error } = await supabase.auth.updateUser({ password: authNewPassword });
    setAuthBusy(false);
    if (error) {
      setAuthError(error.message);
      return;
    }
    setAuthRecoveryMode(false);
    showToast("Password updated");
  };

  // ============================================================================
  // RENDER: CONFIGURATION & AUTH SCREENS
  // ============================================================================
  if (!isSupabaseConfigured) {
    return (
      <div className="flex h-screen items-center justify-center p-6">
        <div className="w-full max-w-[400px] border p-6" style={{ borderColor: "var(--divider)", background: "var(--surface)" }}>
          <p className="type-micro" style={{ color: "var(--muted)" }}>REACH • CONFIGURATION</p>
          <h1 className="type-title mt-2">Connect Supabase</h1>
          <p className="type-body mt-2" style={{ color: "var(--muted)" }}>
            Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment variables and redeploy.
          </p>
        </div>
      </div>
    );
  }

  if (!authLoading && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div
          className="w-full max-w-[400px] border p-6"
          style={{ borderColor: "var(--divider)", background: "var(--surface)" }}
        >
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5" style={{ background: "var(--brand)" }} />
            <span className="type-title">Reach</span>
          </div>
          <p className="type-body mt-1" style={{ color: "var(--muted)" }}>
            High-velocity creative outreach.
          </p>

          <div
            className="mt-6 grid grid-cols-2 border p-1"
            style={{ borderColor: "var(--divider)", background: "var(--bg)" }}
          >
            {(["signin", "signup"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setAuthTab(t);
                  setAuthError(null);
                  setAuthForgotMode(false);
                }}
                className="btn-press h-8 type-body-medium"
                style={
                  authTab === t
                    ? { background: "var(--text)", color: "var(--bg)" }
                    : { color: "var(--muted)" }
                }
              >
                {t === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          {authSent || authNeedsConfirm || authForgotSent ? (
            <div className="mt-6 border p-4" style={{ borderColor: "var(--divider)" }}>
              <p className="type-body-medium">Check your inbox</p>
              <p className="type-body mt-1" style={{ color: "var(--muted)" }}>
                We sent a verification link to {authEmail}.
              </p>
              <button
                type="button"
                onClick={() => {
                  setAuthSent(false);
                  setAuthNeedsConfirm(false);
                  setAuthForgotSent(false);
                }}
                className="type-micro mt-4 underline"
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {(["google", "github", "apple"] as const).map((prov) => (
                  <button
                    key={prov}
                    type="button"
                    onClick={() => handleOAuth(prov)}
                    disabled={authBusy}
                    className="btn-press h-9 border type-micro"
                    style={{ borderColor: "var(--divider)" }}
                  >
                    {prov}
                  </button>
                ))}
              </div>

              <div className="mt-4 flex gap-2">
                {(["password", "magic"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setAuthMethod(m)}
                    className="type-micro underline"
                    style={{ color: authMethod === m ? "var(--text)" : "var(--muted)" }}
                  >
                    {m === "password" ? "Password" : "Magic Link"}
                  </button>
                ))}
              </div>

              <form onSubmit={handleEmailAuth} className="mt-4 space-y-3">
                {authTab === "signup" && authMethod === "password" && !authForgotMode && (
                  <div>
                    <label className="type-micro block" style={{ color: "var(--muted)" }}>
                      Name / Studio
                    </label>
                    <input
                      type="text"
                      required
                      value={authName}
                      onChange={(e) => setAuthName(e.target.value)}
                      className="mt-1 h-9 w-full border px-3"
                      style={{ borderColor: "var(--divider)", background: "var(--bg)" }}
                    />
                  </div>
                )}
                <div>
                  <label className="type-micro block" style={{ color: "var(--muted)" }}>
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    className="mt-1 h-9 w-full border px-3"
                    style={{ borderColor: "var(--divider)", background: "var(--bg)" }}
                  />
                </div>
                {authMethod === "password" && !authForgotMode && (
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="type-micro" style={{ color: "var(--muted)" }}>
                        Password
                      </label>
                      {authTab === "signin" && (
                        <button
                          type="button"
                          onClick={() => setAuthForgotMode(true)}
                          className="type-micro underline"
                          style={{ color: "var(--muted)" }}
                        >
                          Forgot?
                        </button>
                      )}
                    </div>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      className="mt-1 h-9 w-full border px-3"
                      style={{ borderColor: "var(--divider)", background: "var(--bg)" }}
                    />
                  </div>
                )}
                {authTab === "signup" && authMethod === "password" && !authForgotMode && (
                  <>
                    <div>
                      <label className="type-micro block" style={{ color: "var(--muted)" }}>
                        Confirm Password
                      </label>
                      <input
                        type="password"
                        required
                        minLength={8}
                        value={authConfirmPassword}
                        onChange={(e) => setAuthConfirmPassword(e.target.value)}
                        className="mt-1 h-9 w-full border px-3"
                        style={{ borderColor: "var(--divider)", background: "var(--bg)" }}
                      />
                    </div>
                    <label className="flex items-center gap-2 type-body" style={{ color: "var(--muted)" }}>
                      <input
                        type="checkbox"
                        checked={authAgree}
                        onChange={(e) => setAuthAgree(e.target.checked)}
                      />
                      <span>Private cloud storage under my account.</span>
                    </label>
                  </>
                )}
                {authError && (
                  <p className="type-body" style={{ color: "var(--danger)" }}>
                    {authError}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={authBusy}
                  className="btn-press h-10 w-full type-body-medium text-white"
                  style={{ background: "var(--brand)" }}
                >
                  {authBusy
                    ? "Working..."
                    : authForgotMode
                    ? "Send Reset Link"
                    : authMethod === "magic"
                    ? "Send Magic Link"
                    : authTab === "signup"
                    ? "Create Account"
                    : "Sign In"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    );
  }

  if (user && authRecoveryMode) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <form
          onSubmit={handlePasswordRecovery}
          className="w-full max-w-[400px] border p-6 space-y-4"
          style={{ borderColor: "var(--divider)", background: "var(--surface)" }}
        >
          <h1 className="type-title">Set new password</h1>
          <input
            type="password"
            required
            minLength={8}
            placeholder="New password (8+ chars)"
            value={authNewPassword}
            onChange={(e) => setAuthNewPassword(e.target.value)}
            className="h-9 w-full border px-3"
            style={{ borderColor: "var(--divider)", background: "var(--bg)" }}
          />
          <button
            type="submit"
            disabled={authBusy}
            className="btn-press h-10 w-full type-body-medium text-white"
            style={{ background: "var(--brand)" }}
          >
            Save Password
          </button>
        </form>
      </div>
    );
  }

  const omnibarPreview =
    omnibarMode === "capture" && omnibarText.trim()
      ? parseOmnibarCapture(omnibarText.trim())
      : null;

  const referrerContact =
    selected?.value.referredById
      ? contacts.find((c) => c.id === selected.value.referredById) || null
      : null;

  // ============================================================================
  // RENDER: SINGLE SPLIT-PANE WORKSPACE
  // ============================================================================
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden" style={{ background: "var(--bg)", color: "var(--text)" }}>
      {/* TOP BAR (56px height): Primary Nav (3 items) + Persistent Omnibar + Studio Trigger */}
      <header
        className="flex h-[56px] shrink-0 items-center justify-between gap-4 border-b px-6"
        style={{ borderColor: "var(--divider)", background: "var(--surface)" }}
      >
        {/* Left: Brand + 3 Primary Nav Items */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0" style={{ background: "var(--brand)" }} />
            <span className="type-body-medium">Reach</span>
          </div>

          <nav aria-label="Primary Navigation" className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setNavView("queue");
                setDrawerMode(null);
              }}
              className="btn-press flex h-8 items-center gap-1.5 px-3 type-body-medium"
              style={
                navView === "queue" && !drawerMode
                  ? { background: "var(--text)", color: "var(--bg)" }
                  : { color: "var(--muted)" }
              }
            >
              <span>Queue</span>
              <span className="type-micro opacity-80">{counts.queueCount}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setNavView("pipeline");
                setDrawerMode(null);
              }}
              className="btn-press flex h-8 items-center gap-1.5 px-3 type-body-medium"
              style={
                navView === "pipeline" && !drawerMode
                  ? { background: "var(--text)", color: "var(--bg)" }
                  : { color: "var(--muted)" }
              }
            >
              <span>Pipeline</span>
              <span className="type-micro opacity-80">{counts.pipelineCount}</span>
            </button>
            <button
              type="button"
              onClick={() =>
                setDrawerMode((m) => (m === "templates" ? null : "templates"))
              }
              className="btn-press flex h-8 items-center gap-1.5 px-3 type-body-medium"
              style={
                drawerMode === "templates"
                  ? { background: "var(--text)", color: "var(--bg)" }
                  : { color: "var(--muted)" }
              }
            >
              <span>Templates & Identity</span>
            </button>
          </nav>
        </div>

        {/* Center: Omnibar Command & Capture Engine */}
        <form
          onSubmit={handleOmnibarSubmit}
          className="relative flex flex-1 max-w-[540px] items-center"
        >
          <div
            className={`flex h-9 w-full items-center border px-3 gap-2 ${
              omnibarError ? "animate-shake" : ""
            }`}
            style={{ borderColor: "var(--divider)", background: "var(--bg)" }}
          >
            <button
              type="button"
              onClick={() =>
                setOmnibarMode((m) => (m === "capture" ? "search" : "capture"))
              }
              className="type-micro shrink-0 px-1.5 py-0.5 border"
              style={{ borderColor: "var(--divider)", color: "var(--muted)" }}
              title="Toggle Capture (C) / Search (/)"
            >
              {omnibarMode === "capture" ? "+ CAPTURE (C)" : "SEARCH (/)"}
            </button>

            <input
              ref={omnibarRef}
              value={omnibarText}
              onChange={(e) => setOmnibarText(e.target.value)}
              placeholder={
                omnibarMode === "capture"
                  ? "Paste @handle, URL, or email + why them (Enter)..."
                  : "Filter by name, channel, work type, or note..."
              }
              aria-label="Omnibar Capture and Search"
              className="h-full flex-1 bg-transparent type-body"
            />

            {omnibarText && (
              <button
                type="button"
                onClick={() => setOmnibarText("")}
                className="flex h-6 w-6 items-center justify-center"
                style={{ color: "var(--muted)" }}
                aria-label="Clear omnibar"
              >
                <X size={14} />
              </button>
            )}

            <span className="hidden sm:inline-flex items-center gap-1 type-micro" style={{ color: "var(--muted)" }}>
              <CornerDownLeft size={11} />
            </span>
          </div>

          {/* Live Multi-Token Parse Preview */}
          {omnibarPreview && (
            <div
              className="absolute left-0 right-0 top-[40px] z-30 flex items-center justify-between border px-3 py-1.5"
              style={{
                borderColor: "var(--divider)",
                background: "var(--surface)",
                boxShadow: "var(--elevation-1)",
              }}
            >
              <span className="truncate type-body">
                <strong className="type-body-medium">{omnibarPreview.name}</strong>
                <span style={{ color: "var(--muted)" }}>
                  {" "}
                  • {omnibarPreview.channel}
                  {omnibarPreview.whyThem ? ` • "${omnibarPreview.whyThem}"` : ""}
                </span>
              </span>
              <span className="type-micro shrink-0" style={{ color: "var(--muted)" }}>
                ENTER TO QUEUE
              </span>
            </div>
          )}
        </form>

        {/* Right: Command Palette Trigger & Studio Profile Popover Trigger */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCmdOpen(true)}
            className="btn-press hidden md:flex h-8 items-center gap-1.5 border px-2.5 type-micro"
            style={{ borderColor: "var(--divider)", color: "var(--muted)" }}
            title="Command Palette (Mod+K)"
          >
            <Command size={12} />
            <span>K</span>
          </button>

          <button
            type="button"
            onClick={() =>
              setDrawerMode((m) => (m === "settings" ? null : "settings"))
            }
            aria-label="Studio settings"
            className="btn-press flex h-8 w-8 items-center justify-center border"
            style={{ borderColor: "var(--divider)", background: "var(--tint)" }}
          >
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="type-micro">{initialsFor(profile.name)}</span>
            )}
          </button>
        </div>
      </header>

      {/* MAIN SPLIT-PANE WORKSPACE (height: calc(100vh - 56px), max 2 scrollable regions) */}
      <main className="flex h-[calc(100vh-56px)] w-full overflow-hidden">
        {/* LEFT PANE: High-Density Contact List */}
        <section
          aria-label="Outreach Queue"
          className="thin-scroll flex min-w-0 flex-1 flex-col overflow-y-auto px-6"
        >
          {/* Error Banner (48px inline, retry via Mod+R) */}
          {loadError && (
            <div
              role="alert"
              className="mt-4 flex h-[48px] shrink-0 items-center justify-between border px-4"
              style={{ borderColor: "var(--danger)", background: "var(--surface)" }}
            >
              <div className="flex items-center gap-2 truncate">
                <AlertTriangle size={15} style={{ color: "var(--danger)" }} />
                <span className="truncate type-body">
                  Sync paused: couldn&apos;t reach Supabase. Changes are queued locally.
                </span>
              </div>
              <button
                type="button"
                onClick={loadAll}
                className="btn-press shrink-0 border px-3 py-1 type-micro"
                style={{ borderColor: "var(--divider)" }}
              >
                Retry Now (Mod+R)
              </button>
            </div>
          )}

          {/* Column Header Row (32px height) */}
          <div
            className="sticky top-0 z-10 grid h-8 shrink-0 items-center gap-4 border-b px-4"
            style={{
              gridTemplateColumns: isDesktop
                ? "minmax(180px, 1.5fr) minmax(200px, 2fr) 110px 80px"
                : "1fr auto",
              borderColor: "var(--divider)",
              background: "var(--bg)",
            }}
          >
            <div className="flex items-center gap-3">
              <span className="type-micro" style={{ color: "var(--muted)" }}>
                CONTACT ({filtered.length})
              </span>
              {counts.dueCount > 0 && navView === "queue" && (
                <span className="type-micro" style={{ color: "var(--danger)" }}>
                  • {counts.dueCount} DUE TODAY
                </span>
              )}
            </div>
            {isDesktop && (
              <>
                <span className="type-micro" style={{ color: "var(--muted)" }}>
                  CONTEXT / NEXT STEP
                </span>
                <span className="type-micro" style={{ color: "var(--muted)" }}>
                  STAGE (S)
                </span>
                <span className="type-micro text-right" style={{ color: "var(--muted)" }}>
                  CADENCE
                </span>
              </>
            )}
          </div>

          {/* State 1: 6-Row Skeleton Loader */}
          {loading || authLoading ? (
            <div aria-busy="true" aria-label="Syncing outreach queue">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div key={idx} className="contact-row">
                  <div className="skeleton h-3.5 w-[140px]" />
                  {isDesktop && (
                    <>
                      <div className="skeleton h-3.5 w-[220px]" />
                      <div className="skeleton h-3.5 w-[72px]" />
                      <div className="skeleton ml-auto h-3.5 w-[48px]" />
                    </>
                  )}
                </div>
              ))}
              <p className="py-4 type-micro" style={{ color: "var(--muted)" }}>
                Syncing outreach queue...
              </p>
            </div>
          ) : filtered.length === 0 ? (
            /* State 2: Empty State (Centered 360px block at padding-top: 96px) */
            <div className="mx-auto flex w-full max-w-[360px] flex-col items-start pt-[96px]">
              <h2 className="type-title">
                {omnibarMode === "search" && omnibarText
                  ? "No matching contacts"
                  : "Your outreach queue is empty."}
              </h2>
              <p className="type-body mt-2" style={{ color: "var(--muted)" }}>
                {omnibarMode === "search" && omnibarText
                  ? "Clear your search filter or press C to capture this query as a new contact."
                  : "Paste an Instagram handle, portfolio URL, or email above to start your first thread."}
              </p>
              <button
                type="button"
                onClick={() => {
                  setOmnibarMode("capture");
                  omnibarRef.current?.focus();
                }}
                className="btn-press mt-4 h-9 px-4 type-body-medium text-white"
                style={{ background: "var(--brand)" }}
              >
                Focus Command Bar (C)
              </button>
            </div>
          ) : (
            /* State 3: Strict 48px Single-Line Contact Rows */
            <div role="listbox" aria-label="Contacts">
              {filtered.map((c) => {
                const isSel = c.id === selectedId;
                const stage =
                  c.value.stage || stageFromLegacy(c.value.replied, c.value.followedUp);
                const stageMeta = STAGES.find((s) => s.value === stage) || STAGES[0];
                const due = isFollowUpDue(c.value, today);
                const daysAgo = daysSinceISO(c.value.outreachDate, today);
                const snippet =
                  c.value.whyThem ||
                  c.value.nextStep ||
                  c.value.whatSent ||
                  c.value.notes ||
                  c.value.contactDetails ||
                  "—";

                return (
                  <div
                    key={c.id}
                    role="option"
                    aria-selected={isSel}
                    data-selected={isSel}
                    tabIndex={0}
                    onClick={() => selectContact(c.id)}
                    onTouchStart={(e) => {
                      touchStartX.current = e.touches[0].clientX;
                    }}
                    onTouchEnd={(e) => {
                      if (touchStartX.current === null) return;
                      const deltaX = e.changedTouches[0].clientX - touchStartX.current;
                      touchStartX.current = null;
                      if (deltaX > 72) {
                        setStage("pitched", c);
                      } else if (deltaX < -72) {
                        archiveContact(c);
                      }
                    }}
                    className="contact-row group"
                  >
                    {/* Col 1: Name + Channel */}
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={`truncate ${
                          isSel ? "type-body-medium" : "type-body"
                        }`}
                      >
                        {c.value.name}
                      </span>
                      <span
                        className="shrink-0 type-micro"
                        style={{ color: "var(--muted)" }}
                      >
                        {c.value.channel || "IG"}
                      </span>
                      {c.value.referredById && (
                        <span
                          className="shrink-0 border px-1.5 py-0.5 type-micro"
                          style={{ borderColor: "var(--divider)", color: "var(--muted)" }}
                        >
                          REF
                        </span>
                      )}
                    </div>

                    {/* Col 2: Single-line Context Snippet */}
                    {isDesktop && (
                      <div className="min-w-0 truncate type-body" style={{ color: "var(--muted)" }}>
                        {snippet}
                      </div>
                    )}

                    {/* Col 3: Stage Badge */}
                    {isDesktop && (
                      <div className="flex items-center gap-1.5">
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{
                            background: due ? "var(--danger)" : stageMeta.dot,
                          }}
                        />
                        <span className="truncate type-micro">
                          {due ? "DUE" : stageMeta.label}
                        </span>
                      </div>
                    )}

                    {/* Col 4: Relative Due Date / Hover Quick Action */}
                    <div className="flex items-center justify-end gap-2">
                      <span
                        className="type-micro group-hover:hidden"
                        style={{
                          color: due ? "var(--danger)" : "var(--muted)",
                        }}
                      >
                        {c.value.followUpDate
                          ? formatShortDate(c.value.followUpDate)
                          : daysAgo >= 0
                          ? `${daysAgo}d`
                          : "—"}
                      </span>
                      <div
                        className="hidden items-center gap-1 group-hover:flex"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {displayLink(c) && (
                          <a
                            href={displayLink(c)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex h-6 w-6 items-center justify-center border"
                            style={{ borderColor: "var(--divider)" }}
                            title="Open link"
                          >
                            <ArrowUpRight size={12} />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => archiveContact(c)}
                          className="flex h-6 w-6 items-center justify-center border"
                          style={{ borderColor: "var(--divider)", color: "var(--muted)" }}
                          title="Archive (Del)"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer View Switcher & Status */}
          <footer
            className="mt-auto flex h-12 shrink-0 items-center justify-between border-t"
            style={{ borderColor: "var(--divider)", color: "var(--muted)" }}
          >
            <div className="flex items-center gap-4">
              <span className="type-micro">{counts.total} TOTAL</span>
              <button
                type="button"
                onClick={() =>
                  setNavView((v) => (v === "archived" ? "queue" : "archived"))
                }
                className="type-micro underline"
              >
                {navView === "archived"
                  ? "Back to active queue"
                  : `Archived & Paused (${counts.archivedCount})`}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setDrawerMode("shortcuts")}
              className="type-micro underline"
            >
              Shortcuts (?)
            </button>
          </footer>
        </section>

        {/* RIGHT PANE: Progressive Disclosure 420px Inline Inspector (Unmounted until selected) */}
        {selected && (
          <aside
            aria-label="Contact Inspector"
            className={`thin-scroll flex flex-col overflow-y-auto border-l p-6 ${
              isDesktop
                ? "w-[420px] shrink-0"
                : "fixed inset-0 z-40 w-full"
            }`}
            style={{
              borderColor: "var(--divider)",
              background: "var(--surface)",
            }}
          >
            {/* Top Bar: Back Stack, Save Status Indicator & Close */}
            <div className="flex items-center justify-between gap-2 pb-4 border-b" style={{ borderColor: "var(--divider)" }}>
              <div className="flex items-center gap-2">
                {backStack.length > 0 && (
                  <button
                    type="button"
                    onClick={goBack}
                    className="btn-press border px-2 py-0.5 type-micro"
                    style={{ borderColor: "var(--divider)", color: "var(--muted)" }}
                  >
                    ← Back (B)
                  </button>
                )}
                <span className="type-micro" style={{ color: "var(--muted)" }}>
                  INSPECTOR
                </span>
              </div>

              <div className="flex items-center gap-3">
                {/* State Transition Status Indicator */}
                {saveStatus === "saving" && (
                  <span className="flex items-center gap-1.5 type-micro" style={{ color: "var(--muted)" }}>
                    <span
                      className="saving-dot h-2 w-2 rounded-full"
                      style={{ background: "var(--text)" }}
                    />
                    Saving...
                  </span>
                )}
                {saveStatus === "saved" && (
                  <span className="flex items-center gap-1 type-micro" style={{ color: "var(--success)" }}>
                    <Check size={12} className="animate-success" />
                    Saved • {savedTimeLabel}
                  </span>
                )}
                {saveStatus === "error" && (
                  <button
                    type="button"
                    onClick={() => updateSelectedField({}, true)}
                    className="type-micro underline"
                    style={{ color: "var(--danger)" }}
                  >
                    Save failed — Retry
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => archiveContact(selected)}
                  className="btn-press flex h-7 w-7 items-center justify-center border"
                  style={{ borderColor: "var(--divider)", color: "var(--muted)" }}
                  title="Archive contact (Del)"
                >
                  <Trash2 size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => selectContact(null)}
                  className="btn-press flex h-7 w-7 items-center justify-center border"
                  style={{ borderColor: "var(--divider)" }}
                  title="Close inspector (Esc)"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Section 1: Inline Identity & Channel Metadata (16px spacing) */}
            <div className="mt-4 space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="insp-name" className="type-micro" style={{ color: "var(--muted)" }}>
                    NAME / STUDIO
                  </label>
                  {referrerContact && (
                    <button
                      type="button"
                      onClick={() => selectContact(referrerContact.id)}
                      className="type-micro underline"
                      style={{ color: "var(--muted)" }}
                    >
                      Via {referrerContact.value.name} →
                    </button>
                  )}
                </div>
                <input
                  id="insp-name"
                  value={selected.value.name}
                  onChange={(e) => updateSelectedField({ name: e.target.value })}
                  className="type-title mt-1 w-full border-b bg-transparent pb-1"
                  style={{ borderColor: "var(--divider)" }}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="insp-channel" className="type-micro block" style={{ color: "var(--muted)" }}>
                    CHANNEL
                  </label>
                  <input
                    id="insp-channel"
                    value={selected.value.channel}
                    onChange={(e) => updateSelectedField({ channel: e.target.value })}
                    placeholder="Instagram, Email, X..."
                    className="mt-1 h-8 w-full border px-2.5 type-body"
                    style={{ borderColor: "var(--divider)", background: "var(--bg)" }}
                  />
                </div>
                <div>
                  <label htmlFor="insp-worktype" className="type-micro block" style={{ color: "var(--muted)" }}>
                    WORK TYPE
                  </label>
                  <select
                    id="insp-worktype"
                    value={selected.value.workType || ""}
                    onChange={(e) =>
                      updateSelectedField({ workType: e.target.value as WorkType })
                    }
                    className="mt-1 h-8 w-full border px-2 type-body"
                    style={{ borderColor: "var(--divider)", background: "var(--bg)" }}
                  >
                    {WORK_TYPES.map((w) => (
                      <option key={w.value} value={w.value}>
                        {w.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="insp-handle" className="type-micro block" style={{ color: "var(--muted)" }}>
                    HANDLE / EMAIL
                  </label>
                  <input
                    id="insp-handle"
                    value={selected.value.contactDetails}
                    onChange={(e) =>
                      updateSelectedField({ contactDetails: e.target.value })
                    }
                    placeholder="@handle or email"
                    className="mt-1 h-8 w-full border px-2.5 type-body"
                    style={{ borderColor: "var(--divider)", background: "var(--bg)" }}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="insp-followup" className="type-micro" style={{ color: "var(--muted)" }}>
                      FOLLOW-UP DUE
                    </label>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          updateSelectedField(
                            { followUpDate: addDaysISO(todayISO(), 4) },
                            true
                          )
                        }
                        className="type-micro underline"
                        style={{ color: "var(--muted)" }}
                      >
                        +4d
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateSelectedField(
                            { followUpDate: addDaysISO(todayISO(), 7) },
                            true
                          )
                        }
                        className="type-micro underline"
                        style={{ color: "var(--muted)" }}
                      >
                        +7d
                      </button>
                    </div>
                  </div>
                  <input
                    id="insp-followup"
                    type="date"
                    value={selected.value.followUpDate || ""}
                    onChange={(e) =>
                      updateSelectedField({ followUpDate: e.target.value }, true)
                    }
                    className="mt-1 h-8 w-full border px-2 type-body"
                    style={{ borderColor: "var(--divider)", background: "var(--bg)" }}
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Stage Pills (Single Source of State Truth — 24px gap) */}
            <div className="mt-6 pt-4 border-t" style={{ borderColor: "var(--divider)" }}>
              <div className="flex items-center justify-between">
                <span className="type-micro" style={{ color: "var(--muted)" }}>
                  STAGE {stageChordOpen ? "• PRESS 1–7 NOW" : "(PRESS S THEN 1–7)"}
                </span>
                {selectedLink && (
                  <a
                    href={selectedLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 type-micro underline"
                  >
                    <span>Open {selected.value.channel || "Link"}</span>
                    <ExternalLink size={11} />
                  </a>
                )}
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {STAGES.slice(0, 5).map((s) => {
                  const active = (selected.value.stage || "to-reach") === s.value;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setStage(s.value)}
                      className="btn-press h-7 border px-2.5 type-micro"
                      style={
                        active
                          ? {
                              background: "var(--text)",
                              color: "var(--bg)",
                              borderColor: "var(--text)",
                            }
                          : { borderColor: "var(--divider)", color: "var(--muted)" }
                      }
                    >
                      {s.key}. {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Native Synthesis 3: Inline Win & Referral Loop (Appears only when stage === 'won') */}
            {selected.value.stage === "won" && (
              <div
                className="mt-6 border p-4 space-y-3"
                style={{ borderColor: "var(--success)", background: "var(--bg)" }}
              >
                <div className="flex items-center justify-between">
                  <span className="type-micro" style={{ color: "var(--success)" }}>
                    WON THREAD • PROOF & REFERRAL LOOP
                  </span>
                </div>
                <div>
                  <label className="type-micro block" style={{ color: "var(--muted)" }}>
                    WHAT WORKED?
                  </label>
                  <input
                    value={selected.value.winNote || ""}
                    onChange={(e) =>
                      updateSelectedField({
                        winNote: e.target.value,
                        testimonial: e.target.value,
                      })
                    }
                    placeholder="Quick yes after sending branding reel..."
                    className="mt-1 h-8 w-full border px-2.5 type-body"
                    style={{ borderColor: "var(--divider)", background: "var(--surface)" }}
                  />
                </div>
                <form onSubmit={handleAddReferral}>
                  <label className="type-micro block" style={{ color: "var(--muted)" }}>
                    QUEUE REFERRAL OR NEXT LEAD (ENTER)
                  </label>
                  <div className="mt-1 flex gap-2">
                    <input
                      value={referralInput}
                      onChange={(e) => setReferralInput(e.target.value)}
                      placeholder="@handle or studio name..."
                      className="h-8 flex-1 border px-2.5 type-body"
                      style={{ borderColor: "var(--divider)", background: "var(--surface)" }}
                    />
                    <button
                      type="submit"
                      className="btn-press h-8 border px-3 type-micro"
                      style={{ borderColor: "var(--divider)", background: "var(--surface)" }}
                    >
                      + Queue
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Section 3: Unified Context & Thread Notes (24px gap) */}
            <div className="mt-6 pt-4 border-t space-y-4" style={{ borderColor: "var(--divider)" }}>
              <div>
                <label htmlFor="inspector-why" className="type-micro block" style={{ color: "var(--muted)" }}>
                  WHY THEM / SPECIFIC DETAIL (E) — INTERPOLATES [detail]
                </label>
                <input
                  id="inspector-why"
                  ref={whyInputRef}
                  value={selected.value.whyThem || ""}
                  onChange={(e) => updateSelectedField({ whyThem: e.target.value })}
                  placeholder="e.g. their custom serif typography for Issue 04..."
                  className="mt-1 h-8 w-full border px-2.5 type-body"
                  style={{ borderColor: "var(--divider)", background: "var(--bg)" }}
                />
              </div>

              <div>
                <label htmlFor="inspector-featured" className="type-micro block" style={{ color: "var(--muted)" }}>
                  FEATURED WORK LINK — INTERPOLATES [link]
                </label>
                <input
                  id="inspector-featured"
                  value={selected.value.featuredLink || ""}
                  onChange={(e) => updateSelectedField({ featuredLink: e.target.value })}
                  placeholder={profile.featuredLink || "https://your-portfolio.com/project"}
                  className="mt-1 h-8 w-full border px-2.5 type-body"
                  style={{ borderColor: "var(--divider)", background: "var(--bg)" }}
                />
              </div>

              <div>
                <label htmlFor="inspector-notes" className="type-micro block" style={{ color: "var(--muted)" }}>
                  THREAD NOTES & NEXT STEP
                </label>
                <textarea
                  id="inspector-notes"
                  rows={4}
                  value={selected.value.notes || ""}
                  onChange={(e) => updateSelectedField({ notes: e.target.value })}
                  placeholder="Context, replies, links shared, next step..."
                  className="mt-1 w-full resize-y border p-2.5 type-body"
                  style={{ borderColor: "var(--divider)", background: "var(--bg)" }}
                />
              </div>
            </div>

            {/* Section 4: Context-Bound Pitch Composer (Single Clear Next Action) */}
            <div className="mt-6 pt-4 border-t" style={{ borderColor: "var(--divider)" }}>
              <div className="flex items-center justify-between">
                <span className="type-micro" style={{ color: "var(--muted)" }}>
                  PITCH COMPOSER (KEYS 1–3)
                </span>
                <button
                  type="button"
                  onClick={() => setDrawerMode("templates")}
                  className="type-micro underline"
                  style={{ color: "var(--muted)" }}
                >
                  Edit templates
                </button>
              </div>

              <div className="mt-2 flex gap-1">
                {templates.map((t, idx) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTemplateIdx(idx)}
                    className="btn-press flex-1 truncate border py-1 px-2 type-micro"
                    style={
                      activeTemplateIdx === idx
                        ? {
                            background: "var(--text)",
                            color: "var(--bg)",
                            borderColor: "var(--text)",
                          }
                        : { borderColor: "var(--divider)", color: "var(--muted)" }
                    }
                  >
                    {t.title}
                  </button>
                ))}
              </div>

              <pre
                className="mt-2 whitespace-pre-wrap border p-3 type-body font-sans"
                style={{
                  borderColor: "var(--divider)",
                  background: "var(--bg)",
                  color: "var(--muted)",
                }}
              >
                {interpolatedPitch}
              </pre>

              {/* SINGLE PRIMARY ACCENT CTA PER VIEWPORT */}
              <button
                type="button"
                onClick={executeCopyPitchAndOpen}
                className="btn-press mt-3 flex h-10 w-full items-center justify-between px-4 type-body-medium text-white"
                style={{ background: "var(--brand)" }}
              >
                <span className="flex items-center gap-2">
                  <Copy size={14} />
                  <span>
                    Copy Pitch &amp; Open {selected.value.channel || "Channel"}
                  </span>
                </span>
                <span className="type-micro opacity-85">Mod+Shift+C</span>
              </button>
            </div>
          </aside>
        )}
      </main>

      {/* SLIDE-OVER DRAWER: Templates & Identity / Studio Settings / Shortcuts HUD */}
      {drawerMode && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            aria-label="Close drawer"
            onClick={() => setDrawerMode(null)}
            className="absolute inset-0 bg-black/30"
          />
          <div
            className="thin-scroll relative z-10 flex h-full w-full max-w-[420px] flex-col overflow-y-auto border-l p-6"
            style={{
              borderColor: "var(--divider)",
              background: "var(--surface)",
              boxShadow: "var(--elevation-1)",
            }}
          >
            <div className="flex items-center justify-between pb-4 border-b" style={{ borderColor: "var(--divider)" }}>
              <span className="type-title">
                {drawerMode === "templates"
                  ? "Templates & Studio Identity"
                  : drawerMode === "shortcuts"
                  ? "Keyboard System"
                  : "Studio Account"}
              </span>
              <button
                type="button"
                onClick={() => setDrawerMode(null)}
                className="flex h-7 w-7 items-center justify-center border"
                style={{ borderColor: "var(--divider)" }}
              >
                <X size={14} />
              </button>
            </div>

            {drawerMode === "templates" && (
              <div className="mt-6 space-y-6">
                {/* Studio Pitch Variables */}
                <div className="space-y-3">
                  <p className="type-micro" style={{ color: "var(--muted)" }}>
                    STUDIO VARIABLES (INTERPOLATED IN EVERY PITCH)
                  </p>
                  <div>
                    <label className="type-micro block" style={{ color: "var(--muted)" }}>
                      YOUR NAME / STUDIO
                    </label>
                    <input
                      value={profile.name}
                      onChange={(e) => {
                        const next = { ...profile, name: e.target.value };
                        setProfile(next);
                        saveSettings(themeMode, selectedId, templates, next);
                      }}
                      placeholder="Memik Studio"
                      className="mt-1 h-8 w-full border px-2.5 type-body"
                      style={{ borderColor: "var(--divider)", background: "var(--bg)" }}
                    />
                  </div>
                  <div>
                    <label className="type-micro block" style={{ color: "var(--muted)" }}>
                      WHAT I DO — INTERPOLATES [whatIDo]
                    </label>
                    <input
                      value={profile.whatIDo || ""}
                      onChange={(e) => {
                        const next = { ...profile, whatIDo: e.target.value };
                        setProfile(next);
                        saveSettings(themeMode, selectedId, templates, next);
                      }}
                      placeholder="brand identity and editorial direction"
                      className="mt-1 h-8 w-full border px-2.5 type-body"
                      style={{ borderColor: "var(--divider)", background: "var(--bg)" }}
                    />
                  </div>
                  <div>
                    <label className="type-micro block" style={{ color: "var(--muted)" }}>
                      DEFAULT PORTFOLIO LINK — INTERPOLATES [link]
                    </label>
                    <input
                      value={profile.featuredLink || ""}
                      onChange={(e) => {
                        const next = { ...profile, featuredLink: e.target.value };
                        setProfile(next);
                        saveSettings(themeMode, selectedId, templates, next);
                      }}
                      placeholder="https://your-portfolio.com"
                      className="mt-1 h-8 w-full border px-2.5 type-body"
                      style={{ borderColor: "var(--divider)", background: "var(--bg)" }}
                    />
                  </div>
                </div>

                {/* 3 Pitch Templates */}
                <div className="space-y-4 pt-4 border-t" style={{ borderColor: "var(--divider)" }}>
                  <div className="flex items-center justify-between">
                    <span className="type-micro" style={{ color: "var(--muted)" }}>
                      PITCH TEMPLATES (USE [Name], [detail], [whatIDo], [link])
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setTemplates(DEFAULT_TEMPLATES);
                        saveSettings(themeMode, selectedId, DEFAULT_TEMPLATES, profile);
                        showToast("Templates reset");
                      }}
                      className="type-micro underline"
                      style={{ color: "var(--muted)" }}
                    >
                      Reset
                    </button>
                  </div>

                  {templates.map((tpl, i) => (
                    <div key={tpl.id} className="space-y-1.5">
                      <label className="type-micro block">{tpl.title}</label>
                      <textarea
                        rows={4}
                        value={tpl.text}
                        onChange={(e) => {
                          const next = templates.map((item, idx) =>
                            idx === i ? { ...item, text: e.target.value } : item
                          );
                          setTemplates(next);
                          saveSettings(themeMode, selectedId, next, profile);
                        }}
                        className="w-full border p-2.5 type-body"
                        style={{ borderColor: "var(--divider)", background: "var(--bg)" }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {drawerMode === "shortcuts" && (
              <div className="mt-6 space-y-2">
                <p className="type-body mb-4" style={{ color: "var(--muted)" }}>
                  Opinionated high-velocity keymap. Shortcuts pause automatically while typing in inputs.
                </p>
                {LOCKED_SHORTCUTS.map((s) => (
                  <div
                    key={s.key}
                    className="flex h-9 items-center justify-between border-b"
                    style={{ borderColor: "var(--divider)" }}
                  >
                    <span className="type-body">{s.label}</span>
                    <kbd
                      className="border px-2 py-0.5 type-micro"
                      style={{ borderColor: "var(--divider)", background: "var(--bg)" }}
                    >
                      {s.key}
                    </kbd>
                  </div>
                ))}
              </div>
            )}

            {drawerMode === "settings" && (
              <div className="mt-6 space-y-6">
                {/* Avatar & Signed-in Identity */}
                <div className="flex items-center gap-4">
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleAvatarFile(f);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={avatarUploading}
                    className="flex h-12 w-12 shrink-0 items-center justify-center border"
                    style={{ borderColor: "var(--divider)", background: "var(--tint)" }}
                  >
                    {profile.avatarUrl ? (
                      <img
                        src={profile.avatarUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Camera size={16} />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate type-body-medium">{user?.email}</p>
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      className="type-micro underline"
                      style={{ color: "var(--muted)" }}
                    >
                      {avatarUploading ? "Uploading..." : "Change studio avatar"}
                    </button>
                  </div>
                </div>

                {/* Theme Selector */}
                <div className="pt-4 border-t" style={{ borderColor: "var(--divider)" }}>
                  <span className="type-micro block" style={{ color: "var(--muted)" }}>
                    APPEARANCE
                  </span>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {(["system", "light", "dark"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          setThemeMode(m);
                          saveSettings(m, selectedId);
                        }}
                        className="btn-press h-8 border type-micro"
                        style={
                          themeMode === m
                            ? {
                                background: "var(--text)",
                                color: "var(--bg)",
                                borderColor: "var(--text)",
                              }
                            : { borderColor: "var(--divider)", color: "var(--muted)" }
                        }
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Data Export & Account Actions */}
                <div className="space-y-2 pt-4 border-t" style={{ borderColor: "var(--divider)" }}>
                  <button
                    type="button"
                    onClick={exportCSV}
                    className="btn-press flex h-9 w-full items-center justify-between border px-3 type-body"
                    style={{ borderColor: "var(--divider)" }}
                  >
                    <span>Export Contacts CSV</span>
                    <Download size={14} />
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      setDrawerMode(null);
                      await supabase.auth.signOut();
                      setContacts([]);
                      setSelectedId(null);
                    }}
                    className="btn-press flex h-9 w-full items-center justify-between border px-3 type-body"
                    style={{ borderColor: "var(--divider)" }}
                  >
                    <span>Sign Out</span>
                  </button>

                  {!showDeleteAll ? (
                    <button
                      type="button"
                      onClick={() => setShowDeleteAll(true)}
                      className="btn-press flex h-9 w-full items-center justify-between border px-3 type-body"
                      style={{ borderColor: "var(--divider)", color: "var(--danger)" }}
                    >
                      <span>Delete all account data...</span>
                    </button>
                  ) : (
                    <div className="border p-3 space-y-2" style={{ borderColor: "var(--danger)" }}>
                      <p className="type-body">
                        Permanently wipe all {counts.total} contacts and settings?
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setShowDeleteAll(false)}
                          className="h-8 flex-1 border type-micro"
                          style={{ borderColor: "var(--divider)" }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={deleteAllBusy}
                          onClick={handleDeleteAllMyData}
                          className="h-8 flex-1 type-micro text-white"
                          style={{ background: "var(--danger)" }}
                        >
                          {deleteAllBusy ? "Deleting..." : "Confirm Wipe"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* COMMAND PALETTE (Mod+K) */}
      {cmdOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[14vh]"
          role="dialog"
          aria-modal="true"
          aria-label="Command Palette"
        >
          <button
            type="button"
            aria-label="Close Command Palette"
            onClick={() => setCmdOpen(false)}
            className="absolute inset-0 bg-black/30"
          />
          <div
            className="relative z-10 w-full max-w-[480px] border"
            style={{
              borderColor: "var(--divider)",
              background: "var(--surface)",
              boxShadow: "var(--elevation-1)",
            }}
          >
            <div className="flex h-11 items-center border-b px-3 gap-2" style={{ borderColor: "var(--divider)" }}>
              <Search size={14} style={{ color: "var(--muted)" }} />
              <input
                ref={cmdInputRef}
                value={cmdQuery}
                onChange={(e) => setCmdQuery(e.target.value)}
                placeholder="Type a command or search contact..."
                className="h-full flex-1 bg-transparent type-body"
              />
              <span className="type-micro" style={{ color: "var(--muted)" }}>
                ESC
              </span>
            </div>

            <div className="max-h-[320px] overflow-y-auto p-1.5 space-y-1">
              {[
                {
                  label: "Capture New Contact (Focus Omnibar)",
                  shortcut: "C",
                  run: () => {
                    setOmnibarMode("capture");
                    setCmdOpen(false);
                    window.setTimeout(() => omnibarRef.current?.focus(), 20);
                  },
                },
                ...(selected
                  ? [
                      {
                        label: `Copy Pitch & Open ${selected.value.name}`,
                        shortcut: "Mod+Shift+C",
                        run: () => {
                          setCmdOpen(false);
                          executeCopyPitchAndOpen();
                        },
                      },
                    ]
                  : []),
                {
                  label: "View: Action Queue",
                  shortcut: "Queue",
                  run: () => {
                    setNavView("queue");
                    setCmdOpen(false);
                  },
                },
                {
                  label: "View: Active Pipeline",
                  shortcut: "Pipeline",
                  run: () => {
                    setNavView("pipeline");
                    setCmdOpen(false);
                  },
                },
                {
                  label: "Edit Pitch Templates & Studio Identity",
                  shortcut: "Templates",
                  run: () => {
                    setCmdOpen(false);
                    setDrawerMode("templates");
                  },
                },
                {
                  label: "Cycle Appearance Theme (System / Light / Dark)",
                  shortcut: "Theme",
                  run: () => {
                    setCmdOpen(false);
                    cycleTheme();
                  },
                },
                {
                  label: "Export All Contacts to CSV",
                  shortcut: "CSV",
                  run: () => {
                    setCmdOpen(false);
                    exportCSV();
                  },
                },
              ]
                .filter((item) =>
                  item.label.toLowerCase().includes(cmdQuery.trim().toLowerCase())
                )
                .map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={item.run}
                    className="flex h-9 w-full items-center justify-between px-3 text-left type-body hover:bg-[var(--tint)]"
                  >
                    <span>{item.label}</span>
                    <span className="type-micro" style={{ color: "var(--muted)" }}>
                      {item.shortcut}
                    </span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* 5-SECOND UNDO TOAST (Instant Soft-Delete Recovery via Z) */}
      {pendingDelete && (
        <div
          role="status"
          className="toast-in fixed bottom-6 left-1/2 z-50 flex h-10 items-center gap-4 border px-4"
          style={{
            borderColor: "var(--divider)",
            background: "var(--text)",
            color: "var(--bg)",
            boxShadow: "var(--elevation-1)",
          }}
        >
          <span className="type-body">Archived {pendingDelete.contact.value.name}</span>
          <button
            type="button"
            onClick={undoDelete}
            className="border px-2 py-0.5 type-micro"
            style={{ borderColor: "var(--bg)" }}
          >
            Undo (Z)
          </button>
        </div>
      )}

      {/* FEEDBACK TOAST */}
      {toast && !pendingDelete && (
        <div
          role="status"
          className="toast-in fixed bottom-6 left-1/2 z-50 flex h-9 items-center gap-2 border px-4"
          style={{
            borderColor: "var(--divider)",
            background: "var(--text)",
            color: "var(--bg)",
            boxShadow: "var(--elevation-1)",
          }}
        >
          <Check size={13} />
          <span className="type-body">{toast}</span>
        </div>
      )}
    </div>
  );
}