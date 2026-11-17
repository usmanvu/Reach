import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase, isSupabaseConfigured } from "./supabaseClient";
import {
  Search,
  Plus,
  Download,
  Pencil,
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
  Users,
  AtSign,
  Sparkles,
  ArrowUpRight,
  Clock,
  ChevronLeft,
  Settings,
  Send,
} from "lucide-react";

type Stage = "to-reach" | "pitched" | "in-conversation" | "follow-up" | "won" | "paused" | "archived";
type WorkType = "branding" | "editorial" | "social" | "collaboration" | "other" | "";
type NavTab = "queue" | "pipeline" | "templates";
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
type Filter = "all" | "to-reach" | "replied" | "followed" | "today" | "needs-follow-up";
type TemplateItem = { id: string; title: string; text: string; workType?: WorkType; portfolioLink?: string };
type SocialAccount = { id: string; platform: string; value: string; custom?: boolean };
type ProfileValue = {
  name: string;
  socials: SocialAccount[];
  avatarUrl?: string;
  whatIDo?: string;
  openFor?: string;
  featuredLink?: string;
};

const FIXED_PLATFORMS = ["Instagram", "Facebook", "Threads", "X", "LinkedIn", "Website / Portfolio"];
function defaultSocials(): SocialAccount[] {
  return FIXED_PLATFORMS.map((platform, i) => ({
    id: `social-${i}`,
    platform,
    value: "",
    custom: false,
  }));
}
const DEFAULT_PROFILE: ProfileValue = {
  name: "",
  socials: defaultSocials(),
  avatarUrl: "",
  whatIDo: "",
  openFor: "",
  featuredLink: "",
};

const STAGES: { value: Stage; label: string; dot: string }[] = [
  { value: "to-reach", label: "To reach", dot: "#9CA3AF" },
  { value: "pitched", label: "Pitched", dot: "#F59E0B" },
  { value: "in-conversation", label: "In convo", dot: "#F04E23" },
  { value: "follow-up", label: "Follow-up", dot: "#EF4444" },
  { value: "won", label: "Won", dot: "#16A34A" },
  { value: "paused", label: "Paused", dot: "#6B7280" },
  { value: "archived", label: "Archived", dot: "#6B7280" },
];

const WORK_TYPES: { value: WorkType; label: string }[] = [
  { value: "", label: "Work type" },
  { value: "branding", label: "Branding" },
  { value: "editorial", label: "Editorial" },
  { value: "social", label: "Social" },
  { value: "collaboration", label: "Collab" },
  { value: "other", label: "Other" },
];

function stageLabel(s?: Stage): string {
  return STAGES.find((x) => x.value === s)?.label || "To reach";
}
function workTypeLabel(w?: WorkType): string {
  return WORK_TYPES.find((x) => x.value === w)?.label || "";
}
function stageFromLegacy(replied: boolean, followedUp: boolean): Stage {
  if (followedUp && replied) return "follow-up";
  if (replied) return "in-conversation";
  if (followedUp) return "follow-up";
  return "to-reach";
}

function daysSinceISO(d: string, today: string): number {
  if (!d) return -1;
  const then = new Date(`${d}T12:00:00`).getTime();
  const now = new Date(`${today}T12:00:00`).getTime();
  return Math.floor((now - then) / 86400000);
}

function addDaysISO(baseISO: string, days: number): string {
  const base = baseISO ? new Date(`${baseISO}T12:00:00`) : new Date();
  base.setDate(base.getDate() + days);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
}

function isFollowUpDue(c: ContactValue, today: string): boolean {
  const s = c.stage || stageFromLegacy(c.replied, c.followedUp);
  if (s === "won" || s === "archived" || s === "paused") return false;
  if (c.deletedAt) return false;
  if (c.followUpDate && c.followUpDate <= today) return true;
  if (s === "follow-up") return true;
  if (!c.followUpDate && !c.replied && daysSinceISO(c.outreachDate, today) >= 4) return true;
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
  if (s.includes("youtube") || s === "yt" || s.includes("you tube")) return "youtube";
  if (s.includes("linkedin") || s.includes("linked") || s === "li") return "linkedin";
  if (s.includes("behance")) return "behance";
  if (s.includes("dribbble") || s.includes("dribble")) return "dribbble";
  if (s.includes("pinterest") || s === "pin") return "pinterest";
  if (s.includes("whatsapp") || s === "wa") return "whatsapp";
  if (s.includes("telegram") || s === "tg") return "telegram";
  if (s.includes("facebook") || s === "fb") return "facebook";
  if (s.includes("threads")) return "threads";
  if (s.includes("email") || s.includes("e-mail") || s === "mail") return "email";
  if (s.includes("website") || s.includes("portfolio") || s.includes("studio") || s === "web" || s.includes("site"))
    return "website";
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
    case "pinterest": return `https://pinterest.com/${handle}`;
    case "whatsapp": {
      const d = handle.replace(/\D/g, "");
      return d ? `https://wa.me/${d}` : "";
    }
    case "telegram": return `https://t.me/${handle}`;
    case "facebook": return `https://facebook.com/${handle}`;
    case "threads": return `https://threads.net/@${handle}`;
    case "email": return `mailto:${handle}`;
    case "website": return isEmailValue(handle) ? `mailto:${handle}` : `https://${handle}`;
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

function parsePasteToContact(raw: string): {
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
  const restWhy = tokens.slice(1).join(" ").replace(/^[-—|•:]+\s*/, "").trim();

  const urlMatch = firstToken.match(/(https?:\/\/[^\s,]+|www\.[^\s,]+|[a-z0-9-]+\.[a-z]{2,}\/[^\s,]*)/i);
  if (urlMatch) {
    const link = normalizeLink(urlMatch[0], "", firstToken);
    const kind = channelKind(link);
    const handle = link.replace(/^https?:\/\//, "").split("/").filter(Boolean).pop() || "";
    return {
      name: handle.replace(/^@/, "").replace(/[-_]/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase()),
      channel: kind === "unknown" ? "Website" : kind.charAt(0).toUpperCase() + kind.slice(1),
      link,
      contactDetails: firstToken,
      whyThem: restWhy,
    };
  }
  if (isEmailValue(firstToken)) {
    return {
      name: firstToken.split("@")[0].replace(/[.\-_]/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase()),
      channel: "Email",
      link: `mailto:${firstToken}`,
      contactDetails: firstToken,
      whyThem: restWhy,
    };
  }
  if (firstToken.startsWith("@") || (tokens.length === 1 && !firstToken.includes(" "))) {
    const handle = firstToken.replace(/^@+/, "");
    return {
      name: handle.replace(/[-_]/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase()),
      channel: "Instagram",
      link: `https://instagram.com/${handle}`,
      contactDetails: `@${handle}`,
      whyThem: restWhy,
    };
  }
  const dashSplit = input.match(/^([^—|\-]+?)\s*(?:—|\||-)\s*(.+)$/);
  if (dashSplit) {
    return {
      name: dashSplit[1].trim(),
      channel: "",
      link: "",
      contactDetails: dashSplit[1].trim(),
      whyThem: dashSplit[2].trim(),
    };
  }
  return { name: input, channel: "", link: "", contactDetails: input, whyThem: "" };
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
    outreachDate: typeof v?.outreachDate === "string" ? v.outreachDate : "",
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
      customs.push({
        id: typeof item.id === "string" && item.id ? item.id : `social-custom-${idx}`,
        platform,
        value,
        custom: true,
      });
    } else if (!byPlatform.has(platform)) {
      byPlatform.set(platform, value);
    }
  });
  return [...base.map((s) => ({ ...s, value: byPlatform.get(s.platform) || "" })), ...customs];
}

function normalizeProfileValue(raw: any, fallbackName = ""): ProfileValue {
  return {
    name: typeof raw?.name === "string" ? raw.name : fallbackName,
    socials: normalizeSocials(raw?.socials ?? raw?.socialLinks),
    avatarUrl: typeof raw?.avatarUrl === "string" ? raw.avatarUrl : "",
    whatIDo: typeof raw?.whatIDo === "string" ? raw.whatIDo : "",
    openFor: typeof raw?.openFor === "string" ? raw.openFor : "",
    featuredLink: typeof raw?.featuredLink === "string" ? raw.featuredLink : "",
  };
}

function socialHref(platform: string, rawValue: string): string {
  const v = (rawValue || "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  if (isEmailValue(v)) return `mailto:${v}`;
  const handle = v.replace(/^@+/, "").replace(/\s+/g, "");
  if (!handle) return "";
  if (handle.includes("/") && handle.includes(".")) return `https://${handle}`;
  const p = (platform || "").trim().toLowerCase();
  if (p === "instagram") return `https://instagram.com/${handle}`;
  if (p === "facebook") return `https://facebook.com/${handle}`;
  if (p === "threads") return `https://threads.net/@${handle}`;
  if (p === "x") return `https://x.com/${handle}`;
  if (p === "linkedin") return `https://linkedin.com/in/${handle}`;
  if (handle.includes(".")) return `https://${handle}`;
  return "";
}

function initialsFor(name: string) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "R";
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
  back: "b",
  delete: "Delete",
  close: "Escape",
  saveForm: "mod+Enter",
} as const;
type ShortcutAction = keyof typeof DEFAULT_SHORTCUTS;
type ShortcutMap = Record<ShortcutAction, string>;

const DEFAULT_TEMPLATES: TemplateItem[] = [
  {
    id: "first-outreach",
    title: "First outreach",
    workType: "branding",
    portfolioLink: "",
    text: "Hi [Name],\n\nI loved your recent [detail] — the way you handled it really stayed with me. I'm a visual designer focused on branding, editorial, and social, and I kept thinking about how your work and mine might fit together.\n\nIf you're open to it, I'd love to share a few relevant pieces. No pressure at all — I just admired the work and wanted to say hello.\n\nWarmly",
  },
  {
    id: "follow-up",
    title: "Polite follow-up",
    workType: "",
    portfolioLink: "",
    text: "Hi [Name],\n\nJust floating my last message back up — no pressure at all. I know inboxes get busy.\n\nIf it's helpful, I can share a quick idea or a relevant piece for [detail]. And if now isn't the right time, that's completely fine too.\n\nWarmly",
  },
  {
    id: "thank-you",
    title: "Thank you / collab",
    workType: "collaboration",
    portfolioLink: "",
    text: "Hi [Name],\n\nThank you for the conversation — I really enjoyed [detail] and working through it with you.\n\nIf anything comes up down the line, I'm happy to help. Let's stay in touch.\n\nWarmly",
  },
];

type ModalState = { mode: "add" } | { mode: "edit"; contact: Contact } | null;

async function api(action: string, args: Record<string, unknown>) {
  if (!isSupabaseConfigured)
    throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Please sign in to see your contacts.");
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

function uid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function formatDate(v: string) {
  if (!v) return "—";
  const d = new Date(`${v}T12:00:00`);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function formatTime(d: Date) {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
function displayLink(c: Contact) {
  return normalizeLink(c.value.link, c.value.channel, c.value.contactDetails);
}
function shortLinkText(url: string) {
  if (url.startsWith("mailto:")) return url.slice(7);
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : u.pathname;
    return `${u.hostname}${path}`;
  } catch {
    return url;
  }
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

export default function App() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [navTab, setNavTab] = useState<NavTab>("queue");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [templates, setTemplates] = useState<TemplateItem[]>(DEFAULT_TEMPLATES);
  const [activeTemplateId, setActiveTemplateId] = useState<string>("first-outreach");
  const [panelOpen, setPanelOpen] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [pasteText, setPasteText] = useState("");
  const [winModal, setWinModal] = useState(false);
  const [winContact, setWinContact] = useState<Contact | null>(null);
  const [winNote, setWinNote] = useState("");
  const [winReferral, setWinReferral] = useState("");
  const [pendingDelete, setPendingDelete] = useState<{ contact: Contact; timer: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [notesSavedAt, setNotesSavedAt] = useState<string | null>(null);
  const [notesSaving, setNotesSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [prevContact, setPrevContact] = useState<{ id: string; name: string } | null>(null);
  const [backStack, setBackStack] = useState<{ id: string; name: string }[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profile, setProfile] = useState<ProfileValue>(DEFAULT_PROFILE);
  const [profileDraft, setProfileDraft] = useState<ProfileValue>(DEFAULT_PROFILE);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [shortcuts] = useState<ShortcutMap>({ ...DEFAULT_SHORTCUTS });

  // Auth State
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authEmail, setAuthEmail] = useState("");
  const [authSent, setAuthSent] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authTab, setAuthTab] = useState<"signin" | "signup">("signin");
  const [authMethod, setAuthMethod] = useState<"password" | "magic">("password");
  const [authName, setAuthName] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authConfirmPassword, setAuthConfirmPassword] = useState("");
  const [authAgree, setAuthAgree] = useState(false);
  const [authForgotMode, setAuthForgotMode] = useState(false);
  const [authForgotSent, setAuthForgotSent] = useState(false);
  const [authNeedsConfirm, setAuthNeedsConfirm] = useState(false);
  const [authRecoveryMode, setAuthRecoveryMode] = useState(false);
  const [authNewPassword, setAuthNewPassword] = useState("");
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [deleteAllBusy, setDeleteAllBusy] = useState(false);

  const isDesktop = useMedia("(min-width: 1024px)");
  const notesTimer = useRef<number | null>(null);
  const inlineSaveTimer = useRef<number | null>(null);
  const templatesRef = useRef<TemplateItem[]>(DEFAULT_TEMPLATES);
  const profileRef = useRef<ProfileValue>(DEFAULT_PROFILE);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const pasteInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { templatesRef.current = templates; }, [templates]);
  useEffect(() => { profileRef.current = profile; }, [profile]);

  const notesFor = useRef<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3000);
  };

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

  const handleAuthSubmit = async (e: React.FormEvent) => {
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
        if (!authAgree) throw new Error("Please accept the privacy terms.");
        const { data, error } = await supabase.auth.signUp({
          email: authEmail.trim(),
          password: authPassword,
          options: { data: { full_name: authName.trim() }, emailRedirectTo: window.location.origin },
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

  const reloadContacts = useCallback(async () => {
    const data = (await api("records.list", { collection: "outreach-contacts" })) as {
      records: { id: string; value: any }[];
    };
    const out = (data.records || []).map((r) => ({ id: r.id, value: normalizeContactValue(r.value) }));
    setContacts(out);
    return out;
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
            const metaName =
              typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "";
            const p = normalizeProfileValue(first.value.profile, metaName);
            setProfile(p);
            profileRef.current = p;
            setProfileDraft(p);
          }
          const sel = first.value.selectedId || null;
          if (sel && list.some((c) => c.id === sel)) {
            setSelectedId(sel);
            setPanelOpen(true);
          }
        }
      } catch {
        /* settings best-effort */
      }
      setSettingsLoaded(true);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
      setSettingsLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [reloadContacts, user]);

  useEffect(() => {
    if (user) loadAll();
  }, [user, loadAll]);

  useEffect(() => {
    document.title = "Reach — Outreach, curated.";
  }, []);

  const resolvedTheme = useMemo(() => {
    if (themeMode !== "system") return themeMode;
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }, [themeMode]);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

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
        if (settingsId)
          await api("records.replace", { collection: "outreach-settings", id: settingsId, value });
        else {
          const created = (await api("records.create", {
            collection: "outreach-settings",
            value,
          })) as { id: string };
          setSettingsId(created.id);
        }
      } catch {
        /* best-effort */
      }
    },
    [settingsId, settingsLoaded]
  );

  const changeTheme = (m: ThemeMode) => {
    setThemeMode(m);
    saveSettings(m, selectedId);
  };
  const cycleTheme = () => {
    const order: ThemeMode[] = ["system", "light", "dark"];
    changeTheme(order[(order.indexOf(themeMode) + 1) % order.length]);
  };

  const selectContact = (id: string | null, opts?: { fromBack?: boolean }) => {
    if (id && selectedId && id !== selectedId && !opts?.fromBack) {
      const prev = contacts.find((c) => c.id === selectedId);
      if (prev) {
        const entry = { id: prev.id, name: prev.value.name };
        setBackStack((prevStack) => [...prevStack.slice(-2), entry]);
        setPrevContact(entry);
      }
    }
    setSelectedId(id);
    setPanelOpen(!!id);
    saveSettings(themeMode, id);
  };

  const goBack = () => {
    if (backStack.length === 0) return;
    const last = backStack[backStack.length - 1];
    setBackStack((prev) => prev.slice(0, -1));
    selectContact(last.id, { fromBack: true });
  };

  const selected = useMemo(
    () => contacts.find((c) => c.id === selectedId) || null,
    [contacts, selectedId]
  );
  const selectedLink = selected ? displayLink(selected) : "";

  useEffect(() => {
    if (selected) {
      setNotesDraft(selected.value.notes || "");
      notesFor.current = selected.id;
      setNotesSavedAt(null);
    } else {
      setNotesDraft("");
      notesFor.current = null;
    }
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const persistContact = async (contact: Contact, patch: Partial<ContactValue>) => {
    const next: ContactValue = {
      ...contact.value,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    setContacts((prev) => prev.map((c) => (c.id === contact.id ? { ...c, value: next } : c)));
    await api("records.replace", { collection: "outreach-contacts", id: contact.id, value: next });
    return next;
  };

  const updateInlineField = (patch: Partial<ContactValue>) => {
    if (!selected) return;
    const next: ContactValue = {
      ...selected.value,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    if (patch.link !== undefined || patch.channel !== undefined || patch.contactDetails !== undefined) {
      next.link = normalizeLink(
        patch.link ?? selected.value.link,
        patch.channel ?? selected.value.channel,
        patch.contactDetails ?? selected.value.contactDetails
      );
    }
    setContacts((prev) => prev.map((c) => (c.id === selected.id ? { ...c, value: next } : c)));
    setNotesSaving(true);
    if (inlineSaveTimer.current) window.clearTimeout(inlineSaveTimer.current);
    inlineSaveTimer.current = window.setTimeout(async () => {
      try {
        await api("records.replace", {
          collection: "outreach-contacts",
          id: selected.id,
          value: next,
        });
        setNotesSavedAt(formatTime(new Date()));
      } catch {
        showToast("Couldn't save changes");
      } finally {
        setNotesSaving(false);
      }
    }, 400);
  };

  const onNotesChange = (text: string) => {
    setNotesDraft(text);
    if (notesTimer.current) window.clearTimeout(notesTimer.current);
    notesTimer.current = window.setTimeout(async () => {
      const id = notesFor.current;
      if (!id) return;
      const cur = contacts.find((c) => c.id === id);
      if (!cur || cur.value.notes === text) return;
      setNotesSaving(true);
      try {
        await persistContact(cur, { notes: text });
        setNotesSavedAt(formatTime(new Date()));
      } finally {
        setNotesSaving(false);
      }
    }, 400);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const today = todayISO();
    const list = contacts.filter((c) => {
      const stage = c.value.stage || stageFromLegacy(c.value.replied, c.value.followedUp);
      if (navTab === "pipeline" && !["pitched", "in-conversation", "won"].includes(stage))
        return false;
      if (filter === "to-reach" && stage !== "to-reach") return false;
      if (filter === "replied" && !["in-conversation", "won"].includes(stage)) return false;
      if (filter === "followed" && stage !== "follow-up") return false;
      if (filter === "today" && c.value.followUpDate !== today && c.value.outreachDate !== today)
        return false;
      if (filter === "needs-follow-up" && !isFollowUpDue(c.value, today)) return false;
      if (!q) return true;
      return [
        c.value.name,
        c.value.channel,
        c.value.contactDetails,
        c.value.link,
        c.value.whyThem,
        c.value.whatSent,
        c.value.nextStep,
        c.value.workType,
        c.value.notes,
      ].some((v) => (v || "").toLowerCase().includes(q));
    });
    return [...list].sort((a, b) => {
      const aDue = isFollowUpDue(a.value, today);
      const bDue = isFollowUpDue(b.value, today);
      if (aDue && !bDue) return -1;
      if (!aDue && bDue) return 1;
      return b.value.updatedAt.localeCompare(a.value.updatedAt);
    });
  }, [contacts, navTab, search, filter]);

  const counts = useMemo(() => {
    const today = todayISO();
    const followUpDue = contacts.filter((c) => isFollowUpDue(c.value, today));
    const toReachCount = contacts.filter(
      (c) => (c.value.stage || stageFromLegacy(c.value.replied, c.value.followedUp)) === "to-reach"
    ).length;
    const pitchedCount = contacts.filter(
      (c) => (c.value.stage || stageFromLegacy(c.value.replied, c.value.followedUp)) === "pitched"
    ).length;
    const inConvoCount = contacts.filter(
      (c) =>
        (c.value.stage || stageFromLegacy(c.value.replied, c.value.followedUp)) ===
        "in-conversation"
    ).length;
    const wonCount = contacts.filter(
      (c) => (c.value.stage || stageFromLegacy(c.value.replied, c.value.followedUp)) === "won"
    ).length;
    return {
      total: contacts.length,
      replied: contacts.filter((c) => c.value.replied).length,
      followed: contacts.filter((c) => c.value.followedUp).length,
      toReach: toReachCount,
      pitched: pitchedCount,
      inConversation: inConvoCount,
      won: wonCount,
      needsFollowUp: followUpDue.length,
      followUpDueList: followUpDue,
    };
  }, [contacts]);

  const exportCSV = () => {
    const headers = [
      "name",
      "channel",
      "outreach date",
      "contact",
      "link",
      "stage",
      "work type",
      "why them",
      "what sent",
      "next step",
      "follow-up date",
      "notes",
    ];
    const rows = contacts.map((c) => [
      c.value.name,
      c.value.channel,
      c.value.outreachDate,
      c.value.contactDetails,
      displayLink(c),
      stageLabel(c.value.stage),
      workTypeLabel(c.value.workType),
      c.value.whyThem || "",
      c.value.whatSent || "",
      c.value.nextStep || "",
      c.value.followUpDate || "",
      c.value.notes,
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
    setTimeout(() => URL.revokeObjectURL(url), 800);
    showToast(`Exported ${contacts.length} contacts`);
  };

  const copyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
      showToast("Copied to clipboard");
    } catch {
      showToast("Select the text to copy it");
    }
  };

  const activeTemplate = templates.find((t) => t.id === activeTemplateId) || templates[0];
  const interpolatedPitch = useMemo(() => {
    if (!activeTemplate) return "";
    if (!selected) return activeTemplate.text;
    const firstName = (selected.value.name || "there").trim().split(/\s+/)[0];
    const detail = (selected.value.whyThem || "work").trim();
    return activeTemplate.text
      .replace(/\[Name\]/gi, firstName)
      .replace(/\[detail\]/gi, detail);
  }, [activeTemplate, selected]);

  const copyPitchAndAdvance = async () => {
    if (!selected || !activeTemplate) return;
    await copyText(interpolatedPitch, `pitch-${selected.id}`);
    const curStage = selected.value.stage || "to-reach";
    const nextStage: Stage = curStage === "to-reach" ? "pitched" : curStage;
    const nextFollowUp = selected.value.followUpDate || addDaysISO(todayISO(), 4);
    await persistContact(selected, {
      stage: nextStage,
      whatSent: activeTemplate.title,
      followUpDate: nextFollowUp,
    });
    showToast("Pitch copied • Moved to Pitched (+4d)");
  };

  const setStage = async (stage: Stage) => {
    if (!selected) return;
    const patch: Partial<ContactValue> = { stage };
    if (stage === "in-conversation" && !selected.value.replied) patch.replied = true;
    if (stage === "won" && !selected.value.replied) patch.replied = true;
    if (stage === "follow-up" && !selected.value.followedUp) patch.followedUp = true;
    if (stage === "pitched" && !selected.value.followUpDate)
      patch.followUpDate = addDaysISO(todayISO(), 4);
    try {
      await persistContact(selected, patch);
      showToast(`Moved to ${stageLabel(stage)}`);
      if (stage === "won") {
        setWinContact(selected);
        setWinNote("");
        setWinReferral("");
        setWinModal(true);
      }
    } catch {
      showToast("Couldn’t update stage");
    }
  };

  const [form, setForm] = useState({
    name: "",
    channel: "",
    outreachDate: todayISO(),
    contactDetails: "",
    link: "",
    notes: "",
    stage: "to-reach" as Stage,
    whyThem: "",
    whatSent: "",
    nextStep: "",
    workType: "" as WorkType,
    followUpDate: "",
    featuredLink: "",
  });

  const openAdd = () => {
    setForm({
      name: "",
      channel: "",
      outreachDate: todayISO(),
      contactDetails: "",
      link: "",
      notes: "",
      stage: "to-reach",
      whyThem: "",
      whatSent: "",
      nextStep: "",
      workType: "",
      followUpDate: "",
      featuredLink: profile.featuredLink || "",
    });
    setFormError(null);
    setModal({ mode: "add" });
  };

  const openEdit = (c: Contact) => {
    const v = normalizeContactValue(c.value);
    setForm({
      name: v.name,
      channel: v.channel,
      outreachDate: v.outreachDate || todayISO(),
      contactDetails: v.contactDetails,
      link: v.link,
      notes: v.notes,
      stage: v.stage || "to-reach",
      whyThem: v.whyThem || "",
      whatSent: v.whatSent || "",
      nextStep: v.nextStep || "",
      workType: v.workType || "",
      followUpDate: v.followUpDate || "",
      featuredLink: v.featuredLink || "",
    });
    setFormError(null);
    setModal({ mode: "edit", contact: c });
  };

  const submitForm = async () => {
    if (!form.name.trim()) {
      setFormError("Name is required.");
      return;
    }
    const normalized = normalizeLink(form.link, form.channel, form.contactDetails);
    setBusy(true);
    setFormError(null);
    const now = new Date().toISOString();
    try {
      if (modal?.mode === "edit") {
        await persistContact(modal.contact, {
          name: form.name.trim(),
          channel: form.channel.trim(),
          outreachDate: form.outreachDate,
          contactDetails: form.contactDetails.trim(),
          link: normalized,
          notes: form.notes,
          stage: form.stage,
          whyThem: form.whyThem.trim(),
          whatSent: form.whatSent.trim(),
          nextStep: form.nextStep.trim(),
          workType: form.workType,
          followUpDate: form.followUpDate,
          featuredLink: form.featuredLink.trim(),
        });
        showToast("Contact updated");
        selectContact(modal.contact.id);
      } else {
        const value: ContactValue = {
          name: form.name.trim(),
          channel: form.channel.trim(),
          outreachDate: form.outreachDate,
          contactDetails: form.contactDetails.trim(),
          link: normalized,
          replied: form.stage === "in-conversation" || form.stage === "won",
          followedUp: form.stage === "follow-up",
          notes: form.notes,
          createdAt: now,
          updatedAt: now,
          stage: form.stage,
          whyThem: form.whyThem.trim(),
          whatSent: form.whatSent.trim(),
          nextStep: form.nextStep.trim(),
          workType: form.workType,
          followUpDate: form.followUpDate,
          featuredLink: form.featuredLink.trim(),
        };
        const created = (await api("records.create", {
          collection: "outreach-contacts",
          value,
        })) as { id: string };
        await reloadContacts();
        showToast("Contact added");
        selectContact(created.id);
      }
      setModal(null);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Couldn’t save contact");
    } finally {
      setBusy(false);
    }
  };

  const triggerArchive = (target: Contact) => {
    if (pendingDelete) window.clearTimeout(pendingDelete.timer);
    setContacts((prev) => prev.filter((c) => c.id !== target.id));
    if (selectedId === target.id) {
      setSelectedId(null);
      setPanelOpen(false);
      saveSettings(themeMode, null);
    }
    const timer = window.setTimeout(async () => {
      try {
        await api("records.delete", { collection: "outreach-contacts", id: target.id });
      } catch {
        /* already gone */
      }
      setPendingDelete((cur) => (cur?.contact.id === target.id ? null : cur));
    }, 5000);
    setPendingDelete({ contact: target, timer });
  };

  const undoDelete = () => {
    if (!pendingDelete) return;
    window.clearTimeout(pendingDelete.timer);
    setContacts((prev) =>
      [...prev, pendingDelete.contact].sort((a, b) =>
        b.value.updatedAt.localeCompare(a.value.updatedAt)
      )
    );
    setPendingDelete(null);
    showToast("Restored.");
  };

  const handlePasteAdd = async () => {
    const raw = pasteText.trim();
    if (!raw) return;
    const parsed = parsePasteToContact(raw);
    const dup = contacts.find(
      (c) =>
        (parsed.link && displayLink(c) === parsed.link) ||
        (parsed.name && c.value.name.toLowerCase() === parsed.name.toLowerCase())
    );
    if (dup) {
      selectContact(dup.id);
      showToast("Opened existing contact.");
      setPasteText("");
      return;
    }
    const value: ContactValue = {
      name: parsed.name || raw,
      channel: parsed.channel || "Instagram",
      outreachDate: todayISO(),
      contactDetails: parsed.contactDetails,
      link: parsed.link,
      replied: false,
      followedUp: false,
      notes: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      stage: "to-reach",
      whyThem: parsed.whyThem || "",
      whatSent: "",
      nextStep: "",
      workType: "",
      followUpDate: "",
      featuredLink: profile.featuredLink || "",
    };
    try {
      const created = (await api("records.create", {
        collection: "outreach-contacts",
        value,
      })) as { id: string };
      await reloadContacts();
      setPasteText("");
      showToast(`Added ${value.name} to Queue`);
      selectContact(created.id);
    } catch {
      showToast("Could not add contact");
    }
  };

  const saveWinLoop = async () => {
    if (!winContact) return;
    try {
      await persistContact(winContact, {
        winNote: winNote.trim(),
        testimonial: winNote.trim(),
      });
      if (winReferral.trim()) {
        const parsed = parsePasteToContact(winReferral.trim());
        const value: ContactValue = {
          name: parsed.name || winReferral.trim(),
          channel: parsed.channel || "Instagram",
          outreachDate: todayISO(),
          contactDetails: winReferral.trim(),
          link: parsed.link,
          replied: false,
          followedUp: false,
          notes: `Referred by ${winContact.value.name}.`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          stage: "to-reach",
          whyThem: parsed.whyThem || "",
          whatSent: "",
          nextStep: `Intro via ${winContact.value.name}`,
          workType: winContact.value.workType || "",
          followUpDate: "",
          featuredLink: "",
          referredById: winContact.id,
        };
        const created = (await api("records.create", {
          collection: "outreach-contacts",
          value,
        })) as { id: string };
        await reloadContacts();
        showToast(`Queued referral: ${value.name}`);
        selectContact(created.id);
      } else {
        showToast("Win logged.");
      }
    } catch {
      showToast("Could not save win");
    }
    setWinModal(false);
    setWinContact(null);
  };

  const saveProfile = async () => {
    const next: ProfileValue = {
      name: profileDraft.name.trim(),
      socials: normalizeSocials(profileDraft.socials),
      avatarUrl: (profileDraft.avatarUrl || "").trim(),
      whatIDo: (profileDraft.whatIDo || "").trim(),
      openFor: (profileDraft.openFor || "").trim(),
      featuredLink: (profileDraft.featuredLink || "").trim(),
    };
    setProfile(next);
    profileRef.current = next;
    await saveSettings(themeMode, selectedId, templates, next);
    showToast("Studio profile saved");
    setSettingsOpen(false);
  };

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
      const { error } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      setProfileDraft((d) => ({ ...d, avatarUrl: `${data.publicUrl}?t=${Date.now()}` }));
      showToast("Photo uploaded — click Save");
    } catch {
      showToast("Could not upload photo");
    } finally {
      setAvatarUploading(false);
    }
  };

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName || "";
      const isTyping =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!target?.isContentEditable;
      if (isTyping) {
        if (e.key === "Escape") target?.blur();
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        pasteInputRef.current?.focus();
      } else if (e.key.toLowerCase() === "j" || e.key === "ArrowDown") {
        if (filtered.length === 0) return;
        e.preventDefault();
        const idx = filtered.findIndex((c) => c.id === selectedId);
        const next = idx < 0 ? filtered[0] : filtered[Math.min(filtered.length - 1, idx + 1)];
        selectContact(next.id);
      } else if (e.key.toLowerCase() === "k" || e.key === "ArrowUp") {
        if (filtered.length === 0) return;
        e.preventDefault();
        const idx = filtered.findIndex((c) => c.id === selectedId);
        const prev = idx <= 0 ? filtered[0] : filtered[idx - 1];
        selectContact(prev.id);
      } else if (e.key.toLowerCase() === "z" && pendingDelete) {
        e.preventDefault();
        undoDelete();
      } else if (e.key === "Escape") {
        if (settingsOpen) setSettingsOpen(false);
        else if (modal) setModal(null);
        else if (selectedId) selectContact(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  // ============================================================================
  // AUTH & SETUP VIEWS
  // ============================================================================
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: "var(--bg)" }}>
        <p style={{ color: "var(--muted)" }}>Loading Reach…</p>
      </div>
    );
  }
  if (!isSupabaseConfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6" style={{ background: "var(--bg)" }}>
        <div className="bento-card max-w-[460px] p-8 text-center">
          <p className="small-caps" style={{ color: "var(--brand)" }}>Setup Needed</p>
          <h1 className="mt-2 text-[24px] font-semibold">Connect Supabase</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
            Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment variables and redeploy.
          </p>
        </div>
      </div>
    );
  }
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-10" style={{ background: "var(--bg)" }}>
        <div className="w-full max-w-[440px]">
          <div className="flex flex-col items-center text-center">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-[14px] text-white font-bold text-lg"
              style={{ background: "var(--brand-gradient)" }}
            >
              R
            </div>
            <h1 className="mt-4 text-[28px] font-semibold tracking-[-0.02em]">Welcome to Reach</h1>
            <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
              Curated creative outreach &amp; follow-up studio.
            </p>
          </div>

          <div className="bento-card mt-6 p-6">
            <div className="flex rounded-full p-1" style={{ background: "var(--pill-track)" }}>
              {(["signin", "signup"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => {
                    setAuthTab(tab);
                    setAuthError(null);
                  }}
                  className="h-9 flex-1 rounded-full text-sm font-medium transition-colors"
                  style={
                    authTab === tab
                      ? { background: "var(--obsidian)", color: "#FFFFFF" }
                      : { color: "var(--muted)" }
                  }
                >
                  {tab === "signin" ? "Sign in" : "Create account"}
                </button>
              ))}
            </div>

            {authSent || authNeedsConfirm || authForgotSent ? (
              <div className="mt-6 text-center">
                <h2 className="text-lg font-semibold">Check your inbox</h2>
                <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                  We sent a link to <b>{authEmail}</b>.
                </p>
                <button
                  onClick={() => {
                    setAuthSent(false);
                    setAuthNeedsConfirm(false);
                    setAuthForgotSent(false);
                  }}
                  className="mt-4 text-sm font-medium underline"
                  style={{ color: "var(--brand)" }}
                >
                  Back to sign in
                </button>
              </div>
            ) : (
              <>
                <div className="mt-5 grid grid-cols-3 gap-2">
                  {(["google", "github", "apple"] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => handleOAuth(p)}
                      disabled={authBusy}
                      className="btn-press h-10 rounded-full border text-xs font-semibold uppercase tracking-wider"
                      style={{ borderColor: "var(--divider)" }}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                <form onSubmit={handleAuthSubmit} className="mt-5 space-y-3">
                  {authTab === "signup" && authMethod === "password" && (
                    <input
                      type="text"
                      required
                      placeholder="Full name or studio"
                      value={authName}
                      onChange={(e) => setAuthName(e.target.value)}
                      className="h-11 w-full rounded-[12px] border px-3.5 text-sm"
                      style={{ borderColor: "var(--divider)", background: "var(--input)" }}
                    />
                  )}
                  <input
                    type="email"
                    required
                    placeholder="you@studio.com"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    className="h-11 w-full rounded-[12px] border px-3.5 text-sm"
                    style={{ borderColor: "var(--divider)", background: "var(--input)" }}
                  />
                  {authMethod === "password" && !authForgotMode && (
                    <input
                      type="password"
                      required
                      minLength={8}
                      placeholder="Password"
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      className="h-11 w-full rounded-[12px] border px-3.5 text-sm"
                      style={{ borderColor: "var(--divider)", background: "var(--input)" }}
                    />
                  )}
                  {authTab === "signup" && authMethod === "password" && (
                    <>
                      <input
                        type="password"
                        required
                        minLength={8}
                        placeholder="Confirm password"
                        value={authConfirmPassword}
                        onChange={(e) => setAuthConfirmPassword(e.target.value)}
                        className="h-11 w-full rounded-[12px] border px-3.5 text-sm"
                        style={{ borderColor: "var(--divider)", background: "var(--input)" }}
                      />
                      <label className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
                        <input
                          type="checkbox"
                          checked={authAgree}
                          onChange={(e) => setAuthAgree(e.target.checked)}
                        />
                        <span>My contacts are stored privately under my account.</span>
                      </label>
                    </>
                  )}
                  {authError && (
                    <p className="text-xs font-medium" style={{ color: "var(--danger)" }}>
                      {authError}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={authBusy}
                    className="btn-press h-11 w-full rounded-full text-sm font-medium text-white"
                    style={{ background: "var(--obsidian)" }}
                  >
                    {authBusy
                      ? "Working…"
                      : authForgotMode
                      ? "Send reset link"
                      : authMethod === "magic"
                      ? "Send magic link"
                      : authTab === "signup"
                      ? "Create account"
                      : "Sign in"}
                  </button>
                  <div className="flex justify-between pt-1 text-xs" style={{ color: "var(--muted)" }}>
                    <button
                      type="button"
                      onClick={() =>
                        setAuthMethod((m) => (m === "password" ? "magic" : "password"))
                      }
                      className="underline"
                    >
                      {authMethod === "password" ? "Use magic link" : "Use password"}
                    </button>
                    {authTab === "signin" && (
                      <button
                        type="button"
                        onClick={() => setAuthForgotMode((v) => !v)}
                        className="underline"
                      >
                        {authForgotMode ? "Back" : "Forgot password?"}
                      </button>
                    )}
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (user && authRecoveryMode) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6" style={{ background: "var(--bg)" }}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await supabase.auth.updateUser({ password: authNewPassword });
            setAuthRecoveryMode(false);
            showToast("Password updated");
          }}
          className="bento-card w-full max-w-[400px] p-6 space-y-4"
        >
          <h1 className="text-xl font-semibold">Set new password</h1>
          <input
            type="password"
            required
            minLength={8}
            placeholder="New password (8+ chars)"
            value={authNewPassword}
            onChange={(e) => setAuthNewPassword(e.target.value)}
            className="h-11 w-full rounded-[12px] border px-3.5"
            style={{ borderColor: "var(--divider)" }}
          />
          <button
            type="submit"
            className="h-11 w-full rounded-full text-sm font-medium text-white"
            style={{ background: "var(--obsidian)" }}
          >
            Save password
          </button>
        </form>
      </div>
    );
  }

  // ============================================================================
  // COMPUTED METRICS FOR BENTO CARDS & OBSIDIAN DOSSIER
  // ============================================================================
  const nextBest = counts.followUpDueList?.[0] || contacts.find((c) => (c.value.stage || "to-reach") === "to-reach") || null;
  const replyRate = counts.total > 0 ? Math.round((counts.replied / counts.total) * 100) : 0;
  const totalActive = Math.max(1, counts.toReach + counts.pitched + counts.inConversation + counts.won);
  const pctToReach = Math.round((counts.toReach / totalActive) * 100);
  const pctPitched = Math.round((counts.pitched / totalActive) * 100);
  const pctInConvo = Math.round((counts.inConversation / totalActive) * 100);
  const pctWon = Math.max(0, 100 - pctToReach - pctPitched - pctInConvo);

  // ============================================================================
  // RIGHT PANEL: DARK OBSIDIAN DOSSIER & CADENCE CARD (Modeled on Raxon Dark Card)
  // ============================================================================
  const obsidianDeskContent = selected ? (
    <div key={selected.id} className="animate-swap flex min-h-0 flex-1 flex-col">
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-2 pb-4 border-b" style={{ borderColor: "var(--obsidian-border)" }}>
        <div className="flex items-center gap-2">
          {backStack.length > 0 && prevContact && (
            <button
              type="button"
              onClick={goBack}
              className="btn-press inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium"
              style={{ background: "var(--obsidian-row)", color: "var(--obsidian-muted)" }}
            >
              <ChevronLeft size={13} /> {prevContact.name.split(" ")[0]}
            </button>
          )}
          <span className="small-caps" style={{ color: "var(--obsidian-muted)" }}>
            Contact Dossier
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px]" style={{ color: "var(--obsidian-muted)" }}>
            {notesSaving ? "Saving…" : notesSavedAt ? `Saved ${notesSavedAt}` : ""}
          </span>
          <button
            type="button"
            onClick={() => openEdit(selected)}
            title="Full edit"
            className="btn-press flex h-8 w-8 items-center justify-center rounded-full"
            style={{ background: "var(--obsidian-row)", color: "var(--obsidian-muted)" }}
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            onClick={() => triggerArchive(selected)}
            title="Archive (5s undo)"
            className="btn-press flex h-8 w-8 items-center justify-center rounded-full"
            style={{ background: "var(--obsidian-row)", color: "var(--obsidian-muted)" }}
          >
            <Trash2 size={13} />
          </button>
          <button
            type="button"
            onClick={() => selectContact(null)}
            title="Close"
            className="btn-press flex h-8 w-8 items-center justify-center rounded-full"
            style={{ background: "var(--obsidian-row)", color: "var(--obsidian-text)" }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto pt-5 pr-1 space-y-4">
        {/* Editable Contact Name & Channel Pills */}
        <div>
          <input
            value={selected.value.name}
            onChange={(e) => updateInlineField({ name: e.target.value })}
            aria-label="Contact name"
            className="obsidian-inline w-full text-[24px] font-semibold leading-tight tracking-[-0.02em]"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              value={selected.value.channel}
              onChange={(e) => updateInlineField({ channel: e.target.value })}
              placeholder="Channel (IG, Email)"
              className="obsidian-inline w-[110px] text-xs"
              style={{ color: "var(--obsidian-muted)" }}
            />
            <span style={{ color: "var(--obsidian-muted)" }}>•</span>
            <select
              value={selected.value.workType || ""}
              onChange={(e) => updateInlineField({ workType: e.target.value as WorkType })}
              className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
              style={{ background: "var(--obsidian-row)", color: "var(--obsidian-text)" }}
            >
              {WORK_TYPES.map((w) => (
                <option key={w.value} value={w.value} style={{ background: "#141413" }}>
                  {w.label}
                </option>
              ))}
            </select>
            {selected.value.followUpDate && (
              <span
                className="rounded-full px-2.5 py-0.5 text-[11px] font-medium text-white"
                style={{ background: "var(--brand)" }}
              >
                Due {formatDate(selected.value.followUpDate)}
              </span>
            )}
          </div>
        </div>

        {/* Inner Obsidian Well 1: Handle, Link & Follow-up Cadence */}
        <div className="obsidian-well p-3.5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="small-caps w-[68px] shrink-0" style={{ color: "var(--obsidian-muted)" }}>
              Handle
            </span>
            <input
              value={selected.value.contactDetails}
              onChange={(e) => updateInlineField({ contactDetails: e.target.value })}
              placeholder="@handle or email"
              className="obsidian-inline min-w-0 flex-1 text-xs"
            />
            {selected.value.contactDetails && (
              <button
                type="button"
                onClick={() => copyText(selected.value.contactDetails, "det")}
                className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                style={{ background: "rgba(255,255,255,0.08)" }}
              >
                {copied === "det" ? "Copied" : "Copy"}
              </button>
            )}
          </div>

          <div
            className="flex items-center justify-between gap-2 pt-2.5 border-t"
            style={{ borderColor: "var(--obsidian-border)" }}
          >
            <span className="small-caps w-[68px] shrink-0" style={{ color: "var(--obsidian-muted)" }}>
              Link
            </span>
            {selectedLink ? (
              <a
                href={selectedLink}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate text-xs font-medium underline"
                style={{ color: "#FF7038" }}
              >
                {shortLinkText(selectedLink)}
              </a>
            ) : (
              <input
                value={selected.value.link}
                onChange={(e) => updateInlineField({ link: e.target.value })}
                placeholder="Paste URL…"
                className="obsidian-inline min-w-0 flex-1 text-xs"
              />
            )}
            {selectedLink && (
              <a
                href={selectedLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium"
                style={{ background: "rgba(255,255,255,0.08)" }}
              >
                Open <ArrowUpRight size={11} />
              </a>
            )}
          </div>

          <div
            className="flex items-center justify-between gap-2 pt-2.5 border-t"
            style={{ borderColor: "var(--obsidian-border)" }}
          >
            <span className="small-caps w-[68px] shrink-0" style={{ color: "var(--obsidian-muted)" }}>
              Follow-up
            </span>
            <input
              type="date"
              value={selected.value.followUpDate || ""}
              onChange={(e) => updateInlineField({ followUpDate: e.target.value })}
              className="obsidian-inline min-w-0 flex-1 text-xs"
            />
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => updateInlineField({ followUpDate: addDaysISO(todayISO(), 4) })}
                className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{ background: "rgba(255,255,255,0.08)" }}
              >
                +4d
              </button>
              <button
                type="button"
                onClick={() => updateInlineField({ followUpDate: addDaysISO(todayISO(), 7) })}
                className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{ background: "rgba(255,255,255,0.08)" }}
              >
                +7d
              </button>
            </div>
          </div>
        </div>

        {/* Inner Obsidian Well 2: Stage Pills */}
        <div className="obsidian-well p-3.5">
          <div className="flex items-center justify-between mb-2.5">
            <span className="small-caps" style={{ color: "var(--obsidian-muted)" }}>
              Journey Stage
            </span>
            <span className="text-[11px]" style={{ color: "var(--obsidian-muted)" }}>
              {stageLabel(selected.value.stage)}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {STAGES.slice(0, 6).map((s) => {
              const active = (selected.value.stage || "to-reach") === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setStage(s.value)}
                  className="btn-press rounded-full px-3 py-1 text-xs font-medium"
                  style={
                    active
                      ? { background: "var(--brand)", color: "#FFFFFF" }
                      : {
                          background: "rgba(255,255,255,0.06)",
                          color: "var(--obsidian-muted)",
                        }
                  }
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Inner Obsidian Well 3: Context (Why Them & Next Step) */}
        <div className="obsidian-well p-3.5 space-y-3">
          <div>
            <p className="small-caps" style={{ color: "var(--obsidian-muted)" }}>
              Why them (interpolates [detail])
            </p>
            <input
              value={selected.value.whyThem || ""}
              onChange={(e) => updateInlineField({ whyThem: e.target.value })}
              placeholder="What caught your eye about their work?"
              className="obsidian-inline mt-1 w-full text-xs"
            />
          </div>
          <div className="pt-2 border-t" style={{ borderColor: "var(--obsidian-border)" }}>
            <p className="small-caps" style={{ color: "var(--obsidian-muted)" }}>
              Next step
            </p>
            <input
              value={selected.value.nextStep || ""}
              onChange={(e) => updateInlineField({ nextStep: e.target.value })}
              placeholder="Send branding reel on Thursday…"
              className="obsidian-inline mt-1 w-full text-xs"
            />
          </div>
        </div>

        {/* Inner Obsidian Well 4: Context-Bound Live Pitch Composer */}
        <div className="obsidian-well p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="small-caps flex items-center gap-1" style={{ color: "#FF7038" }}>
              <Sparkles size={11} /> Live Pitch
            </span>
            <div className="flex gap-1">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTemplateId(t.id)}
                  className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                  style={
                    activeTemplate?.id === t.id
                      ? { background: "#FFFFFF", color: "#141413" }
                      : {
                          background: "rgba(255,255,255,0.06)",
                          color: "var(--obsidian-muted)",
                        }
                  }
                >
                  {t.title.split(" ")[0]}
                </button>
              ))}
            </div>
          </div>

          <p
            className="mt-2.5 whitespace-pre-wrap text-xs leading-relaxed"
            style={{ color: "var(--obsidian-muted)" }}
          >
            {interpolatedPitch}
          </p>

          <button
            type="button"
            onClick={copyPitchAndAdvance}
            className="btn-press mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-full text-xs font-semibold text-white"
            style={{ background: "var(--brand)" }}
          >
            <Copy size={13} /> Copy Pitch &amp; Mark Pitched (+4d)
          </button>
        </div>

        {/* Thread Notes */}
        <div className="obsidian-well p-3.5">
          <label className="small-caps block" style={{ color: "var(--obsidian-muted)" }}>
            Notes
          </label>
          <textarea
            id="notes-editor"
            rows={3}
            value={notesDraft}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Conversation history, links sent, replies…"
            className="mt-1.5 w-full resize-y bg-transparent text-xs leading-relaxed outline-none"
            style={{ color: "var(--obsidian-text)" }}
          />
        </div>
      </div>
    </div>
  ) : (
    /* Idle Right Card: Studio Cadence Goals (Modeled on Raxon's "My Savings Goals" Dark Card) */
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full"
            style={{ background: "var(--obsidian-row)" }}
          >
            <Send size={14} style={{ color: "#FF7038" }} />
          </span>
          <span className="text-[16px] font-semibold">Outreach Cadence</span>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="btn-press inline-flex h-8 items-center gap-1 rounded-full bg-white px-3 text-xs font-semibold text-[#141413]"
        >
          <Plus size={13} /> Add Contact
        </button>
      </div>

      {/* Stage Progress Bars (Raxon Savings Goals Style) */}
      <div className="mt-5 space-y-2.5">
        {[
          { label: "To Reach Queue", count: counts.toReach, total: Math.max(10, counts.total) },
          { label: "Pitched & Waiting", count: counts.pitched, total: Math.max(10, counts.total) },
          { label: "In Conversation", count: counts.inConversation, total: Math.max(5, counts.total) },
          { label: "Won Collaborations", count: counts.won, total: Math.max(5, counts.total) },
        ].map((item) => {
          const pct = Math.min(100, Math.round((item.count / item.total) * 100));
          return (
            <div key={item.label} className="obsidian-well px-3.5 py-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{item.label}</span>
                <span className="tabular-nums" style={{ color: "var(--obsidian-muted)" }}>
                  <b className="text-white">{item.count}</b> / {item.total}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${Math.max(6, pct)}%`, background: "var(--brand)" }}
                  />
                </div>
                <span className="tabular-nums text-[11px] font-medium" style={{ color: "var(--obsidian-muted)" }}>
                  {pct}%
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Template Preview inside Obsidian Desk */}
      <div className="mt-5 obsidian-well p-4 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between">
            <span className="small-caps" style={{ color: "var(--obsidian-muted)" }}>
              Quick Pitch Template
            </span>
            <button
              type="button"
              onClick={() => setNavTab("templates")}
              className="text-xs font-medium underline"
              style={{ color: "#FF7038" }}
            >
              Edit all
            </button>
          </div>
          <div className="mt-2.5 flex gap-1.5">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTemplateId(t.id)}
                className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                style={
                  activeTemplate?.id === t.id
                    ? { background: "var(--brand)", color: "#FFFFFF" }
                    : { background: "rgba(255,255,255,0.06)", color: "var(--obsidian-muted)" }
                }
              >
                {t.title.split(" ")[0]}
              </button>
            ))}
          </div>
          <p
            className="mt-3 line-clamp-5 whitespace-pre-wrap text-xs leading-relaxed"
            style={{ color: "var(--obsidian-muted)" }}
          >
            {activeTemplate?.text}
          </p>
        </div>

        <button
          type="button"
          onClick={() => activeTemplate && copyText(activeTemplate.text, "idle-tpl")}
          className="btn-press mt-4 flex h-9 w-full items-center justify-center gap-1.5 rounded-full bg-white/10 text-xs font-medium text-white hover:bg-white/15"
        >
          <Copy size={13} /> {copied === "idle-tpl" ? "Copied Template" : "Copy Raw Template"}
        </button>
      </div>
    </div>
  );

  // ============================================================================
  // MAIN BENTO WORKSPACE
  // ============================================================================
  return (
    <div className="min-h-screen" style={{ background: "var(--bg)", color: "var(--text)" }}>
      <div className="mx-auto max-w-[1440px] px-4 py-4 sm:px-6 lg:px-8">
        {/* 1. CENTERED FLOATING PILL TOP BAR (Raxon Header Architecture) */}
        <header className="flex items-center justify-between gap-4">
          {/* Brand Badge */}
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-[12px] text-white font-bold text-base shadow-sm"
              style={{ background: "var(--brand-gradient)" }}
            >
              R
            </div>
            <span className="text-[19px] font-semibold tracking-[-0.02em]">Reach</span>
          </div>

          {/* Centered Capsule Navigation */}
          <nav
            aria-label="Primary Navigation"
            className="flex items-center gap-1 rounded-full p-1"
            style={{ background: "var(--pill-track)" }}
          >
            {(
              [
                { id: "queue", label: "Queue" },
                { id: "pipeline", label: "Pipeline" },
                { id: "templates", label: "Templates" },
              ] as const
            ).map((tab) => {
              const active = navTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setNavTab(tab.id)}
                  className="btn-press rounded-full px-4 py-2 text-sm font-medium transition-all"
                  style={
                    active
                      ? { background: "var(--obsidian)", color: "#FFFFFF" }
                      : { color: "var(--muted)" }
                  }
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>

          {/* Right Circular Utility Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={cycleTheme}
              title={`Theme: ${themeMode}`}
              aria-label="Toggle theme"
              className="btn-press flex h-10 w-10 items-center justify-center rounded-full"
              style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
            >
              {themeMode === "dark" ? (
                <Moon size={16} />
              ) : themeMode === "light" ? (
                <Sun size={16} />
              ) : (
                <Monitor size={16} />
              )}
            </button>
            <button
              onClick={exportCSV}
              title="Export CSV"
              aria-label="Export CSV"
              className="btn-press hidden sm:flex h-10 w-10 items-center justify-center rounded-full"
              style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
            >
              <Download size={16} />
            </button>
            <button
              onClick={() => {
                setProfileDraft(profile);
                setSettingsOpen(true);
              }}
              title="Studio Settings"
              aria-label="Studio Settings"
              className="btn-press flex h-10 w-10 items-center justify-center rounded-full"
              style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
            >
              <Settings size={16} />
            </button>
            <button
              onClick={() => {
                setProfileDraft(profile);
                setSettingsOpen(true);
              }}
              className="btn-press flex h-10 w-10 items-center justify-center overflow-hidden rounded-full font-semibold text-xs text-white"
              style={{ background: "var(--obsidian)" }}
            >
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                initialsFor(profile.name)
              )}
            </button>
          </div>
        </header>

        {/* 2. TITLE + INSTANT PASTE-TO-CONTACT BAR */}
        <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.025em]">
              Outreach Overview
            </h1>
            <p className="mt-0.5 text-sm" style={{ color: "var(--muted)" }}>
              Every creative conversation, held with care and clear follow-up cadence.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handlePasteAdd();
            }}
            className="flex w-full max-w-[540px] items-center gap-2 rounded-full p-1.5 pl-4"
            style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
          >
            <input
              ref={pasteInputRef}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste @handle, URL, or @handle — why them (N)…"
              className="h-9 flex-1 bg-transparent text-sm"
            />
            <button
              type="submit"
              disabled={!pasteText.trim()}
              className="btn-press h-9 shrink-0 rounded-full px-4 text-xs font-semibold text-white"
              style={{ background: "var(--obsidian)" }}
            >
              + Add to Queue
            </button>
          </form>
        </div>

        {/* 3. TOP 3-CARD BENTO STRIP (Raxon KPI + Segmented Bar + Warm Gradient Focal Card) */}
        {navTab !== "templates" && (
          <section
            aria-label="Outreach Metrics"
            className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3"
          >
            {/* Bento Card 1: Follow-ups Due */}
            <div className="bento-card flex flex-col justify-between p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-full"
                    style={{ background: "var(--tint)" }}
                  >
                    <Clock size={15} />
                  </span>
                  <span className="text-sm font-medium">Follow-ups Due</span>
                </div>
                <span
                  className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                  style={{
                    background: counts.needsFollowUp > 0 ? "rgba(240, 78, 35, 0.12)" : "var(--tint)",
                    color: counts.needsFollowUp > 0 ? "var(--brand)" : "var(--muted)",
                  }}
                >
                  {counts.needsFollowUp > 0 ? "Action needed" : "Caught up"}
                </span>
              </div>

              <div className="my-4 flex items-baseline gap-3">
                <span className="tabular-nums text-[34px] font-semibold leading-none tracking-[-0.03em]">
                  {counts.needsFollowUp}
                </span>
                <span className="text-xs font-medium" style={{ color: "var(--muted)" }}>
                  {counts.toReach} new leads waiting in To-Reach
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setFilter("needs-follow-up")}
                  className="btn-press inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-xs font-semibold text-white"
                  style={{ background: "var(--obsidian)" }}
                >
                  Review Due
                </button>
                <button
                  onClick={openAdd}
                  className="btn-press inline-flex h-9 items-center gap-1.5 rounded-full border px-4 text-xs font-medium"
                  style={{ borderColor: "var(--divider)" }}
                >
                  <Plus size={13} /> Detailed Add
                </button>
              </div>
            </div>

            {/* Bento Card 2: Pipeline Breakdown (Segmented Bar modeled on Raxon Net Profit) */}
            <div className="bento-card flex flex-col justify-between p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-full"
                    style={{ background: "var(--tint)" }}
                  >
                    <Users size={15} />
                  </span>
                  <span className="text-sm font-medium">Total Pipeline</span>
                </div>
                <span
                  className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                  style={{ background: "rgba(22, 163, 74, 0.12)", color: "var(--success)" }}
                >
                  {replyRate}% reply rate
                </span>
              </div>

              <div className="my-4 flex items-baseline gap-3">
                <span className="tabular-nums text-[34px] font-semibold leading-none tracking-[-0.03em]">
                  {counts.total}
                </span>
                <span className="text-xs font-medium" style={{ color: "var(--muted)" }}>
                  {counts.replied} replied • {counts.won} won
                </span>
              </div>

              <div>
                <div className="flex h-2.5 w-full gap-1 overflow-hidden rounded-full">
                  <div
                    style={{ width: `${Math.max(8, pctToReach)}%`, background: "#9CA3AF" }}
                    className="rounded-full"
                    title={`To Reach: ${counts.toReach}`}
                  />
                  <div
                    style={{ width: `${Math.max(8, pctPitched)}%`, background: "var(--obsidian)" }}
                    className="rounded-full"
                    title={`Pitched: ${counts.pitched}`}
                  />
                  <div
                    style={{ width: `${Math.max(8, pctInConvo)}%`, background: "var(--brand)" }}
                    className="rounded-full"
                    title={`In Conversation: ${counts.inConversation}`}
                  />
                  <div
                    style={{ width: `${Math.max(8, pctWon)}%`, background: "var(--success)" }}
                    className="rounded-full"
                    title={`Won: ${counts.won}`}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px]" style={{ color: "var(--muted)" }}>
                  <span>• To Reach ({counts.toReach})</span>
                  <span>• Pitched ({counts.pitched})</span>
                  <span>• Won ({counts.won})</span>
                </div>
              </div>
            </div>

            {/* Bento Card 3: Warm Gradient Focal Card ("Do This Next" — Raxon Orange Card) */}
            <div
              className="flex flex-col justify-between rounded-[20px] p-5 text-white shadow-sm"
              style={{ background: "var(--brand-gradient)" }}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="small-caps text-white/80">Do This Next</span>
                  <h2 className="mt-1 truncate text-[20px] font-semibold leading-snug">
                    {nextBest ? nextBest.value.name : "All caught up"}
                  </h2>
                  <p className="mt-0.5 line-clamp-1 text-xs text-white/85">
                    {nextBest
                      ? nextBest.value.whyThem ||
                        nextBest.value.nextStep ||
                        `${stageLabel(nextBest.value.stage)} • ${nextBest.value.channel || "Outreach"}`
                      : "Paste a new handle above to start your next thread."}
                  </p>
                </div>

                {nextBest && (
                  <button
                    onClick={() => selectContact(nextBest.id)}
                    className="btn-press inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-3.5 py-2 text-xs font-semibold text-[#141413] shadow-sm"
                  >
                    Open <ArrowUpRight size={13} />
                  </button>
                )}
              </div>

              <div className="mt-4 grid grid-cols-3 border-t border-white/20 pt-3">
                <div>
                  <span className="block text-[11px] text-white/75">To Reach</span>
                  <span className="tabular-nums text-base font-semibold">{counts.toReach}</span>
                </div>
                <div className="border-l border-white/20 pl-3">
                  <span className="block text-[11px] text-white/75">In Convo</span>
                  <span className="tabular-nums text-base font-semibold">
                    {counts.inConversation}
                  </span>
                </div>
                <div className="border-l border-white/20 pl-3">
                  <span className="block text-[11px] text-white/75">Won</span>
                  <span className="tabular-nums text-base font-semibold">{counts.won}</span>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 4. MAIN WORKSPACE: TEMPLATES STUDIO OR SPLIT BENTO TABLE + OBSIDIAN DESK */}
        {navTab === "templates" ? (
          <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Left: Studio Pitch Card */}
            <div className="bento-card p-6 space-y-4">
              <p className="small-caps" style={{ color: "var(--brand)" }}>
                Your Pitch Identity
              </p>
              <h2 className="text-xl font-semibold">How you show up</h2>
              <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                These details stay ready alongside your outreach templates so every message feels
                grounded and personal.
              </p>
              <div>
                <label className="small-caps block" style={{ color: "var(--muted)" }}>
                  What I do
                </label>
                <input
                  value={profile.whatIDo || ""}
                  onChange={(e) => {
                    const next = { ...profile, whatIDo: e.target.value };
                    setProfile(next);
                    saveSettings(themeMode, selectedId, templates, next);
                  }}
                  placeholder="Visual designer — branding, editorial, social"
                  className="mt-1.5 h-11 w-full rounded-[12px] border px-3.5 text-sm"
                  style={{ borderColor: "var(--divider)", background: "var(--input)" }}
                />
              </div>
              <div>
                <label className="small-caps block" style={{ color: "var(--muted)" }}>
                  Open for
                </label>
                <input
                  value={profile.openFor || ""}
                  onChange={(e) => {
                    const next = { ...profile, openFor: e.target.value };
                    setProfile(next);
                    saveSettings(themeMode, selectedId, templates, next);
                  }}
                  placeholder="Branding for studios, editorial collabs…"
                  className="mt-1.5 h-11 w-full rounded-[12px] border px-3.5 text-sm"
                  style={{ borderColor: "var(--divider)", background: "var(--input)" }}
                />
              </div>
              <div>
                <label className="small-caps block" style={{ color: "var(--muted)" }}>
                  Featured portfolio link
                </label>
                <input
                  value={profile.featuredLink || ""}
                  onChange={(e) => {
                    const next = { ...profile, featuredLink: e.target.value };
                    setProfile(next);
                    saveSettings(themeMode, selectedId, templates, next);
                  }}
                  placeholder="https://your-portfolio.com"
                  className="mt-1.5 h-11 w-full rounded-[12px] border px-3.5 text-sm"
                  style={{ borderColor: "var(--divider)", background: "var(--input)" }}
                />
              </div>
            </div>

            {/* Right 2 Cols: Editable Pitch Templates */}
            <div className="bento-card p-6 lg:col-span-2 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Pitch Templates</h2>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    Use <b>[Name]</b> and <b>[detail]</b> — Reach auto-fills them from each
                    contact&apos;s dossier.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setTemplates(DEFAULT_TEMPLATES);
                    saveSettings(themeMode, selectedId, DEFAULT_TEMPLATES, profile);
                    showToast("Templates reset");
                  }}
                  className="rounded-full border px-3.5 py-1.5 text-xs font-medium"
                  style={{ borderColor: "var(--divider)" }}
                >
                  Reset defaults
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {templates.map((tpl, idx) => (
                  <div
                    key={tpl.id}
                    className="flex flex-col rounded-[16px] border p-4"
                    style={{ borderColor: "var(--divider)", background: "var(--surface-2)" }}
                  >
                    <span className="small-caps" style={{ color: "var(--brand)" }}>
                      {tpl.title}
                    </span>
                    <textarea
                      rows={9}
                      value={tpl.text}
                      onChange={(e) => {
                        const next = templates.map((item, i) =>
                          i === idx ? { ...item, text: e.target.value } : item
                        );
                        setTemplates(next);
                        saveSettings(themeMode, selectedId, next, profile);
                      }}
                      className="mt-2.5 w-full flex-1 resize-y bg-transparent text-xs leading-relaxed outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : (
          <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-start">
            {/* LEFT: WHITE BENTO CONTACT LIST CARD */}
            <section
              aria-label="Contact List"
              className="bento-card min-w-0 flex-1 overflow-hidden p-5"
            >
              {/* Search & Pill Filter Bar */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative flex-1 max-w-[360px]">
                  <Search
                    size={15}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2"
                    style={{ color: "var(--muted)" }}
                  />
                  <input
                    ref={searchRef}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name, notes, or link… (/)"
                    className="h-10 w-full rounded-full border pl-9 pr-8 text-sm"
                    style={{ borderColor: "var(--divider)", background: "var(--input)" }}
                  />
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                <div className="flex gap-1 overflow-x-auto no-scrollbar">
                  {(
                    [
                      { v: "all", label: "All" },
                      { v: "to-reach", label: "To reach" },
                      { v: "needs-follow-up", label: "Due" },
                      { v: "replied", label: "Replied" },
                      { v: "followed", label: "Followed up" },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.v}
                      onClick={() => setFilter(f.v)}
                      className="btn-press h-9 shrink-0 rounded-full px-3.5 text-xs font-medium"
                      style={
                        filter === f.v
                          ? { background: "var(--obsidian)", color: "#FFFFFF" }
                          : { background: "var(--tint)", color: "var(--muted)" }
                      }
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {loadError && (
                <div
                  className="mt-4 flex items-center justify-between rounded-[14px] border p-3 text-xs"
                  style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
                >
                  <span className="flex items-center gap-2">
                    <AlertTriangle size={14} /> {loadError}
                  </span>
                  <button onClick={loadAll} className="font-semibold underline">
                    Retry
                  </button>
                </div>
              )}

              {/* Rows */}
              <div className="mt-4 divide-y" style={{ borderColor: "var(--divider)" }}>
                {loading ? (
                  <div className="space-y-3 py-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex h-14 items-center justify-between px-3">
                        <div className="skeleton h-4 w-[180px]" />
                        <div className="skeleton h-4 w-[120px]" />
                      </div>
                    ))}
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="py-16 text-center">
                    <p className="text-lg font-semibold">No contacts in this view</p>
                    <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                      Paste an @handle or portfolio link in the bar above to add your next lead.
                    </p>
                    {(search || filter !== "all") && (
                      <button
                        onClick={() => {
                          setSearch("");
                          setFilter("all");
                        }}
                        className="mt-4 rounded-full border px-4 py-2 text-xs font-medium"
                        style={{ borderColor: "var(--divider)" }}
                      >
                        Reset filters
                      </button>
                    )}
                  </div>
                ) : (
                  filtered.map((c) => {
                    const isSel = c.id === selectedId;
                    const stage =
                      c.value.stage || stageFromLegacy(c.value.replied, c.value.followedUp);
                    const due = isFollowUpDue(c.value, todayISO());
                    const norm = displayLink(c);

                    return (
                      <div
                        key={c.id}
                        onClick={() => selectContact(c.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            selectContact(c.id);
                          }
                        }}
                        className="group relative flex min-h-[64px] cursor-pointer items-center justify-between gap-4 rounded-[14px] px-3.5 py-3 transition-colors"
                        style={{
                          background: isSel ? "var(--tint)" : "transparent",
                        }}
                      >
                        {isSel && (
                          <span
                            className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full"
                            style={{ background: "var(--brand)" }}
                          />
                        )}

                        {/* Col 1: Identity */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-[15px] font-semibold">
                              {c.value.name}
                            </span>
                            <span
                              className="shrink-0 text-xs"
                              style={{ color: "var(--muted)" }}
                            >
                              {c.value.channel || "—"}
                            </span>
                          </div>
                          <p
                            className="mt-0.5 truncate text-xs"
                            style={{ color: "var(--muted)" }}
                          >
                            {c.value.whyThem ||
                              c.value.nextStep ||
                              c.value.contactDetails ||
                              "Click to add context…"}
                          </p>
                        </div>

                        {/* Col 2: Stage / Due Pill + Hover Actions */}
                        <div className="flex shrink-0 items-center gap-2.5">
                          <span
                            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold"
                            style={
                              due
                                ? {
                                    background: "rgba(240, 78, 35, 0.12)",
                                    color: "var(--brand)",
                                  }
                                : stage === "won"
                                ? {
                                    background: "rgba(22, 163, 74, 0.12)",
                                    color: "var(--success)",
                                  }
                                : {
                                    background: "var(--pill-track)",
                                    color: "var(--text)",
                                  }
                            }
                          >
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{
                                background: due
                                  ? "var(--brand)"
                                  : STAGES.find((s) => s.value === stage)?.dot,
                              }}
                            />
                            {due ? "Follow-up due" : stageLabel(stage)}
                          </span>

                          <div
                            className="hidden sm:flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {norm && (
                              <a
                                href={norm}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex h-8 w-8 items-center justify-center rounded-full"
                                style={{ background: "var(--surface)" }}
                                title="Open link"
                              >
                                <ExternalLink size={13} />
                              </a>
                            )}
                            <button
                              onClick={() => triggerArchive(c)}
                              className="flex h-8 w-8 items-center justify-center rounded-full"
                              style={{ background: "var(--surface)" }}
                              title="Archive"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            {/* RIGHT: DARK OBSIDIAN FOCAL CARD (Desktop Sticky) */}
            {isDesktop && (
              <aside
                aria-label="Obsidian Dossier Desk"
                className="obsidian-card sticky top-6 flex w-[420px] shrink-0 flex-col p-6"
                style={{ maxHeight: "calc(100vh - 48px)" }}
              >
                {obsidianDeskContent}
              </aside>
            )}
          </div>
        )}
      </div>

      {/* MOBILE / TABLET SLIDE-OVER OBSIDIAN SHEET */}
      {!isDesktop && panelOpen && selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <button
            aria-label="Close"
            onClick={() => selectContact(null)}
            className="absolute inset-0 bg-black/45"
          />
          <div className="obsidian-card relative z-10 flex max-h-[90vh] w-full max-w-[480px] flex-col p-6">
            {obsidianDeskContent}
          </div>
        </div>
      )}

      {/* FULL ADD / EDIT MODAL */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <button
            aria-label="Close"
            onClick={() => !busy && setModal(null)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="bento-card relative z-10 flex max-h-[88vh] w-full max-w-[560px] flex-col overflow-hidden p-6">
            <div className="flex items-center justify-between pb-4 border-b" style={{ borderColor: "var(--divider)" }}>
              <h2 className="text-lg font-semibold">
                {modal.mode === "add" ? "Add Contact" : `Edit ${modal.contact.value.name}`}
              </h2>
              <button onClick={() => setModal(null)} className="rounded-full p-1.5">
                <X size={18} />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitForm();
              }}
              className="thin-scroll mt-4 space-y-3 overflow-y-auto pr-1"
            >
              <div>
                <label className="small-caps block" style={{ color: "var(--muted)" }}>Name *</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mt-1.5 h-11 w-full rounded-[12px] border px-3.5 text-sm"
                  style={{ borderColor: "var(--divider)", background: "var(--input)" }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="small-caps block" style={{ color: "var(--muted)" }}>Channel</label>
                  <input
                    value={form.channel}
                    onChange={(e) => setForm({ ...form, channel: e.target.value })}
                    placeholder="Instagram, Email…"
                    className="mt-1.5 h-11 w-full rounded-[12px] border px-3.5 text-sm"
                    style={{ borderColor: "var(--divider)", background: "var(--input)" }}
                  />
                </div>
                <div>
                  <label className="small-caps block" style={{ color: "var(--muted)" }}>Work Type</label>
                  <select
                    value={form.workType}
                    onChange={(e) => setForm({ ...form, workType: e.target.value as WorkType })}
                    className="mt-1.5 h-11 w-full rounded-[12px] border px-3.5 text-sm"
                    style={{ borderColor: "var(--divider)", background: "var(--input)" }}
                  >
                    {WORK_TYPES.map((w) => (
                      <option key={w.value} value={w.value}>{w.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="small-caps block" style={{ color: "var(--muted)" }}>Handle / Email</label>
                  <input
                    value={form.contactDetails}
                    onChange={(e) => setForm({ ...form, contactDetails: e.target.value })}
                    className="mt-1.5 h-11 w-full rounded-[12px] border px-3.5 text-sm"
                    style={{ borderColor: "var(--divider)", background: "var(--input)" }}
                  />
                </div>
                <div>
                  <label className="small-caps block" style={{ color: "var(--muted)" }}>Follow-up Date</label>
                  <input
                    type="date"
                    value={form.followUpDate}
                    onChange={(e) => setForm({ ...form, followUpDate: e.target.value })}
                    className="mt-1.5 h-11 w-full rounded-[12px] border px-3.5 text-sm"
                    style={{ borderColor: "var(--divider)", background: "var(--input)" }}
                  />
                </div>
              </div>
              <div>
                <label className="small-caps block" style={{ color: "var(--muted)" }}>Link</label>
                <input
                  value={form.link}
                  onChange={(e) => setForm({ ...form, link: e.target.value })}
                  placeholder="https://…"
                  className="mt-1.5 h-11 w-full rounded-[12px] border px-3.5 text-sm"
                  style={{ borderColor: "var(--divider)", background: "var(--input)" }}
                />
              </div>
              <div>
                <label className="small-caps block" style={{ color: "var(--muted)" }}>Why them</label>
                <input
                  value={form.whyThem}
                  onChange={(e) => setForm({ ...form, whyThem: e.target.value })}
                  className="mt-1.5 h-11 w-full rounded-[12px] border px-3.5 text-sm"
                  style={{ borderColor: "var(--divider)", background: "var(--input)" }}
                />
              </div>
              <div>
                <label className="small-caps block" style={{ color: "var(--muted)" }}>Notes</label>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="mt-1.5 w-full rounded-[12px] border p-3 text-sm"
                  style={{ borderColor: "var(--divider)", background: "var(--input)" }}
                />
              </div>
              {formError && <p className="text-xs font-medium" style={{ color: "var(--danger)" }}>{formError}</p>}
              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="h-11 flex-1 rounded-full border text-sm font-medium"
                  style={{ borderColor: "var(--divider)" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="h-11 flex-1 rounded-full text-sm font-semibold text-white"
                  style={{ background: "var(--obsidian)" }}
                >
                  {busy ? "Saving…" : "Save Contact"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SETTINGS MODAL */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <button
            aria-label="Close"
            onClick={() => setSettingsOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="bento-card relative z-10 w-full max-w-[460px] p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Studio Settings</h2>
              <button onClick={() => setSettingsOpen(false)}>
                <X size={18} />
              </button>
            </div>

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
                onClick={() => avatarInputRef.current?.click()}
                className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full text-white font-semibold"
                style={{ background: "var(--obsidian)" }}
              >
                {profileDraft.avatarUrl ? (
                  <img src={profileDraft.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Camera size={18} />
                )}
              </button>
              <div className="flex-1">
                <input
                  value={profileDraft.name}
                  onChange={(e) => setProfileDraft({ ...profileDraft, name: e.target.value })}
                  placeholder="Your name or studio"
                  className="h-10 w-full rounded-[12px] border px-3 text-sm"
                  style={{ borderColor: "var(--divider)" }}
                />
                <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                  {user?.email}
                </p>
              </div>
            </div>

            <div>
              <label className="small-caps block" style={{ color: "var(--muted)" }}>Appearance</label>
              <div className="mt-2 flex rounded-full p-1" style={{ background: "var(--pill-track)" }}>
                {(["system", "light", "dark"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => changeTheme(m)}
                    className="h-8 flex-1 rounded-full text-xs font-medium capitalize"
                    style={
                      themeMode === m
                        ? { background: "var(--obsidian)", color: "#FFFFFF" }
                        : { color: "var(--muted)" }
                    }
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={saveProfile}
                className="h-10 flex-1 rounded-full text-xs font-semibold text-white"
                style={{ background: "var(--obsidian)" }}
              >
                Save Profile
              </button>
              <button
                onClick={async () => {
                  setSettingsOpen(false);
                  await supabase.auth.signOut();
                  setContacts([]);
                  setSelectedId(null);
                }}
                className="h-10 rounded-full border px-4 text-xs font-medium"
                style={{ borderColor: "var(--divider)" }}
              >
                Sign Out
              </button>
            </div>

            <div className="pt-2 border-t text-center" style={{ borderColor: "var(--divider)" }}>
              {!showDeleteAll ? (
                <button
                  onClick={() => setShowDeleteAll(true)}
                  className="text-xs font-medium underline"
                  style={{ color: "var(--danger)" }}
                >
                  Delete all account data…
                </button>
              ) : (
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => setShowDeleteAll(false)}
                    className="text-xs underline"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={deleteAllBusy}
                    onClick={async () => {
                      setDeleteAllBusy(true);
                      await supabase.from("outreach_contacts").delete().eq("user_id", user.id);
                      await supabase.from("outreach_settings").delete().eq("user_id", user.id);
                      setContacts([]);
                      setSelectedId(null);
                      setShowDeleteAll(false);
                      setSettingsOpen(false);
                      setDeleteAllBusy(false);
                      showToast("All data deleted");
                    }}
                    className="rounded-full px-3 py-1 text-xs font-semibold text-white"
                    style={{ background: "var(--danger)" }}
                  >
                    {deleteAllBusy ? "Deleting…" : "Confirm Permanent Delete"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* WIN LOOP MODAL */}
      {winModal && winContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <button
            aria-label="Close"
            onClick={() => setWinModal(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="bento-card relative z-10 w-full max-w-[460px] p-6 space-y-4">
            <h2 className="text-xl font-semibold">Win: {winContact.value.name}</h2>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Capture what worked and queue a warm referral while momentum is high.
            </p>
            <textarea
              rows={3}
              value={winNote}
              onChange={(e) => setWinNote(e.target.value)}
              placeholder="What resonated with them?"
              className="w-full rounded-[12px] border p-3 text-sm"
              style={{ borderColor: "var(--divider)" }}
            />
            <input
              value={winReferral}
              onChange={(e) => setWinReferral(e.target.value)}
              placeholder="Referral @handle or studio name (optional)"
              className="h-11 w-full rounded-[12px] border px-3.5 text-sm"
              style={{ borderColor: "var(--divider)" }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => setWinModal(false)}
                className="h-10 flex-1 rounded-full border text-xs font-medium"
                style={{ borderColor: "var(--divider)" }}
              >
                Skip
              </button>
              <button
                onClick={saveWinLoop}
                className="h-10 flex-1 rounded-full text-xs font-semibold text-white"
                style={{ background: "var(--brand)" }}
              >
                Save Win &amp; Queue Referral
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5-SECOND UNDO TOAST */}
      {pendingDelete && (
        <div
          role="status"
          className="toast-in fixed bottom-5 left-1/2 z-[60] flex items-center gap-3 rounded-full px-4 py-2.5 text-xs font-medium text-white shadow-lg"
          style={{ background: "var(--obsidian)" }}
        >
          <span>Archived {pendingDelete.contact.value.name}</span>
          <button
            onClick={undoDelete}
            className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-[#141413]"
          >
            Undo (Z)
          </button>
        </div>
      )}

      {toast && !pendingDelete && (
        <div
          role="status"
          className="toast-in fixed bottom-5 left-1/2 z-[60] flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-medium text-white shadow-lg"
          style={{ background: "var(--obsidian)" }}
        >
          <Check size={14} style={{ color: "#FF7038" }} /> {toast}
        </div>
      )}
    </div>
  );
}