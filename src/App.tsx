import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase, isSupabaseConfigured } from "./supabaseClient";
import {
  Search,
  Plus,
  Download,
  Pencil,
  Trash2,
  X,
  Minus,
  ExternalLink,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  GripVertical,
  AlertTriangle,
  Sun,
  Moon,
  Monitor,
  Home,
  Camera,
  Users,
  AtSign,
  LayoutGrid,
  Sparkles,
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
  { value: "to-reach", label: "To reach", dot: "#6B6660" },
  { value: "pitched", label: "Pitched", dot: "#E6A800" },
  { value: "in-conversation", label: "In conversation", dot: "#1A9A4A" },
  { value: "follow-up", label: "Follow-up due", dot: "#DB200D" },
  { value: "won", label: "Won", dot: "#0D0D0C" },
  { value: "paused", label: "Paused", dot: "#A8A29E" },
  { value: "archived", label: "Archived", dot: "#A8A29E" },
];

const WORK_TYPES: { value: WorkType; label: string }[] = [
  { value: "", label: "Not set" },
  { value: "branding", label: "Branding" },
  { value: "editorial", label: "Editorial" },
  { value: "social", label: "Social" },
  { value: "collaboration", label: "Collaboration" },
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

function safeHref(raw: string): string {
  const v = (raw || "").trim();
  if (!v) return "";
  if (v.toLowerCase().startsWith("javascript:") || v.toLowerCase().startsWith("data:")) return "";
  if (/^https?:\/\//i.test(v)) return v;
  if (/^mailto:/i.test(v)) return v;
  if (isEmailValue(v)) return `mailto:${v}`;
  if (v.includes(".") && !v.includes(" ")) return `https://${v.replace(/^@+/, "")}`;
  return "";
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
    const kind0 = channelKind(channel);
    if (kind0 === "whatsapp") {
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

// Upgraded Paste-to-Contact parser: also extracts trailing "whyThem" context if pasted together
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

  // URL match
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
  // Name — whyThem split
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

function socialPlaceholder(platform: string): string {
  if (platform === "LinkedIn") return "https://linkedin.com/in/your-name";
  if (platform === "Website / Portfolio") return "https://your-portfolio.com";
  return "@artbymemik";
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

function socialDisplay(platform: string, rawValue: string): string {
  const href = socialHref(platform, rawValue);
  if (!href) return (rawValue || "").trim();
  if (href.startsWith("mailto:")) return href.slice(7);
  try {
    const u = new URL(href);
    return `${u.hostname}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return href;
  }
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
  {
    group: "Global",
    items: [
      { action: "focusSearch", label: "Focus search" },
      { action: "newContact", label: "New contact / Focus notes when DETAILS open" },
      { action: "cycleTheme", label: "Cycle theme" },
      { action: "export", label: "Export CSV" },
      { action: "openSettings", label: "Settings / Shortcuts" },
    ],
  },
  {
    group: "List + Filters",
    items: [
      { action: "next", label: "Next contact" },
      { action: "prev", label: "Previous contact" },
      { action: "openSelected", label: "Open selected" },
      { action: "filterAll", label: "Filter: All" },
      { action: "filterToReach", label: "Filter: To reach" },
      { action: "filterReplied", label: "Filter: Replied" },
      { action: "filterFollowed", label: "Filter: Followed up" },
    ],
  },
  {
    group: "Details",
    items: [
      { action: "edit", label: "Open full edit modal" },
      { action: "toggleReplied", label: "Toggle Replied" },
      { action: "toggleFollowed", label: "Toggle Followed up" },
      { action: "openLink", label: "Open link" },
      { action: "copy", label: "Copy contact details" },
      { action: "minimize", label: "Minimize / Expand panel" },
      { action: "back", label: "Back to previous contact" },
      { action: "delete", label: "Archive contact (with 5s Undo)" },
      { action: "close", label: "Close panel" },
      { action: "saveForm", label: "Save in form" },
    ],
  },
];

function canonicalFromEvent(e: KeyboardEvent | React.KeyboardEvent): string | null {
  const k = e.key;
  if (k === "Control" || k === "Meta" || k === "Alt" || k === "Shift") return null;
  const keyPart = k === " " ? "Space" : k.length === 1 ? k.toLowerCase() : k;
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
  if (key === "Delete") keyLabel = "Del";
  else if (key === "Escape") keyLabel = "Esc";
  else if (key.length === 1) keyLabel = key.toUpperCase();
  const modLabel = mods.map((m) => (m === "mod" ? "Ctrl/Cmd" : m === "alt" ? "Alt" : m)).join(" + ");
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
  if (keyPart === "Space") return e.key === " ";
  if (keyPart.length === 1) {
    if (keyPart === "?" || keyPart === "/") return e.key === keyPart;
    return e.key.toLowerCase() === keyPart;
  }
  return e.key === keyPart;
}

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
    title: "Thank you / after collab",
    workType: "collaboration",
    portfolioLink: "",
    text: "Hi [Name],\n\nThank you for the conversation — I really enjoyed [detail] and working through it with you.\n\nIf anything comes up down the line, I'm happy to help. Let's stay in touch.\n\nWarmly",
  },
];

type ModalState = { mode: "add" } | { mode: "edit"; contact: Contact } | null;

async function api(action: string, args: Record<string, unknown>) {
  if (!isSupabaseConfigured)
    throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel.");
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
      const records = (data || []).map((r: any) => ({ id: r.id, value: r.value as ContactValue }));
      return { records, next_cursor: undefined };
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
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
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
function looksLikeUrl(v: string) {
  if (!v.trim()) return true;
  try {
    const u = new URL(normalizeLink(v, "", ""));
    return !!u.hostname && u.hostname.includes(".");
  } catch {
    return false;
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
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>("first-outreach");
  const [templateDraft, setTemplateDraft] = useState("");
  const [activeFocus, setActiveFocus] = useState<string | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [pendingClearScratchpad, setPendingClearScratchpad] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [panelWidth, setPanelWidth] = useState(420);
  const [sheetPct, setSheetPct] = useState(88);
  const [modal, setModal] = useState<ModalState>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Paste-to-Contact, Today's 3, Win Loop, Instant Undo Delete
  const [pasteText, setPasteText] = useState("");
  const [winModal, setWinModal] = useState(false);
  const [winContact, setWinContact] = useState<Contact | null>(null);
  const [winNote, setWinNote] = useState("");
  const [winReferral, setWinReferral] = useState("");
  const [pendingDelete, setPendingDelete] = useState<{ contact: Contact; timer: number } | null>(null);
  const [todayDone, setTodayDone] = useState<string[]>([]);
  const [streak, setStreak] = useState(0);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [notesSavedAt, setNotesSavedAt] = useState<string | null>(null);
  const [notesSaving, setNotesSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [prevContact, setPrevContact] = useState<{ id: string; name: string } | null>(null);
  const [backStack, setBackStack] = useState<{ id: string; name: string }[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"profile" | "shortcuts" | "account">("profile");
  const [profile, setProfile] = useState<ProfileValue>(DEFAULT_PROFILE);
  const [profileDraft, setProfileDraft] = useState<ProfileValue>(DEFAULT_PROFILE);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [shortcuts, setShortcuts] = useState<ShortcutMap>({ ...DEFAULT_SHORTCUTS });
  const [capturing, setCapturing] = useState<ShortcutAction | null>(null);

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
  const [authShowPassword, setAuthShowPassword] = useState(false);
  const [authShowConfirm, setAuthShowConfirm] = useState(false);
  const [authAgree, setAuthAgree] = useState(false);
  const [authForgotMode, setAuthForgotMode] = useState(false);
  const [authForgotSent, setAuthForgotSent] = useState(false);
  const [authNeedsConfirm, setAuthNeedsConfirm] = useState(false);
  const [authRecoveryMode, setAuthRecoveryMode] = useState(false);
  const [authNewPassword, setAuthNewPassword] = useState("");
  const [authNewConfirm, setAuthNewConfirm] = useState("");
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [deleteAllBusy, setDeleteAllBusy] = useState(false);

  const isMobile = useMedia("(max-width: 767px)");
  const isTablet = useMedia("(min-width: 768px) and (max-width: 1023px)");
  const isDesktop = useMedia("(min-width: 1024px)");
  const notesTimer = useRef<number | null>(null);
  const inlineSaveTimer = useRef<number | null>(null);
  const scratchpadTimer = useRef<number | null>(null);
  const scratchpadRef = useRef("");
  const templatesRef = useRef<TemplateItem[]>(DEFAULT_TEMPLATES);
  const profileRef = useRef<ProfileValue>(DEFAULT_PROFILE);
  const shortcutsRef = useRef<ShortcutMap>({ ...DEFAULT_SHORTCUTS });
  const searchRef = useRef<HTMLInputElement | null>(null);
  const pasteInputRef = useRef<HTMLInputElement | null>(null);

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

  const friendlyAuthError = (msg: string) => {
    const m = (msg || "").toLowerCase();
    if (m.includes("invalid login credentials") || m.includes("invalid email or password"))
      return "Incorrect email or password. Try again, or use Forgot password.";
    if (m.includes("user already registered") || m.includes("already registered"))
      return "This email already has an account. Switch to Sign in.";
    if (m.includes("password should be at least")) return "Password must be at least 8 characters.";
    if (m.includes("email link is invalid") || m.includes("expired"))
      return "That link expired or was already used. Request a new one.";
    if (m.includes("email not confirmed"))
      return "Check your inbox to confirm your email first, then sign in.";
    return msg;
  };

  const passwordScore = (pw: string) => {
    let s = 0;
    if (pw.length >= 8) s++;
    if (pw.length >= 12) s++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
    if (/\d/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw)) s++;
    return s;
  };
  const passwordLabel = (pw: string) => {
    if (!pw) return "";
    const s = passwordScore(pw);
    if (s <= 1) return "Weak";
    if (s <= 3) return "Medium";
    return "Strong";
  };

  const handleSendMagicLink = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!authEmail.trim() || !authEmail.includes("@")) {
      setAuthError("Please enter a valid email.");
      return;
    }
    setAuthBusy(true);
    setAuthError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: authEmail.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setAuthBusy(false);
    if (error) {
      setAuthError(friendlyAuthError(error.message));
      return;
    }
    setAuthSent(true);
  };

  const handleOAuth = async (provider: "google" | "github" | "apple") => {
    setAuthBusy(true);
    setAuthError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin,
        queryParams: provider === "google" ? { access_type: "offline", prompt: "consent" } : undefined,
      },
    });
    if (error) {
      setAuthError(friendlyAuthError(error.message));
      setAuthBusy(false);
    }
  };

  const handleSignUpPassword = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!authName.trim()) {
      setAuthError("Please enter your name.");
      return;
    }
    if (!authEmail.trim() || !authEmail.includes("@")) {
      setAuthError("Please enter a valid email.");
      return;
    }
    if (authPassword.length < 8) {
      setAuthError("Password must be at least 8 characters.");
      return;
    }
    if (authPassword !== authConfirmPassword) {
      setAuthError("Passwords do not match.");
      return;
    }
    if (!authAgree) {
      setAuthError("Please accept the terms to create your account.");
      return;
    }
    setAuthBusy(true);
    setAuthError(null);
    const { data, error } = await supabase.auth.signUp({
      email: authEmail.trim(),
      password: authPassword,
      options: { data: { full_name: authName.trim() }, emailRedirectTo: window.location.origin },
    });
    setAuthBusy(false);
    if (error) {
      setAuthError(friendlyAuthError(error.message));
      return;
    }
    if (data.user && !data.session) {
      setAuthNeedsConfirm(true);
      return;
    }
    setAuthNeedsConfirm(false);
  };

  const handleSignInPassword = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!authEmail.trim() || !authEmail.includes("@")) {
      setAuthError("Please enter a valid email.");
      return;
    }
    if (!authPassword) {
      setAuthError("Please enter your password.");
      return;
    }
    setAuthBusy(true);
    setAuthError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: authEmail.trim(),
      password: authPassword,
    });
    setAuthBusy(false);
    if (error) {
      setAuthError(friendlyAuthError(error.message));
      return;
    }
  };

  const handleForgotPassword = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!authEmail.trim() || !authEmail.includes("@")) {
      setAuthError("Please enter a valid email to reset your password.");
      return;
    }
    setAuthBusy(true);
    setAuthError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(authEmail.trim(), {
      redirectTo: window.location.origin,
    });
    setAuthBusy(false);
    if (error) {
      setAuthError(friendlyAuthError(error.message));
      return;
    }
    setAuthForgotSent(true);
  };

  const handleUpdatePasswordRecovery = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (authNewPassword.length < 8) {
      setAuthError("Password must be at least 8 characters.");
      return;
    }
    if (authNewPassword !== authNewConfirm) {
      setAuthError("Passwords do not match.");
      return;
    }
    setAuthBusy(true);
    setAuthError(null);
    const { error } = await supabase.auth.updateUser({ password: authNewPassword });
    setAuthBusy(false);
    if (error) {
      setAuthError(friendlyAuthError(error.message));
      return;
    }
    setAuthRecoveryMode(false);
    setAuthNewPassword("");
    setAuthNewConfirm("");
    showToast("Password updated");
  };

  const handleResendConfirm = async () => {
    if (!authEmail.trim()) return;
    setAuthBusy(true);
    setAuthError(null);
    const { error } = await supabase.auth.resend({ type: "signup", email: authEmail.trim() });
    setAuthBusy(false);
    if (error) setAuthError(friendlyAuthError(error.message));
    else setAuthError(null);
  };

  const handleSignOut = async () => {
    setSettingsOpen(false);
    await supabase.auth.signOut();
    setContacts([]);
    setSelectedId(null);
    setPanelOpen(false);
  };

  const handleDeleteAllMyData = async () => {
    if (!user) return;
    setDeleteAllBusy(true);
    try {
      const { error: cErr } = await supabase.from("outreach_contacts").delete().eq("user_id", user.id);
      if (cErr) throw cErr;
      const { error: sErr } = await supabase.from("outreach_settings").delete().eq("user_id", user.id);
      if (sErr) throw sErr;
      setContacts([]);
      setSelectedId(null);
      setPanelOpen(false);
      setScratchpad("");
      setTemplates(DEFAULT_TEMPLATES);
      setProfile(DEFAULT_PROFILE);
      setShowDeleteAll(false);
      showToast("All your data was deleted");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not delete data");
    } finally {
      setDeleteAllBusy(false);
    }
  };

  const reloadContacts = useCallback(async () => {
    const data = (await api("records.list", { collection: "outreach-contacts", limit: 1000 })) as {
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
        const s = (await api("records.list", { collection: "outreach-settings", limit: 10 })) as {
          records: {
            id: string;
            value: {
              themeMode?: ThemeMode;
              selectedId?: string | null;
              scratchpad?: string;
              templates?: TemplateItem[];
              profile?: ProfileValue;
              shortcuts?: Partial<ShortcutMap>;
            };
          }[];
        };
        const first = s.records?.[0];
        if (first) {
          setSettingsId(first.id);
          if (first.value.themeMode) setThemeMode(first.value.themeMode);
          if (typeof first.value.scratchpad === "string") {
            setScratchpad(first.value.scratchpad);
            scratchpadRef.current = first.value.scratchpad;
          }
          if (Array.isArray(first.value.templates) && first.value.templates.length > 0) {
            const norm = first.value.templates.map((t: any) => ({
              id: String(t.id || ""),
              title: String(t.title || ""),
              text: String(t.text || ""),
              workType: (WORK_TYPES.some((w) => w.value === t.workType) ? t.workType : "") as WorkType,
              portfolioLink: typeof t.portfolioLink === "string" ? t.portfolioLink : "",
            }));
            setTemplates(norm);
            templatesRef.current = norm;
          }
          if (first.value.profile && typeof first.value.profile === "object") {
            const metaName =
              typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "";
            const p: ProfileValue = normalizeProfileValue(first.value.profile, metaName);
            if (!p.name && metaName) p.name = metaName;
            setProfile(p);
            profileRef.current = p;
            setProfileDraft(p);
          }
          if (first.value.shortcuts && typeof first.value.shortcuts === "object") {
            const merged: ShortcutMap = { ...DEFAULT_SHORTCUTS };
            (Object.keys(DEFAULT_SHORTCUTS) as ShortcutAction[]).forEach((k) => {
              const v = (first.value.shortcuts as Partial<ShortcutMap>)[k];
              if (typeof v === "string" && v) merged[k] = v;
            });
            setShortcuts(merged);
            shortcutsRef.current = merged;
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
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const fn = () => {
      if (themeMode === "system") {
        document.documentElement.dataset.theme = mq.matches ? "dark" : "light";
      }
    };
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [resolvedTheme, themeMode]);

  const saveSettings = useCallback(
    async (nextTheme: ThemeMode, nextSelected: string | null) => {
      if (!settingsLoaded) return;
      try {
        const value = {
          themeMode: nextTheme,
          selectedId: nextSelected,
          scratchpad: scratchpadRef.current,
          templates: templatesRef.current,
          profile: profileRef.current,
          shortcuts: shortcutsRef.current,
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
    const next = order[(order.indexOf(themeMode) + 1) % order.length];
    changeTheme(next);
  };

  const selectContact = (id: string | null, opts?: { fromBack?: boolean }) => {
    if (id && selectedId && id !== selectedId && !opts?.fromBack) {
      const prev = contacts.find((c) => c.id === selectedId);
      if (prev) {
        const entry = { id: prev.id, name: prev.value.name };
        setBackStack((prevStack) => [...prevStack.slice(-1), entry]);
        setPrevContact(entry);
      }
    }
    setSelectedId(id);
    setPanelOpen(!!id);
    if (!isDesktop) setMinimized(false);
    if (id && isMobile) setSheetPct(88);
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

  // Seamless Inline Field Update in the Details Dossier (400ms debounced save)
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

  const saveNotesNow = useCallback(
    async (text: string) => {
      const id = notesFor.current;
      if (!id) return;
      const cur = contacts.find((c) => c.id === id);
      if (!cur) return;
      if (cur.value.notes === text) return;
      setNotesSaving(true);
      try {
        await persistContact(cur, { notes: text });
        setNotesSavedAt(formatTime(new Date()));
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Couldn’t save notes");
      } finally {
        setNotesSaving(false);
      }
    },
    [contacts] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const onNotesChange = (text: string) => {
    setNotesDraft(text);
    if (notesTimer.current) window.clearTimeout(notesTimer.current);
    notesTimer.current = window.setTimeout(() => {
      saveNotesNow(text);
    }, 400);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const today = todayISO();
    const list = contacts.filter((c) => {
      const stage = c.value.stage || stageFromLegacy(c.value.replied, c.value.followedUp);
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
        c.value.followUpDate,
      ].some((v) => (v || "").toLowerCase().includes(q));
    });
    return [...list].sort((a, b) => {
      if (filter === "needs-follow-up") {
        const ad = a.value.outreachDate,
          bd = b.value.outreachDate;
        if (ad && bd && ad !== bd) return ad.localeCompare(bd);
      }
      const ad = a.value.outreachDate,
        bd = b.value.outreachDate;
      if (ad && bd && ad !== bd) return bd.localeCompare(ad);
      if (ad && !bd) return -1;
      if (!ad && bd) return 1;
      return b.value.updatedAt.localeCompare(a.value.updatedAt);
    });
  }, [contacts, search, filter]);

  const counts = useMemo(() => {
    const today = todayISO();
    const followUpDue = contacts.filter((c) => isFollowUpDue(c.value, today));
    return {
      total: contacts.length,
      replied: contacts.filter((c) => c.value.replied).length,
      followed: contacts.filter((c) => c.value.followedUp).length,
      toReach: contacts.filter(
        (c) => (c.value.stage || stageFromLegacy(c.value.replied, c.value.followedUp)) === "to-reach"
      ).length,
      outreachToday: contacts.filter(
        (c) => c.value.outreachDate === today || c.value.followUpDate === today
      ).length,
      needsFollowUp: followUpDue.length,
      inConversation: contacts.filter(
        (c) =>
          (c.value.stage || stageFromLegacy(c.value.replied, c.value.followedUp)) ===
          "in-conversation"
      ).length,
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
      "featured link",
      "replied",
      "followed up",
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
      c.value.featuredLink || "",
      c.value.replied ? "Yes" : "No",
      c.value.followedUp ? "Yes" : "No",
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
    showToast(`Exported ${contacts.length} ${contacts.length === 1 ? "contact" : "contacts"}`);
  };

  const copyText = async (text: string, key: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
      showToast("Copied to clipboard");
    } catch {
      showToast("Select the text to copy it");
    }
  };

  // Context-bound pitch interpolation for the selected contact
  const activeTemplate = templates.find((t) => t.id === activeTemplateId) || templates[0] || null;
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
    showToast("Pitch copied • Stage set to Pitched (+4d follow-up)");
  };

  const toggleStatus = async (field: "replied" | "followedUp") => {
    if (!selected) return;
    try {
      const nextVal = !selected.value[field];
      const curStage =
        selected.value.stage || stageFromLegacy(selected.value.replied, selected.value.followedUp);
      let nextStage = curStage;
      if (field === "replied" && nextVal && (curStage === "to-reach" || curStage === "pitched"))
        nextStage = "in-conversation";
      if (field === "followedUp" && nextVal && curStage !== "follow-up") nextStage = "follow-up";
      await persistContact(selected, { [field]: nextVal, stage: nextStage });
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Couldn’t update status");
    }
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
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Couldn’t update stage");
    }
  };

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX,
      startW = panelWidth;
    const move = (ev: MouseEvent) =>
      setPanelWidth(Math.max(360, Math.min(540, startW + (startX - ev.clientX))));
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const startSheetDrag = (e: React.PointerEvent) => {
    const startY = e.clientY,
      startPct = sheetPct;
    const move = (ev: PointerEvent) =>
      setSheetPct(
        Math.max(32, Math.min(92, startPct + ((startY - ev.clientY) / window.innerHeight) * 100))
      );
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // ---- Form Modal ----
  const [form, setForm] = useState({
    name: "",
    channel: "",
    outreachDate: todayISO(),
    contactDetails: "",
    link: "",
    replied: false,
    followedUp: false,
    notes: "",
    stage: "to-reach" as Stage,
    whyThem: "",
    whatSent: "",
    nextStep: "",
    workType: "" as WorkType,
    followUpDate: "",
    featuredLink: "",
  });
  const previewLink = modal ? normalizeLink(form.link, form.channel, form.contactDetails) : "";
  const showPreview = previewLink.startsWith("http") || previewLink.startsWith("mailto:");

  const openAdd = (
    prefillNotes?: string,
    opts?: { clearScratchpadAfterSave?: boolean; prefill?: Partial<typeof form> }
  ) => {
    setForm({
      name: "",
      channel: "",
      outreachDate: todayISO(),
      contactDetails: "",
      link: "",
      replied: false,
      followedUp: false,
      notes: prefillNotes || "",
      stage: "to-reach",
      whyThem: "",
      whatSent: "",
      nextStep: "",
      workType: "",
      followUpDate: "",
      featuredLink: profile.featuredLink || "",
      ...(opts?.prefill || {}),
    });
    setFormError(null);
    setPendingClearScratchpad(!!opts?.clearScratchpadAfterSave);
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
      replied: v.replied,
      followedUp: v.followedUp,
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

  useEffect(() => {
    if (modal) {
      const t = setTimeout(
        () => formRef.current?.querySelector<HTMLInputElement>("input")?.focus(),
        40
      );
      return () => clearTimeout(t);
    }
  }, [modal]);

  const submitForm = async () => {
    if (!form.name.trim()) {
      setFormError("Name is required.");
      return;
    }
    const normalized = normalizeLink(form.link, form.channel, form.contactDetails);
    if (
      form.link.trim() &&
      (!normalized || (!normalized.startsWith("mailto:") && !/^https?:\/\//.test(normalized)))
    ) {
      setFormError("Link should look like a URL, for example https://example.com.");
      return;
    }
    if (normalized.startsWith("http") && !looksLikeUrl(normalized)) {
      setFormError("Link should look like a URL, for example https://example.com.");
      return;
    }
    setBusy(true);
    setFormError(null);
    const now = new Date().toISOString();
    try {
      if (modal?.mode === "edit") {
        const c = modal.contact;
        const preservedReplied =
          form.stage === "paused" || form.stage === "archived"
            ? c.value.replied
            : form.stage === "in-conversation" || form.stage === "won"
            ? true
            : c.value.replied;
        const preservedFollowed =
          form.stage === "paused" || form.stage === "archived"
            ? c.value.followedUp
            : form.stage === "follow-up"
            ? true
            : c.value.followedUp;
        await persistContact(c, {
          name: form.name.trim(),
          channel: form.channel.trim(),
          outreachDate: form.outreachDate,
          contactDetails: form.contactDetails.trim(),
          link: normalized,
          replied: preservedReplied,
          followedUp: preservedFollowed,
          notes: form.notes,
          stage: form.stage,
          whyThem: form.whyThem.trim(),
          whatSent: form.whatSent.trim(),
          nextStep: form.nextStep.trim(),
          workType: form.workType,
          followUpDate: form.followUpDate,
          featuredLink: form.featuredLink.trim(),
        });
        if (selectedId === c.id) setNotesDraft(form.notes);
        showToast("Contact updated");
        selectContact(c.id);
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
        setModal(null);
        showToast("Contact added");
        if (pendingClearScratchpad) {
          setScratchpad("");
          scratchpadRef.current = "";
          setScratchpadSavedAt(null);
          setClearConfirm(false);
          setPendingClearScratchpad(false);
          saveSettings(themeMode, selectedId);
        }
        selectContact(created.id);
      }
      setModal(null);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Couldn’t save contact");
    } finally {
      setBusy(false);
    }
  };

  // Instant soft-delete with 5-second undo bar (no redundant blocking dialog)
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

  const saveWinLoop = async () => {
    if (!winContact) return;
    try {
      const patch: Partial<ContactValue> = {
        winNote: winNote.trim(),
        testimonial: winNote.trim(),
      };
      await persistContact(winContact, patch);
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
        showToast(`Win saved. ${parsed.name || "Referral"} added to To-Reach.`);
        selectContact(created.id);
      } else {
        showToast("Win saved.");
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not save win");
    }
    setWinModal(false);
    setWinContact(null);
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
      showToast("You already have this contact. Opened it instead.");
      setPasteText("");
      return;
    }
    const value: ContactValue = {
      name: parsed.name || raw,
      channel: parsed.channel,
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
      showToast("Added to To-Reach.");
      selectContact(created.id);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not add contact");
    }
  };

  const todaysThree = (() => {
    const today = todayISO();
    const due = contacts.filter((c) => isFollowUpDue(c.value, today) && !todayDone.includes(c.id));
    const toReach = contacts.filter(
      (c) => (c.value.stage || "to-reach") === "to-reach" && !todayDone.includes(c.id)
    );
    const deepen = contacts.filter(
      (c) => (c.value.stage || "") === "in-conversation" && !todayDone.includes(c.id)
    );
    const list: { kind: string; contact: Contact }[] = [];
    if (toReach[0]) list.push({ kind: "New", contact: toReach[0] });
    if (due[0]) list.push({ kind: "Follow-up", contact: due[0] });
    if (deepen[0]) list.push({ kind: "Deepen", contact: deepen[0] });
    return list;
  })();

  const markTodayDone = (id: string) => {
    setTodayDone((prev) => [...prev, id]);
    setStreak((s) => s + 1);
    showToast("Done. Next up.");
  };

  const closePanel = () => {
    selectContact(null);
  };

  const openSettings = (tab: "profile" | "shortcuts" | "account") => {
    setProfileDraft({
      name: profile.name,
      socials: normalizeSocials(profile.socials),
      avatarUrl: profile.avatarUrl || "",
      whatIDo: profile.whatIDo || "",
      openFor: profile.openFor || "",
      featuredLink: profile.featuredLink || "",
    });
    setSettingsTab(tab);
    setSettingsOpen(true);
    setCapturing(null);
  };

  const saveProfile = async () => {
    const next: ProfileValue = {
      name: profileDraft.name.trim(),
      socials: normalizeSocials(
        profileDraft.socials.map((s) => ({
          ...s,
          platform: s.platform.trim(),
          value: s.value.trim(),
        }))
      ),
      avatarUrl: (profileDraft.avatarUrl || "").trim(),
      whatIDo: (profileDraft.whatIDo || "").trim(),
      openFor: (profileDraft.openFor || "").trim(),
      featuredLink: (profileDraft.featuredLink || "").trim(),
    };
    setProfile(next);
    profileRef.current = next;
    setProfileDraft(next);
    try {
      await saveSettings(themeMode, selectedId);
      showToast("Profile saved. Your links are live.");
    } catch {
      showToast("Could not save profile. Tap Save again.");
    }
    setSettingsOpen(false);
  };

  const handleAvatarFile = async (file: File) => {
    if (!user) {
      showToast("Sign in to upload a photo");
      return;
    }
    if (!file.type.startsWith("image/")) {
      showToast("Please choose an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast("Photo must be under 5MB");
      return;
    }
    setAvatarUploading(true);
    try {
      const rawExt = file.name.split(".").pop()?.toLowerCase() || "jpg";
      if (rawExt === "svg") {
        showToast("SVG photos are blocked for safety. Use JPG, PNG or WebP.");
        return;
      }
      const ext = ["jpg", "jpeg", "png", "webp", "gif"].includes(rawExt) ? rawExt : "jpg";
      const path = `${user.id}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = `${data.publicUrl}?t=${Date.now()}`;
      setProfileDraft((d) => ({ ...d, avatarUrl: url }));
      showToast("Photo ready — tap Save profile to keep it");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not upload photo";
      showToast(msg);
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setProfileDraft((d) => ({ ...d, avatarUrl: "" }));
    showToast("Photo removed — tap Save profile");
  };

  const updateSocial = (id: string, field: "platform" | "value", nextValue: string) => {
    setProfileDraft((d) => ({
      ...d,
      socials: d.socials.map((s) => (s.id === id ? { ...s, [field]: nextValue } : s)),
    }));
  };
  const addCustomSocial = () => {
    setProfileDraft((d) => ({
      ...d,
      socials: [
        ...d.socials,
        { id: `social-custom-${uid()}`, platform: "", value: "", custom: true },
      ],
    }));
  };
  const removeCustomSocial = (id: string) => {
    setProfileDraft((d) => ({ ...d, socials: d.socials.filter((s) => s.id !== id) }));
  };

  const saveShortcuts = async () => {
    shortcutsRef.current = shortcuts;
    try {
      await saveSettings(themeMode, selectedId);
      showToast("Shortcuts saved.");
    } catch {
      showToast("Could not save shortcuts.");
    }
  };
  const resetShortcuts = async () => {
    const next: ShortcutMap = { ...DEFAULT_SHORTCUTS };
    setShortcuts(next);
    shortcutsRef.current = next;
    try {
      await saveSettings(themeMode, selectedId);
      showToast("Shortcuts reset");
    } catch {
      showToast("Shortcuts reset");
    }
  };

  useEffect(() => {
    if (!capturing) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setCapturing(null);
        return;
      }
      const canon = canonicalFromEvent(e);
      if (!canon) return;
      setShortcuts((prev) => {
        const next = { ...prev, [capturing]: canon };
        shortcutsRef.current = next;
        return next;
      });
      setCapturing(null);
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [capturing]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (capturing) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName || "";
      const isTyping =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!target?.isContentEditable;
      const isMod = e.ctrlKey || e.metaKey;
      const isModEnter = isMod && e.key === "Enter";
      const isEsc = e.key === "Escape";

      if (isTyping) {
        if (isEsc) {
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
          if (settingsOpen) {
            setSettingsOpen(false);
            return;
          }
          if (modal) {
            if (!busy) setModal(null);
            return;
          }
          return;
        }
        if (isModEnter && modal) {
          e.preventDefault();
          submitForm();
          return;
        }
        if (isMod) {
          if (matchesShortcut(e, shortcuts.export)) {
            e.preventDefault();
            exportCSV();
            return;
          }
          if (matchesShortcut(e, shortcuts.saveForm) && modal) {
            e.preventDefault();
            submitForm();
            return;
          }
        }
        return;
      }

      if (settingsOpen) {
        if (isEsc) setSettingsOpen(false);
        return;
      }
      if (modal) {
        if (isEsc && !busy) {
          setModal(null);
          return;
        }
        if (isModEnter) {
          e.preventDefault();
          submitForm();
          return;
        }
        return;
      }

      if (e.key.toLowerCase() === "z" && pendingDelete && !isMod) {
        e.preventDefault();
        undoDelete();
        return;
      }
      if (isEsc) {
        if (panelOpen) {
          e.preventDefault();
          closePanel();
        }
        return;
      }
      if (matchesShortcut(e, shortcuts.openSettings)) {
        e.preventDefault();
        openSettings("shortcuts");
        return;
      }
      if (matchesShortcut(e, shortcuts.focusSearch)) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (matchesShortcut(e, shortcuts.newContact)) {
        e.preventDefault();
        if (selected && panelOpen) {
          const el = document.getElementById("notes-editor") as HTMLTextAreaElement | null;
          if (el) {
            el.focus();
            return;
          }
        }
        pasteInputRef.current?.focus();
        return;
      }
      if (matchesShortcut(e, shortcuts.cycleTheme)) {
        e.preventDefault();
        cycleTheme();
        return;
      }
      if (matchesShortcut(e, shortcuts.export)) {
        e.preventDefault();
        exportCSV();
        return;
      }
      if (matchesShortcut(e, shortcuts.next) || e.key === "ArrowDown") {
        if (filtered.length === 0) return;
        e.preventDefault();
        const idx = filtered.findIndex((c) => c.id === selectedId);
        const next = idx < 0 ? filtered[0] : filtered[Math.min(filtered.length - 1, idx + 1)];
        selectContact(next.id);
        return;
      }
      if (matchesShortcut(e, shortcuts.prev) || e.key === "ArrowUp") {
        if (filtered.length === 0) return;
        e.preventDefault();
        const idx = filtered.findIndex((c) => c.id === selectedId);
        const prev = idx <= 0 ? filtered[0] : filtered[idx - 1];
        selectContact(prev.id);
        return;
      }
      if (matchesShortcut(e, shortcuts.openSelected)) {
        e.preventDefault();
        if (selectedId) {
          setPanelOpen(true);
          return;
        }
        if (filtered[0]) selectContact(filtered[0].id);
        return;
      }
      if (matchesShortcut(e, shortcuts.filterAll)) {
        setFilter("all");
        setActiveFocus(null);
        return;
      }
      if (matchesShortcut(e, shortcuts.filterToReach)) {
        setFilter("to-reach");
        setActiveFocus(null);
        return;
      }
      if (matchesShortcut(e, shortcuts.filterReplied)) {
        setFilter("replied");
        setActiveFocus(null);
        return;
      }
      if (matchesShortcut(e, shortcuts.filterFollowed)) {
        setFilter("followed");
        setActiveFocus(null);
        return;
      }

      if (!selected) return;
      if (matchesShortcut(e, shortcuts.edit)) {
        e.preventDefault();
        openEdit(selected);
        return;
      }
      if (matchesShortcut(e, shortcuts.toggleReplied)) {
        e.preventDefault();
        toggleStatus("replied");
        return;
      }
      if (matchesShortcut(e, shortcuts.toggleFollowed)) {
        e.preventDefault();
        toggleStatus("followedUp");
        return;
      }
      if (matchesShortcut(e, shortcuts.openLink)) {
        if (selectedLink) {
          e.preventDefault();
          window.open(selectedLink, "_blank", "noopener");
        }
        return;
      }
      if (matchesShortcut(e, shortcuts.copy)) {
        e.preventDefault();
        const text = selected.value.contactDetails || selectedLink || selected.value.name;
        copyText(text, "shortcut-copy");
        return;
      }
      if (matchesShortcut(e, shortcuts.minimize)) {
        e.preventDefault();
        if (panelOpen) setMinimized((m) => !m);
        else setPanelOpen(true);
        return;
      }
      if (matchesShortcut(e, shortcuts.back)) {
        e.preventDefault();
        goBack();
        return;
      }
      if (matchesShortcut(e, shortcuts.delete)) {
        e.preventDefault();
        triggerArchive(selected);
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    capturing,
    settingsOpen,
    modal,
    pendingDelete,
    panelOpen,
    selected,
    selectedId,
    selectedLink,
    filtered,
    shortcuts,
    themeMode,
    busy,
    form,
  ]);

  const nextBest = counts.followUpDueList?.[0] as Contact | undefined;
  const focusLine =
    counts.needsFollowUp > 0
      ? `Today: ${counts.needsFollowUp} to follow up, ${counts.toReach} to reach. Start with ${
          nextBest?.value.name || "the oldest thread"
        }.`
      : counts.outreachToday === 0 && counts.total > 0
      ? "Today: Reach out to 1 new person."
      : counts.total === 0
      ? "Paste a handle to create your first contact in 30 seconds."
      : "You are caught up. Deepen one thread.";
  const todayDesk = {
    due: counts.needsFollowUp,
    waiting: counts.inConversation || 0,
    todayCount: counts.outreachToday,
  };

  const applyFocus = (kind: "today" | "needs-follow-up" | "replied") => {
    setFilter(kind);
    setActiveFocus(
      kind === "today" ? "Outreach today" : kind === "needs-follow-up" ? "Needs follow-up" : "Replied"
    );
    if (isMobile || isTablet) {
      setPanelOpen(false);
      setMinimized(false);
    }
  };

  const onScratchpadChange = (text: string) => {
    setScratchpad(text);
    scratchpadRef.current = text;
    setScratchpadSavedAt(null);
    setClearConfirm(false);
    setScratchpadSaving(true);
    if (scratchpadTimer.current) window.clearTimeout(scratchpadTimer.current);
    scratchpadTimer.current = window.setTimeout(async () => {
      try {
        await saveSettings(themeMode, selectedId);
        setScratchpadSavedAt(formatTime(new Date()));
      } catch {
        /* retry on next change */
      } finally {
        setScratchpadSaving(false);
      }
    }, 400);
  };

  const clearScratchpad = async () => {
    setScratchpad("");
    scratchpadRef.current = "";
    setClearConfirm(false);
    setScratchpadSaving(true);
    try {
      await saveSettings(themeMode, selectedId);
      setScratchpadSavedAt(formatTime(new Date()));
    } catch {
      showToast("Couldn’t clear scratchpad");
    } finally {
      setScratchpadSaving(false);
    }
  };

  const [templateWorkType, setTemplateWorkType] = useState<WorkType>("");
  const [templatePortfolio, setTemplatePortfolio] = useState("");
  const saveTemplate = async (id: string) => {
    const next = templates.map((t) =>
      t.id === id
        ? { ...t, text: templateDraft, workType: templateWorkType, portfolioLink: templatePortfolio }
        : t
    );
    setTemplates(next);
    templatesRef.current = next;
    setEditingTemplateId(null);
    try {
      await saveSettings(themeMode, selectedId);
      showToast("Template saved");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Couldn’t save template");
    }
  };

  const resetTemplates = async () => {
    setTemplates(DEFAULT_TEMPLATES);
    templatesRef.current = DEFAULT_TEMPLATES;
    setEditingTemplateId(null);
    try {
      await saveSettings(themeMode, selectedId);
      showToast("Templates reset");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Couldn’t reset templates");
    }
  };

  const headerInitials = initialsFor(profile.name);
  const draftInitials = initialsFor(profileDraft.name);
  const linkedSocials = profileDraft.socials.filter(
    (s) => s.value.trim() && socialHref(s.platform, s.value)
  );

  // ============================================================================
  // RIGHT PANEL 1: OVERVIEW DESK (Shown when no contact is selected)
  // ============================================================================
  const emptyPanel = (
    <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-6 pb-12 pt-9 sm:px-7">
      <section aria-label="Today">
        <div className="small-caps" style={{ color: "var(--muted)" }}>
          Today
        </div>
        <div className="mt-6 grid grid-cols-3 gap-0" role="group" aria-label="Today overview">
          {(
            [
              { kind: "needs-follow-up", label: "Follow-up due", value: todayDesk.due },
              { kind: "replied", label: "In conversation", value: todayDesk.waiting },
              { kind: "today", label: "Today", value: todayDesk.todayCount },
            ] as const
          ).map((row, i) => (
            <button
              key={row.kind}
              onClick={() => applyFocus(row.kind)}
              aria-label={`Show ${row.label}: ${row.value}`}
              className={`min-h-[56px] px-1 py-2.5 text-center ${i > 0 ? "border-l" : ""}`}
              style={{ borderColor: "var(--divider)" }}
            >
              <span className="block text-[20px] font-semibold leading-[1.3] tracking-[-0.01em]">
                {row.value}
              </span>
              <span className="small-caps mt-1 block leading-[1.3]" style={{ color: "var(--muted)" }}>
                {row.label}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-4 truncate text-left text-[15px] leading-relaxed" title={focusLine}>
          {focusLine}
        </p>
        {nextBest && (
          <button
            onClick={() => selectContact(nextBest.id)}
            className="btn-press mt-4 w-full rounded-[16px] border p-4 text-left"
            style={{ borderColor: "var(--divider)", background: "var(--surface)" }}
          >
            <span className="small-caps block" style={{ color: "var(--muted)" }}>
              Do this next
            </span>
            <span className="mt-2 block truncate text-[15px] font-semibold">
              {nextBest.value.name} — {stageLabel(nextBest.value.stage)}
            </span>
            <span className="mt-1 block truncate text-[13px]" style={{ color: "var(--muted)" }}>
              {nextBest.value.nextStep ||
                nextBest.value.whyThem ||
                "Open to see context and follow up"}
            </span>
            <span
              className="mt-2 block text-xs font-medium underline underline-offset-4"
              style={{ color: "var(--brand)" }}
            >
              Open thread →
            </span>
          </button>
        )}
      </section>

      <section aria-label="Capture in 5 seconds" className="mt-12">
        <label htmlFor="scratchpad" className="small-caps" style={{ color: "var(--muted)" }}>
          Capture in 5 seconds
        </label>
        {quickNoteFocused ? (
          <textarea
            id="scratchpad"
            autoFocus
            value={scratchpad}
            onChange={(e) => onScratchpadChange(e.target.value)}
            onBlur={() => {
              window.setTimeout(() => setQuickNoteFocused(false), 150);
            }}
            placeholder="Capture a quick note, handle, or thought to self..."
            rows={3}
            className="mt-4 w-full resize-y border-b bg-transparent pb-2 text-[15px] leading-relaxed outline-none"
            style={{ borderColor: "var(--divider)" }}
          />
        ) : (
          <input
            id="scratchpad"
            value={scratchpad}
            onChange={(e) => onScratchpadChange(e.target.value)}
            onFocus={() => setQuickNoteFocused(true)}
            onClick={() => setQuickNoteFocused(true)}
            placeholder="Capture a quick note, handle, or thought to self..."
            className="mt-4 w-full border-b bg-transparent pb-2 text-[15px] leading-relaxed outline-none"
            style={{ borderColor: "var(--divider)" }}
          />
        )}
        {quickNoteFocused && (
          <p aria-live="polite" className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
            {scratchpadSaving
              ? "Saving…"
              : scratchpadSavedAt
              ? `Saved • ${scratchpadSavedAt}`
              : `${scratchpad.length} characters`}
          </p>
        )}
        <div className="mt-3 flex items-center gap-5">
          <button
            onClick={() => openAdd(scratchpad, { clearScratchpadAfterSave: true })}
            disabled={!scratchpad.trim()}
            className="min-h-[32px] text-xs font-medium underline underline-offset-4 disabled:opacity-40"
            style={{ color: "var(--muted)" }}
          >
            Add to To-Reach
          </button>
          <button
            onClick={() => {
              if (!scratchpad.trim()) return;
              if (!clearConfirm) {
                setClearConfirm(true);
                return;
              }
              clearScratchpad();
            }}
            disabled={!scratchpad.trim()}
            className="min-h-[32px] text-xs font-medium underline underline-offset-4 disabled:opacity-40"
            style={{ color: clearConfirm ? "#DB200D" : "var(--muted)" }}
          >
            {clearConfirm ? "Confirm clear" : "Clear"}
          </button>
        </div>
      </section>

      <section aria-label="Templates" className="mt-12">
        <div className="flex items-center justify-between gap-2">
          <span className="small-caps" style={{ color: "var(--muted)" }}>
            Templates
          </span>
          <button
            onClick={() =>
              setActiveTemplateId(activeTemplateId ? null : templates[0]?.id || null)
            }
            aria-expanded={!!activeTemplateId}
            aria-label={activeTemplateId ? "Collapse templates" : "Expand templates"}
            className="flex min-h-[32px] min-w-[32px] items-center justify-center rounded-full"
            style={{ color: "var(--muted)" }}
          >
            <ChevronDown
              size={16}
              className="transition-transform"
              style={{ transform: activeTemplateId ? "rotate(180deg)" : "none" }}
            />
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {templates.map((t) => {
            const active = t.id === activeTemplateId;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTemplateId(active ? null : t.id)}
                aria-pressed={active}
                className="min-h-[32px] rounded-full border px-3 text-xs font-medium"
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
                {t.title}
              </button>
            );
          })}
        </div>
        {activeTemplate && activeTemplateId && (
          <div className="mt-6">
            {editingTemplateId === activeTemplate.id ? (
              <div>
                <label className="small-caps block" style={{ color: "var(--muted)" }}>
                  Work type
                </label>
                <select
                  value={templateWorkType}
                  onChange={(e) => setTemplateWorkType(e.target.value as WorkType)}
                  className="mt-2 h-[44px] w-full rounded-[12px] border px-3 text-sm"
                  style={{ borderColor: "var(--divider)", background: "var(--input)" }}
                >
                  {WORK_TYPES.map((w) => (
                    <option key={w.value} value={w.value}>
                      {w.label}
                    </option>
                  ))}
                </select>
                <label className="small-caps mt-4 block" style={{ color: "var(--muted)" }}>
                  Featured work link
                </label>
                <input
                  value={templatePortfolio}
                  onChange={(e) => setTemplatePortfolio(e.target.value)}
                  placeholder="https://your-portfolio.com/work"
                  className="mt-2 h-[44px] w-full rounded-[12px] border px-3 text-sm"
                  style={{ borderColor: "var(--divider)", background: "var(--input)" }}
                />
                <textarea
                  value={templateDraft}
                  onChange={(e) => setTemplateDraft(e.target.value)}
                  rows={6}
                  className="mt-4 w-full resize-y border-b bg-transparent pb-2 text-sm leading-relaxed outline-none"
                  style={{ borderColor: "var(--divider)" }}
                />
                <div className="mt-3 flex items-center gap-5">
                  <button
                    onClick={() => saveTemplate(activeTemplate.id)}
                    className="min-h-[32px] text-xs font-medium underline underline-offset-4"
                    style={{ color: "var(--muted)" }}
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingTemplateId(null)}
                    className="min-h-[32px] text-xs font-medium underline underline-offset-4"
                    style={{ color: "var(--muted)" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                {activeTemplate.workType && (
                  <span
                    className="mb-3 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium"
                    style={{ borderColor: "var(--divider)", color: "var(--muted)" }}
                  >
                    {workTypeLabel(activeTemplate.workType)} • Pitch with work
                  </span>
                )}
                {activeTemplate.portfolioLink && (
                  <a
                    href={activeTemplate.portfolioLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mb-3 block truncate text-xs font-medium underline underline-offset-4"
                    style={{ color: "var(--brand)" }}
                  >
                    Featured work: {activeTemplate.portfolioLink}
                  </a>
                )}
                {profile.whatIDo && (
                  <p className="mb-3 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                    Your pitch card: {profile.name || "You"} — {profile.whatIDo}
                    {profile.openFor ? ` • Open for ${profile.openFor}` : ""}
                  </p>
                )}
                <p
                  className="whitespace-pre-wrap text-sm leading-relaxed"
                  style={{ color: "var(--muted)" }}
                >
                  {activeTemplate.text}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-5">
                  <button
                    onClick={() =>
                      copyText(activeTemplate.text, `template-${activeTemplate.id}`)
                    }
                    className="min-h-[32px] text-xs font-medium underline underline-offset-4"
                    style={{ color: "var(--muted)" }}
                  >
                    {copied === `template-${activeTemplate.id}` ? "Copied" : "Copy"}
                  </button>
                  <button
                    onClick={() =>
                      openAdd(activeTemplate.text, {
                        prefill: {
                          workType: activeTemplate.workType || "",
                          featuredLink:
                            activeTemplate.portfolioLink || profile.featuredLink || "",
                        },
                      })
                    }
                    className="min-h-[32px] text-xs font-medium underline underline-offset-4"
                    style={{ color: "var(--muted)" }}
                  >
                    Use in new contact
                  </button>
                  <button
                    onClick={() => {
                      setEditingTemplateId(activeTemplate.id);
                      setTemplateDraft(activeTemplate.text);
                      setTemplateWorkType(activeTemplate.workType || "");
                      setTemplatePortfolio(activeTemplate.portfolioLink || "");
                    }}
                    className="min-h-[32px] text-xs font-medium underline underline-offset-4"
                    style={{ color: "var(--muted)" }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={resetTemplates}
                    className="min-h-[32px] text-xs font-medium underline underline-offset-4"
                    style={{ color: "var(--muted)" }}
                  >
                    Reset
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );

  // ============================================================================
  // RIGHT PANEL 2: CONTACT DOSSIER (Warm Editorial Layout + Seamless Inline Editing)
  // ============================================================================
  const panelContent = selected ? (
    <div className="flex min-h-0 flex-1 flex-col">
      {prevContact && selected.id !== prevContact.id && (
        <div className="px-6 pt-5 sm:px-7">
          <button
            onClick={goBack}
            className="min-h-[32px] text-sm"
            style={{ color: "var(--muted)" }}
          >
            ← Back to {prevContact.name}
          </button>
        </div>
      )}
      <div className="px-6 pt-8 sm:px-7">
        {/* Seamless Inline-Editable Display Name */}
        <input
          value={selected.value.name}
          onChange={(e) => updateInlineField({ name: e.target.value })}
          aria-label="Contact name"
          className="inline-field w-full text-[clamp(28px,2.8vw,34px)] font-semibold leading-[1.1] tracking-[-0.02em]"
        />
        <div
          className="mt-3 flex flex-wrap items-center gap-1.5 text-[13px] leading-relaxed"
          style={{ color: "var(--muted)" }}
        >
          <input
            value={selected.value.channel}
            onChange={(e) => updateInlineField({ channel: e.target.value })}
            placeholder="Add channel (e.g. Instagram)"
            aria-label="Channel"
            className="inline-field w-[130px] text-[13px]"
          />
          <span>•</span>
          <span>
            {selected.value.outreachDate ? formatDate(selected.value.outreachDate) : "Today"}
          </span>
          <span>•</span>
          <span>
            {notesSaving
              ? "Saving…"
              : notesSavedAt
              ? `Saved ${notesSavedAt}`
              : `Updated ${new Date(selected.value.updatedAt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                })}`}
          </span>
        </div>

        {/* Status Pills */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
            style={{ background: "var(--tint)" }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: STAGES.find(
                  (s) => s.value === (selected.value.stage || "to-reach")
                )?.dot,
              }}
            />
            {stageLabel(selected.value.stage)}
          </span>
          <select
            value={selected.value.workType || ""}
            onChange={(e) => updateInlineField({ workType: e.target.value as WorkType })}
            aria-label="Work type"
            className="rounded-full border bg-transparent px-2.5 py-0.5 text-[11px] font-medium"
            style={{ borderColor: "var(--divider)", color: "var(--muted)" }}
          >
            {WORK_TYPES.map((w) => (
              <option key={w.value} value={w.value} style={{ background: "var(--surface)" }}>
                {w.value ? w.label : "+ Work type"}
              </option>
            ))}
          </select>
          {selected.value.followUpDate && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium"
              style={{ background: "#FFF0EE", color: "#DB200D" }}
            >
              Follow-up {formatDate(selected.value.followUpDate)}
            </span>
          )}
        </div>
      </div>

      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-6 pb-10 pt-2 sm:px-7">
        <div className="mt-8 border-t" style={{ borderColor: "var(--divider)" }}>
          {/* Contact Details Row (Inline-editable) */}
          <div
            className="flex min-h-[42px] items-center gap-3 border-b py-2"
            style={{ borderColor: "var(--divider)" }}
          >
            <span className="small-caps w-[72px] shrink-0 text-left" style={{ color: "var(--muted)" }}>
              Contact
            </span>
            <input
              value={selected.value.contactDetails}
              onChange={(e) => updateInlineField({ contactDetails: e.target.value })}
              placeholder="@handle, email, or phone"
              className="inline-field min-w-0 flex-1 truncate text-left text-sm leading-[1.3]"
            />
            {selected.value.contactDetails && (
              <button
                onClick={() => copyText(selected.value.contactDetails, "details")}
                className="flex min-h-[32px] shrink-0 items-center text-sm font-medium underline decoration-1 underline-offset-4"
                style={{ color: "var(--muted)" }}
              >
                {copied === "details" ? "Copied" : "Copy"}
              </button>
            )}
          </div>

          {/* Link Row */}
          <div
            className="flex min-h-[42px] items-center gap-3 border-b py-2"
            style={{ borderColor: "var(--divider)" }}
          >
            <span className="small-caps w-[72px] shrink-0 text-left" style={{ color: "var(--muted)" }}>
              Link
            </span>
            {selectedLink ? (
              <a
                href={selectedLink}
                target="_blank"
                rel="noopener noreferrer"
                title={selectedLink}
                className="min-w-0 flex-1 truncate text-left text-sm font-medium leading-[1.3] underline decoration-1 underline-offset-4"
                style={{ color: "var(--brand)" }}
              >
                {shortLinkText(selectedLink)}
              </a>
            ) : (
              <input
                value={selected.value.link}
                onChange={(e) => updateInlineField({ link: e.target.value })}
                placeholder="Paste URL or @handle…"
                className="inline-field min-w-0 flex-1 text-sm"
              />
            )}
            {selectedLink && (
              <a
                href={selectedLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-[32px] shrink-0 items-center text-sm font-medium underline decoration-1 underline-offset-4"
                style={{ color: "var(--muted)" }}
              >
                Open
              </a>
            )}
          </div>

          {/* Follow-up Cadence Row */}
          <div
            className="flex min-h-[42px] items-center gap-3 border-b py-2"
            style={{ borderColor: "var(--divider)" }}
          >
            <span className="small-caps w-[72px] shrink-0 text-left" style={{ color: "var(--muted)" }}>
              Follow-up
            </span>
            <input
              type="date"
              value={selected.value.followUpDate || ""}
              onChange={(e) => updateInlineField({ followUpDate: e.target.value })}
              className="inline-field min-w-0 flex-1 text-sm"
            />
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => updateInlineField({ followUpDate: addDaysISO(todayISO(), 4) })}
                className="text-xs font-medium underline underline-offset-4"
                style={{ color: "var(--muted)" }}
              >
                +4d
              </button>
              <button
                type="button"
                onClick={() => updateInlineField({ followUpDate: addDaysISO(todayISO(), 7) })}
                className="text-xs font-medium underline underline-offset-4"
                style={{ color: "var(--muted)" }}
              >
                +7d
              </button>
            </div>
          </div>

          {/* Journey Pills */}
          <div className="border-b py-5" style={{ borderColor: "var(--divider)" }}>
            <div className="flex items-center justify-between gap-3">
              <span className="small-caps" style={{ color: "var(--muted)" }}>
                Journey
              </span>
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Tap a stage to move it
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {STAGES.map((s) => {
                const active = (selected.value.stage || "to-reach") === s.value;
                return (
                  <button
                    key={s.value}
                    onClick={() => setStage(s.value)}
                    aria-pressed={active}
                    className="btn-press min-h-[32px] rounded-full border px-3 text-xs font-medium"
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
                    {s.label}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-4">
              {(["replied", "followedUp"] as const).map((field) => {
                const on = selected.value[field];
                return (
                  <span key={field} className="flex items-center gap-2.5">
                    <span className="text-sm">
                      {field === "replied" ? "Replied" : "Followed up"}
                    </span>
                    <button
                      role="switch"
                      aria-checked={on}
                      onClick={() => toggleStatus(field)}
                      className="relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors"
                      style={{ background: on ? "var(--text)" : "var(--divider)" }}
                    >
                      <span
                        className="absolute top-[3px] h-[16px] w-[16px] rounded-full shadow transition-all"
                        style={{ left: on ? 19 : 3, background: "var(--bg)" }}
                      />
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* Context — Borderless Click-to-Edit Dossier Fields */}
        <section className="mt-8 space-y-4">
          <p className="small-caps" style={{ color: "var(--muted)" }}>
            Context — click any line to edit
          </p>
          <div>
            <p className="text-xs font-medium" style={{ color: "var(--muted)" }}>
              Why them (interpolates [detail] in pitch)
            </p>
            <input
              value={selected.value.whyThem || ""}
              onChange={(e) => updateInlineField({ whyThem: e.target.value })}
              placeholder="What caught your eye about their work?"
              className="inline-field mt-1 w-full text-[15px] leading-relaxed"
            />
          </div>
          <div>
            <p className="text-xs font-medium" style={{ color: "var(--muted)" }}>
              Pitch you sent
            </p>
            <input
              value={selected.value.whatSent || ""}
              onChange={(e) => updateInlineField({ whatSent: e.target.value })}
              placeholder="Intro + 2 relevant pieces…"
              className="inline-field mt-1 w-full text-[15px] leading-relaxed"
            />
          </div>
          <div>
            <p className="text-xs font-medium" style={{ color: "var(--muted)" }}>
              Next step
            </p>
            <input
              value={selected.value.nextStep || ""}
              onChange={(e) => updateInlineField({ nextStep: e.target.value })}
              placeholder="Follow up in 4 days with idea…"
              className="inline-field mt-1 w-full text-[15px] leading-relaxed"
            />
          </div>
        </section>

        {/* Context-Bound Pitch Composer (Live Interpolated Preview + 1-Click Copy) */}
        <section
          className="mt-8 rounded-[16px] border p-4"
          style={{ borderColor: "var(--divider)", background: "var(--bg-soft)" }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="small-caps flex items-center gap-1.5" style={{ color: "var(--muted)" }}>
              <Sparkles size={12} /> Pitch for {selected.value.name.split(" ")[0] || "them"}
            </span>
            <div className="flex gap-1">
              {templates.map((t) => {
                const active = (activeTemplate?.id || "") === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTemplateId(t.id)}
                    className="rounded-full border px-2.5 py-0.5 text-[11px] font-medium"
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
                    {t.title.split(" ")[0]}
                  </button>
                );
              })}
            </div>
          </div>
          <p
            className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed"
            style={{ color: "var(--muted)" }}
          >
            {interpolatedPitch}
          </p>
          <button
            type="button"
            onClick={copyPitchAndAdvance}
            className="btn-press mt-3 inline-flex min-h-[38px] w-full items-center justify-center gap-2 rounded-[12px] px-4 text-xs font-medium text-white"
            style={{ background: "var(--brand)" }}
          >
            <Copy size={14} /> Copy pitch &amp; mark Pitched (+4d)
          </button>
        </section>

        {/* Editorial Notes Editor */}
        <section className="mt-10">
          <div className="flex items-baseline justify-between gap-3">
            <label
              htmlFor="notes-editor"
              className="small-caps"
              style={{ color: "var(--muted)" }}
            >
              Notes{" "}
              {search.trim() &&
              notesDraft.toLowerCase().includes(search.trim().toLowerCase())
                ? "• In notes"
                : ""}
            </label>
            {notesSavedAt && !notesSaving ? (
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Saved • {notesSavedAt}
              </span>
            ) : (
              <span />
            )}
          </div>
          <textarea
            id="notes-editor"
            value={notesDraft}
            onChange={(e) => onNotesChange(e.target.value)}
            onBlur={() => saveNotesNow(notesDraft)}
            placeholder="Add context, what you sent, what they said, next step…"
            className="mt-2 w-full resize-y border-0 border-b bg-transparent px-0 py-3 text-[15px] leading-[1.8] outline-none"
            style={{ borderColor: "var(--divider)", minHeight: 160 }}
          />
        </section>
      </div>

      <div
        className="flex items-center justify-between gap-4 border-t px-6 py-4 sm:px-7"
        style={{ borderColor: "var(--divider)" }}
      >
        <button
          onClick={() => openEdit(selected)}
          className="min-h-[36px] text-sm font-medium underline decoration-1 underline-offset-4"
          style={{ color: "var(--brand)" }}
        >
          Full edit modal (E)
        </button>
        <button
          onClick={() => triggerArchive(selected)}
          className="min-h-[36px] text-sm font-medium underline decoration-1 underline-offset-4"
          style={{ color: "var(--muted)" }}
        >
          Archive
        </button>
      </div>
    </div>
  ) : null;

  const panelHeader = (
    <div
      className="flex shrink-0 items-center justify-between border-b px-4 py-3 sm:px-5"
      style={{ borderColor: "var(--divider)" }}
    >
      <span className="small-caps" style={{ color: "var(--muted)" }}>
        {selected ? "Details" : "Overview"}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => setMinimized(true)}
          className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-[10px]"
          aria-label={selected ? "Minimize details" : "Minimize overview"}
          title="Minimize"
        >
          <Minus size={18} />
        </button>
        <button
          onClick={closePanel}
          className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-[10px]"
          aria-label={selected ? "Close details" : "Close overview"}
          title="Close"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );

  // ============================================================================
  // AUTH & SETUP SCREENS
  // ============================================================================
  if (authLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "var(--bg)",
          color: "var(--text)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p style={{ color: "var(--muted)" }}>Loading your outreach...</p>
      </div>
    );
  }
  if (!isSupabaseConfigured) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "var(--bg)",
          color: "var(--text)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <div style={{ maxWidth: 520, width: "100%", textAlign: "center" }}>
          <p className="small-caps" style={{ color: "var(--muted)" }}>
            Reach • Setup needed
          </p>
          <h1 className="mt-3 text-[32px] font-semibold">
            Connect your database to load contacts. Add keys in Vercel, then redeploy.
          </h1>
          <p className="mt-3 leading-relaxed" style={{ color: "var(--muted)" }}>
            Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel → Settings → Environment
            Variables, then redeploy.
          </p>
        </div>
      </div>
    );
  }
  if (!user) {
    const pwScore = passwordScore(authPassword);
    const pwLabel = passwordLabel(authPassword);
    const pwColor = pwScore <= 1 ? "#DB200D" : pwScore <= 3 ? "#E6A800" : "#1A9A4A";
    return (
      <div
        style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}
        className="flex items-center justify-center px-4 py-10"
      >
        <div className="w-full max-w-[480px]">
          <div className="text-center">
            <span
              className="mx-auto block h-[10px] w-[10px] rounded-[2px]"
              style={{ background: "#DB200D" }}
            />
            <h1 className="mt-4 text-[34px] font-semibold tracking-[-0.02em]">Reach</h1>
            <p className="mt-1 text-[15px]" style={{ color: "var(--muted)" }}>
              Outreach, curated. Your data, only yours.
            </p>
          </div>
          <div
            className="mt-8 rounded-[16px] border p-6"
            style={{
              borderColor: "var(--divider)",
              background: "var(--surface)",
              boxShadow: "var(--shadow)",
            }}
          >
            <div
              className="flex gap-1 rounded-full border p-1"
              style={{ borderColor: "var(--divider)", background: "var(--bg-soft)" }}
              role="tablist"
              aria-label="Sign in or create account"
            >
              {(["signin", "signup"] as const).map((tab) => (
                <button
                  key={tab}
                  role="tab"
                  aria-selected={authTab === tab}
                  onClick={() => {
                    setAuthTab(tab);
                    setAuthError(null);
                    setAuthForgotMode(false);
                    setAuthForgotSent(false);
                    setAuthNeedsConfirm(false);
                    setAuthSent(false);
                  }}
                  className="min-h-[40px] flex-1 rounded-full px-4 text-sm font-medium"
                  style={
                    authTab === tab
                      ? { background: "var(--text)", color: "var(--bg)" }
                      : { color: "var(--muted)" }
                  }
                >
                  {tab === "signin" ? "Sign in" : "Create account"}
                </button>
              ))}
            </div>
            {authNeedsConfirm ? (
              <div className="mt-6">
                <h2 className="text-[22px] font-semibold">Check your inbox</h2>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                  We sent a confirmation link to{" "}
                  <b style={{ color: "var(--text)" }}>{authEmail}</b>. Click it, then come back and
                  sign in.
                </p>
                <div className="mt-5 flex gap-2">
                  <button
                    onClick={handleResendConfirm}
                    disabled={authBusy}
                    className="min-h-[46px] flex-1 rounded-[12px] border text-sm font-medium disabled:opacity-50"
                    style={{ borderColor: "var(--divider)" }}
                  >
                    {authBusy ? "Sending…" : "Resend email"}
                  </button>
                  <button
                    onClick={() => {
                      setAuthNeedsConfirm(false);
                      setAuthTab("signin");
                      setAuthMethod("password");
                    }}
                    className="min-h-[46px] flex-1 rounded-[12px] text-sm font-medium text-white"
                    style={{ background: "#DB200D" }}
                  >
                    Back to sign in
                  </button>
                </div>
              </div>
            ) : authForgotMode ? (
              <div className="mt-6">
                <h2 className="text-[22px] font-semibold">Reset your password</h2>
                {authForgotSent ? (
                  <div
                    className="mt-3 rounded-[12px] border p-4"
                    style={{ borderColor: "var(--divider)" }}
                  >
                    <p className="font-medium">Check your inbox</p>
                    <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                      If an account exists for{" "}
                      <b style={{ color: "var(--text)" }}>{authEmail}</b>, we sent a reset link.
                    </p>
                    <button
                      onClick={() => {
                        setAuthForgotMode(false);
                        setAuthForgotSent(false);
                        setAuthTab("signin");
                      }}
                      className="mt-3 text-sm font-medium underline underline-offset-4"
                      style={{ color: "var(--brand)" }}
                    >
                      Back to sign in
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleForgotPassword} className="mt-5 space-y-3">
                    <label className="small-caps block" style={{ color: "var(--muted)" }}>
                      Email
                    </label>
                    <input
                      type="email"
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      className="h-[48px] w-full rounded-[12px] border px-3.5 text-[15px]"
                      style={{ borderColor: "var(--divider)", background: "var(--input)" }}
                    />
                    {authError && (
                      <p role="alert" className="text-sm font-medium" style={{ color: "#DB200D" }}>
                        {authError}
                      </p>
                    )}
                    <button
                      type="submit"
                      disabled={authBusy}
                      className="min-h-[48px] w-full rounded-[12px] text-sm font-medium text-white disabled:opacity-50"
                      style={{ background: "#DB200D" }}
                    >
                      {authBusy ? "Sending…" : "Send reset link"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthForgotMode(false);
                        setAuthError(null);
                      }}
                      className="min-h-[40px] w-full text-sm font-medium underline underline-offset-4"
                      style={{ color: "var(--muted)" }}
                    >
                      Back to sign in
                    </button>
                  </form>
                )}
              </div>
            ) : authSent ? (
              <div className="mt-6">
                <h2 className="text-[22px] font-semibold">Check your inbox</h2>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                  We sent a sign-in link to <b style={{ color: "var(--text)" }}>{authEmail}</b>.
                </p>
                <button
                  onClick={() => {
                    setAuthSent(false);
                    setAuthError(null);
                  }}
                  className="mt-4 text-sm font-medium underline underline-offset-4"
                  style={{ color: "var(--brand)" }}
                >
                  Use a different email
                </button>
              </div>
            ) : (
              <>
                <h2 className="mt-5 text-[22px] font-semibold">
                  {authTab === "signin" ? "Welcome back" : "Create your account"}
                </h2>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                  {authTab === "signin"
                    ? "Sign in to see your outreach. Each account sees only its own contacts."
                    : "One account for all your outreach. Same email = same contacts."}
                </p>
                <div className="mt-5 space-y-2">
                  <button
                    onClick={() => handleOAuth("google")}
                    disabled={authBusy}
                    className="flex min-h-[48px] w-full items-center justify-center gap-2.5 rounded-[12px] border text-sm font-medium disabled:opacity-50"
                    style={{ borderColor: "var(--divider)", background: "#fff", color: "#1f1f1f" }}
                  >
                    Continue with Google
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleOAuth("github")}
                      disabled={authBusy}
                      className="flex min-h-[48px] items-center justify-center gap-2 rounded-[12px] border text-sm font-medium disabled:opacity-50"
                      style={{
                        borderColor: "var(--divider)",
                        background: "var(--bg)",
                        color: "var(--text)",
                      }}
                    >
                      GitHub
                    </button>
                    <button
                      onClick={() => handleOAuth("apple")}
                      disabled={authBusy}
                      className="flex min-h-[48px] items-center justify-center gap-2 rounded-[12px] border text-sm font-medium disabled:opacity-50"
                      style={{
                        borderColor: "var(--divider)",
                        background: "var(--bg)",
                        color: "var(--text)",
                      }}
                    >
                      Apple
                    </button>
                  </div>
                </div>
                <div className="mt-5 flex items-center gap-3" aria-hidden="true">
                  <span className="h-px flex-1" style={{ background: "var(--divider)" }} />
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    or with email
                  </span>
                  <span className="h-px flex-1" style={{ background: "var(--divider)" }} />
                </div>
                <div
                  className="mt-4 flex gap-1 rounded-full border p-1"
                  style={{ borderColor: "var(--divider)", background: "var(--bg-soft)" }}
                >
                  {(["password", "magic"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => {
                        setAuthMethod(m);
                        setAuthError(null);
                      }}
                      className="min-h-[36px] flex-1 rounded-full px-3 text-xs font-medium"
                      style={
                        authMethod === m
                          ? { background: "var(--text)", color: "var(--bg)" }
                          : { color: "var(--muted)" }
                      }
                    >
                      {m === "password" ? "Password" : "Magic link"}
                    </button>
                  ))}
                </div>
                {authMethod === "magic" ? (
                  <form onSubmit={handleSendMagicLink} className="mt-5 space-y-3">
                    <div>
                      <label className="small-caps block" style={{ color: "var(--muted)" }}>
                        Email
                      </label>
                      <input
                        type="email"
                        value={authEmail}
                        onChange={(e) => setAuthEmail(e.target.value)}
                        placeholder="you@example.com"
                        required
                        className="mt-2 h-[48px] w-full rounded-[12px] border px-3.5 text-[15px]"
                        style={{ borderColor: "var(--divider)", background: "var(--input)" }}
                      />
                    </div>
                    {authError && (
                      <p role="alert" className="text-sm font-medium" style={{ color: "#DB200D" }}>
                        {authError}
                      </p>
                    )}
                    <button
                      type="submit"
                      disabled={authBusy}
                      className="min-h-[48px] w-full rounded-[12px] text-sm font-medium text-white disabled:opacity-50"
                      style={{ background: "#DB200D" }}
                    >
                      {authBusy ? "Sending…" : "Send magic link"}
                    </button>
                  </form>
                ) : authTab === "signup" ? (
                  <form onSubmit={handleSignUpPassword} className="mt-5 space-y-3">
                    <div>
                      <label className="small-caps block" style={{ color: "var(--muted)" }}>
                        Full name
                      </label>
                      <input
                        type="text"
                        value={authName}
                        onChange={(e) => setAuthName(e.target.value)}
                        placeholder="Memik Luqman"
                        required
                        className="mt-2 h-[48px] w-full rounded-[12px] border px-3.5 text-[15px]"
                        style={{ borderColor: "var(--divider)", background: "var(--input)" }}
                      />
                    </div>
                    <div>
                      <label className="small-caps block" style={{ color: "var(--muted)" }}>
                        Email
                      </label>
                      <input
                        type="email"
                        value={authEmail}
                        onChange={(e) => setAuthEmail(e.target.value)}
                        placeholder="you@example.com"
                        required
                        className="mt-2 h-[48px] w-full rounded-[12px] border px-3.5 text-[15px]"
                        style={{ borderColor: "var(--divider)", background: "var(--input)" }}
                      />
                    </div>
                    <div>
                      <label className="small-caps block" style={{ color: "var(--muted)" }}>
                        Password
                      </label>
                      <div className="relative mt-2">
                        <input
                          type={authShowPassword ? "text" : "password"}
                          value={authPassword}
                          onChange={(e) => setAuthPassword(e.target.value)}
                          placeholder="At least 8 characters"
                          required
                          minLength={8}
                          className="h-[48px] w-full rounded-[12px] border px-3.5 pr-16 text-[15px]"
                          style={{ borderColor: "var(--divider)", background: "var(--input)" }}
                        />
                        <button
                          type="button"
                          onClick={() => setAuthShowPassword((v) => !v)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[32px] px-2 text-xs font-medium"
                          style={{ color: "var(--muted)" }}
                        >
                          {authShowPassword ? "Hide" : "Show"}
                        </button>
                      </div>
                      {authPassword && (
                        <div className="mt-2">
                          <div
                            className="h-[4px] w-full overflow-hidden rounded-full"
                            style={{ background: "var(--divider)" }}
                          >
                            <div
                              className="h-full transition-all"
                              style={{
                                width: `${Math.min(100, (pwScore / 5) * 100)}%`,
                                background: pwColor,
                              }}
                            />
                          </div>
                          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                            Strength: <b style={{ color: pwColor }}>{pwLabel}</b>
                          </p>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="small-caps block" style={{ color: "var(--muted)" }}>
                        Confirm password
                      </label>
                      <div className="relative mt-2">
                        <input
                          type={authShowConfirm ? "text" : "password"}
                          value={authConfirmPassword}
                          onChange={(e) => setAuthConfirmPassword(e.target.value)}
                          placeholder="Repeat password"
                          required
                          className="mt-2 h-[48px] w-full rounded-[12px] border px-3.5 pr-16 text-[15px]"
                          style={{ borderColor: "var(--divider)", background: "var(--input)" }}
                        />
                        <button
                          type="button"
                          onClick={() => setAuthShowConfirm((v) => !v)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[32px] px-2 text-xs font-medium"
                          style={{ color: "var(--muted)" }}
                        >
                          {authShowConfirm ? "Hide" : "Show"}
                        </button>
                      </div>
                    </div>
                    <label
                      className="flex items-start gap-2 pt-1 text-xs leading-relaxed"
                      style={{ color: "var(--muted)" }}
                    >
                      <input
                        type="checkbox"
                        checked={authAgree}
                        onChange={(e) => setAuthAgree(e.target.checked)}
                        className="mt-0.5 h-[16px] w-[16px] shrink-0"
                      />
                      I agree to the terms and understand my contacts are stored privately under my
                      account.
                    </label>
                    {authError && (
                      <p role="alert" className="text-sm font-medium" style={{ color: "#DB200D" }}>
                        {authError}
                      </p>
                    )}
                    <button
                      type="submit"
                      disabled={authBusy}
                      className="min-h-[48px] w-full rounded-[12px] text-sm font-medium text-white disabled:opacity-50"
                      style={{ background: "#DB200D" }}
                    >
                      {authBusy ? "Creating…" : "Create account"}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleSignInPassword} className="mt-5 space-y-3">
                    <div>
                      <label className="small-caps block" style={{ color: "var(--muted)" }}>
                        Email
                      </label>
                      <input
                        type="email"
                        value={authEmail}
                        onChange={(e) => setAuthEmail(e.target.value)}
                        placeholder="you@example.com"
                        required
                        className="mt-2 h-[48px] w-full rounded-[12px] border px-3.5 text-[15px]"
                        style={{ borderColor: "var(--divider)", background: "var(--input)" }}
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="small-caps block" style={{ color: "var(--muted)" }}>
                          Password
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setAuthForgotMode(true);
                            setAuthForgotSent(false);
                            setAuthError(null);
                          }}
                          className="text-xs font-medium underline underline-offset-4"
                          style={{ color: "var(--brand)" }}
                        >
                          Forgot password?
                        </button>
                      </div>
                      <div className="relative mt-2">
                        <input
                          type={authShowPassword ? "text" : "password"}
                          value={authPassword}
                          onChange={(e) => setAuthPassword(e.target.value)}
                          placeholder="Your password"
                          required
                          className="h-[48px] w-full rounded-[12px] border px-3.5 pr-16 text-[15px]"
                          style={{ borderColor: "var(--divider)", background: "var(--input)" }}
                        />
                        <button
                          type="button"
                          onClick={() => setAuthShowPassword((v) => !v)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[32px] px-2 text-xs font-medium"
                          style={{ color: "var(--muted)" }}
                        >
                          {authShowPassword ? "Hide" : "Show"}
                        </button>
                      </div>
                    </div>
                    {authError && (
                      <p role="alert" className="text-sm font-medium" style={{ color: "#DB200D" }}>
                        {authError}
                      </p>
                    )}
                    <button
                      type="submit"
                      disabled={authBusy}
                      className="min-h-[48px] w-full rounded-[12px] text-sm font-medium text-white disabled:opacity-50"
                      style={{ background: "#DB200D" }}
                    >
                      {authBusy ? "Signing in…" : "Sign in"}
                    </button>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (user && authRecoveryMode) {
    return (
      <div
        style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}
        className="flex items-center justify-center px-4 py-10"
      >
        <div className="w-full max-w-[440px]">
          <form
            onSubmit={handleUpdatePasswordRecovery}
            className="space-y-3 rounded-[16px] border p-6"
            style={{ borderColor: "var(--divider)", background: "var(--surface)" }}
          >
            <h1 className="text-[24px] font-semibold">Set a new password</h1>
            <input
              type="password"
              value={authNewPassword}
              onChange={(e) => setAuthNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
              minLength={8}
              className="h-[48px] w-full rounded-[12px] border px-3.5 text-[15px]"
              style={{ borderColor: "var(--divider)", background: "var(--input)" }}
            />
            <input
              type="password"
              value={authNewConfirm}
              onChange={(e) => setAuthNewConfirm(e.target.value)}
              placeholder="Repeat password"
              required
              className="h-[48px] w-full rounded-[12px] border px-3.5 text-[15px]"
              style={{ borderColor: "var(--divider)", background: "var(--input)" }}
            />
            <button
              type="submit"
              disabled={authBusy}
              className="min-h-[48px] w-full rounded-[12px] text-sm font-medium text-white"
              style={{ background: "#DB200D" }}
            >
              {authBusy ? "Saving…" : "Save new password"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ============================================================================
  // MAIN WORKSPACE: Warm Editorial Left Canvas + Persistent Right Desk
  // ============================================================================
  return (
    <div
      data-safe-area-inset-root
      style={{
        boxSizing: "border-box",
        paddingTop: "var(--safe-area-inset-top)",
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--text)",
      }}
      className="overflow-x-clip"
    >
      <header
        data-safe-area-sticky-top
        style={{
          top: "var(--safe-area-inset-top)",
          background: "var(--bg)",
          borderColor: "var(--divider)",
        }}
        className="sticky z-30 border-b"
      >
        <div className="flex w-full items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span
              className="h-[10px] w-[10px] shrink-0 rounded-[2px]"
              style={{ background: "#DB200D" }}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="truncate text-[19px] font-medium leading-none tracking-[-0.01em]">
                Reach
              </p>
              <p className="mt-1 hidden truncate text-xs sm:block" style={{ color: "var(--muted)" }}>
                Outreach, curated.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                changeTheme(
                  themeMode === "system" ? "light" : themeMode === "light" ? "dark" : "system"
                )
              }
              aria-label={`Theme: ${themeMode}. Tap to change theme.`}
              title={`Theme: ${themeMode}`}
              className="btn-press flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[12px] border"
              style={{ borderColor: "var(--divider)" }}
            >
              {themeMode === "dark" ? (
                <Moon size={17} />
              ) : themeMode === "light" ? (
                <Sun size={17} />
              ) : (
                <Monitor size={17} />
              )}
            </button>
            <button
              onClick={exportCSV}
              className="btn-press hidden min-h-[44px] items-center gap-2 rounded-[12px] border px-3.5 text-sm font-medium lg:flex"
              style={{ borderColor: "var(--divider)" }}
            >
              <Download size={16} />
              <span>Export</span>
            </button>
            <button
              onClick={() => openAdd()}
              className="btn-press hidden min-h-[44px] items-center gap-2 rounded-[12px] px-4 text-sm font-medium text-white lg:flex"
              style={{ background: "#DB200D" }}
            >
              <Plus size={17} /> Add contact
            </button>
            {isDesktop ? (
              <button
                onClick={() => openSettings("profile")}
                aria-label="Open settings"
                title="Settings"
                className="flex min-h-[44px] items-center gap-2"
              >
                {profile.avatarUrl ? (
                  <img
                    src={profile.avatarUrl}
                    alt=""
                    className="h-[44px] w-[44px] shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span
                    className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full text-[16px] font-semibold"
                    style={{ background: "#0D0D0C", color: "#F0EBE7" }}
                    aria-hidden="true"
                  >
                    {headerInitials}
                  </span>
                )}
                {profile.name ? (
                  <span className="hidden max-w-[120px] truncate text-sm font-medium md:inline">
                    {profile.name}
                  </span>
                ) : null}
              </button>
            ) : (
              <span className="flex min-h-[44px] items-center" aria-hidden="true">
                {profile.avatarUrl ? (
                  <img
                    src={profile.avatarUrl}
                    alt=""
                    className="h-[44px] w-[44px] shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span
                    className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full text-[16px] font-semibold"
                    style={{ background: "#0D0D0C", color: "#F0EBE7" }}
                  >
                    {headerInitials}
                  </span>
                )}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="flex w-full max-w-none items-stretch px-4 sm:px-6 lg:px-8">
        <section
          className="flex min-w-0 flex-1 flex-col py-6 pr-0 lg:pr-6"
          style={{ minHeight: "calc(100vh - 69px)", paddingBottom: !isDesktop ? 110 : undefined }}
        >
          <div className="px-0 pt-3 lg:pt-0">
            <p className="small-caps" style={{ color: "var(--muted)" }}>
              Your outreach
            </p>
            <h1 className="mt-2 text-[34px] font-semibold leading-[1.02] tracking-[-0.025em] sm:text-[clamp(30px,4vw,44px)]">
              Every conversation,
              <br /> held with care.
            </h1>
            <p
              className="mt-3 max-w-[560px] text-[15px] leading-relaxed"
              style={{ color: "var(--muted)" }}
            >
              Track who you reached out to, what was said, and what comes next — without losing the
              human thread.
            </p>

            {/* Paste-to-Contact Bar: supports "@handle" or "@handle — why them" */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handlePasteAdd();
              }}
              className="mt-5 flex max-w-[560px] gap-2"
            >
              <input
                ref={pasteInputRef}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste @handle, link, or @handle — what caught your eye"
                aria-label="Paste handle, link, or name"
                className="h-[48px] flex-1 rounded-[12px] border px-3.5 text-[15px]"
                style={{ borderColor: "var(--divider)", background: "var(--input)" }}
              />
              <button
                type="submit"
                disabled={!pasteText.trim()}
                className="btn-press min-h-[48px] shrink-0 rounded-[12px] px-4 text-sm font-medium text-white disabled:opacity-50"
                style={{ background: "var(--brand)" }}
              >
                Add to To-Reach
              </button>
            </form>
            {pasteText.trim() &&
              (() => {
                const pv = parsePasteToContact(pasteText.trim());
                return pv.name ? (
                  <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
                    Preview: <b style={{ color: "var(--text)" }}>{pv.name}</b> •{" "}
                    {pv.channel || "Add channel"} • {pv.link || "No link yet"}
                    {pv.whyThem ? ` • Why: "${pv.whyThem}"` : ""}
                  </p>
                ) : null;
              })()}

            {/* Today's 3 Focus Card */}
            {todaysThree.length > 0 && (
              <div
                className="mt-5 max-w-[560px] rounded-[16px] border p-4"
                style={{ borderColor: "var(--divider)", background: "var(--surface)" }}
              >
                <div className="flex items-center justify-between">
                  <p className="small-caps" style={{ color: "var(--muted)" }}>
                    Do this next • Today&apos;s 3
                  </p>
                  {streak > 0 && (
                    <span className="text-xs font-medium" style={{ color: "var(--brand)" }}>
                      {streak} done today
                    </span>
                  )}
                </div>
                <div className="mt-3 space-y-2">
                  {todaysThree.map((item) => (
                    <div key={item.contact.id} className="flex items-center gap-3">
                      <span
                        className="shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium"
                        style={{ borderColor: "var(--divider)", color: "var(--muted)" }}
                      >
                        {item.kind}
                      </span>
                      <button
                        onClick={() => selectContact(item.contact.id)}
                        className="min-w-0 flex-1 truncate text-left text-sm font-medium"
                      >
                        {item.contact.value.name}
                      </button>
                      <button
                        onClick={() => markTodayDone(item.contact.id)}
                        className="btn-press min-h-[32px] shrink-0 rounded-full px-3 text-xs font-medium text-white"
                        style={{ background: "var(--brand)" }}
                      >
                        Mark done
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {!isDesktop && (
            <div className="mt-6 px-0">
              <div
                className="rounded-[16px] border"
                style={{ borderColor: "var(--divider)", background: "var(--surface)" }}
              >
                <button
                  onClick={() => {
                    setPanelOpen(true);
                    setMinimized(false);
                    setSelectedId(null);
                  }}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <span className="small-caps" style={{ color: "var(--muted)" }}>
                    Overview
                  </span>
                  <span className="text-xs font-medium" style={{ color: "var(--muted)" }}>
                    Open overview →
                  </span>
                </button>
                <div className="grid grid-cols-3 border-t" style={{ borderColor: "var(--divider)" }}>
                  {(
                    [
                      { label: "Today", value: counts.outreachToday },
                      { label: "Needs follow-up", value: counts.needsFollowUp },
                      { label: "Replied", value: counts.replied },
                    ] as const
                  ).map((row, i) => (
                    <div
                      key={row.label}
                      className={`min-h-[64px] px-1 py-3 text-center ${i > 0 ? "border-l" : ""}`}
                      style={{ borderColor: "var(--divider)" }}
                    >
                      <span className="block text-[22px] font-semibold leading-none tracking-[-0.01em]">
                        {row.value}
                      </span>
                      <span
                        className="small-caps mt-1.5 block leading-tight"
                        style={{ color: "var(--muted)" }}
                      >
                        {row.label}
                      </span>
                    </div>
                  ))}
                </div>
                <p
                  className="truncate px-4 pb-3 pt-3 text-[13px] leading-relaxed"
                  title={focusLine}
                  style={{ color: "var(--muted)" }}
                >
                  {focusLine}
                </p>
              </div>
            </div>
          )}

          {/* Search & Filter Pills */}
          <div className="mt-6 flex flex-col gap-3 px-0 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search
                size={17}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2"
                style={{ color: "var(--muted)" }}
              />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, notes, or link… (/)"
                aria-label="Search contacts"
                className="h-[48px] w-full rounded-[12px] border pl-10 pr-10 text-[15px]"
                style={{ borderColor: "var(--divider)", background: "var(--input)" }}
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 flex h-[32px] w-[32px] -translate-y-1/2 items-center justify-center rounded-full"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <div
              className="flex gap-1 overflow-x-auto no-scrollbar"
              role="tablist"
              aria-label="Filter contacts"
            >
              {(
                [
                  { v: "all", label: "All" },
                  { v: "to-reach", label: "To reach" },
                  { v: "replied", label: "Replied" },
                  { v: "followed", label: "Followed up" },
                ] as const
              ).map((f) => (
                <button
                  key={f.v}
                  role="tab"
                  aria-selected={filter === f.v}
                  onClick={() => {
                    setFilter(f.v);
                    setActiveFocus(null);
                  }}
                  className="btn-press h-[40px] shrink-0 rounded-full px-3.5 text-sm font-medium"
                  style={
                    filter === f.v
                      ? { background: "var(--text)", color: "var(--bg)" }
                      : { color: "var(--muted)" }
                  }
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <p className="mt-4 px-0 text-sm" style={{ color: "var(--muted)" }} aria-live="polite">
            {counts.total} {counts.total === 1 ? "contact" : "contacts"} • {counts.replied} replied •{" "}
            {counts.followed} followed up
          </p>

          {activeFocus && (
            <div className="mt-3 flex flex-wrap items-center gap-2 px-0">
              <span
                className="inline-flex min-h-[32px] items-center rounded-full px-3 text-xs font-medium"
                style={{ background: "var(--text)", color: "var(--bg)" }}
              >
                Showing: {activeFocus}
              </span>
              <button
                onClick={() => {
                  setActiveFocus(null);
                  setFilter("all");
                }}
                className="min-h-[32px] rounded-full border px-3 text-xs font-medium"
                style={{ borderColor: "var(--divider)" }}
              >
                Clear
              </button>
            </div>
          )}

          {loadError && (
            <div
              className="mx-0 mt-4 flex items-start gap-3 rounded-[12px] border p-4"
              style={{ borderColor: "var(--divider)" }}
            >
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Couldn’t reach your saved contacts.</p>
                <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                  {loadError}
                </p>
                <button
                  onClick={loadAll}
                  className="mt-3 min-h-[40px] rounded-[10px] border px-3 text-sm font-medium"
                  style={{ borderColor: "var(--divider)" }}
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          <div className="mt-3 border-t" style={{ borderColor: "var(--divider)" }}>
            {loading ? (
              <div className="py-4 space-y-3">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="flex h-[56px] items-center justify-between border-b px-4"
                    style={{ borderColor: "var(--divider)" }}
                  >
                    <div className="skeleton h-4 w-[180px]" />
                    <div className="skeleton h-4 w-[140px]" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              contacts.length === 0 && !search && filter === "all" ? (
                <div className="px-4 py-16 text-center sm:py-20">
                  <p className="text-[26px] font-medium tracking-[-0.01em]">
                    No one on your list yet.
                  </p>
                  <p
                    className="mx-auto mt-3 max-w-[420px] leading-relaxed"
                    style={{ color: "var(--muted)" }}
                  >
                    Start with someone whose work you loved — add why them, what you’d send, and what
                    comes next. Reach keeps the human thread.
                  </p>
                  <button
                    onClick={() => openAdd()}
                    className="btn-press mt-6 inline-flex min-h-[46px] items-center gap-2 rounded-[12px] px-5 text-sm font-medium text-white"
                    style={{ background: "#DB200D" }}
                  >
                    <Plus size={17} /> Add contact
                  </button>
                </div>
              ) : (
                <div className="px-4 py-14 text-center">
                  <p className="text-xl font-medium">No matches</p>
                  <p className="mt-2" style={{ color: "var(--muted)" }}>
                    Try a different search or filter.
                  </p>
                  <button
                    onClick={() => {
                      setSearch("");
                      setFilter("all");
                    }}
                    className="mt-5 min-h-[44px] rounded-[12px] border px-4 text-sm font-medium"
                    style={{ borderColor: "var(--divider)" }}
                  >
                    Clear search &amp; filters
                  </button>
                </div>
              )
            ) : (
              filtered.map((c) => {
                const isSel = c.id === selectedId;
                const norm = displayLink(c);
                const _daysAgo = c.value.outreachDate
                  ? Math.floor(
                      (new Date(`${todayISO()}T12:00:00`).getTime() -
                        new Date(`${c.value.outreachDate}T12:00:00`).getTime()) /
                        86400000
                    )
                  : -1;
                const _stage =
                  c.value.stage || stageFromLegacy(c.value.replied, c.value.followedUp);
                const _isDue = isFollowUpDue(c.value, todayISO());
                const _isDueToday =
                  c.value.followUpDate === todayISO() ||
                  (!c.value.replied && _daysAgo === 0 && _stage === "to-reach");

                return (
                  <article
                    key={c.id}
                    onClick={() => selectContact(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        selectContact(c.id);
                      }
                    }}
                    tabIndex={0}
                    aria-label={`Open details for ${c.value.name}`}
                    className="relative cursor-pointer px-4 py-[14px] transition-colors sm:px-5"
                    style={{
                      background: isSel ? "var(--tint)" : "transparent",
                      borderBottom: "1px solid var(--divider)",
                    }}
                  >
                    <div className="flex flex-col gap-1 lg:grid lg:items-center lg:gap-4 lg:grid-cols-[minmax(200px,1.5fr)_minmax(180px,1.1fr)_88px_76px]">
                      <div className="min-w-0">
                        <h3
                          className="truncate text-[16px]"
                          style={{ lineHeight: 1.3, fontWeight: isSel ? 600 : 500 }}
                        >
                          {c.value.name}
                        </h3>
                        <p
                          className="truncate text-[13px]"
                          style={{ color: "var(--muted)", lineHeight: 1.3 }}
                        >
                          {c.value.channel || "—"} <span className="mx-1">•</span>{" "}
                          {c.value.outreachDate ? formatDate(c.value.outreachDate) : "—"}
                        </p>
                        <span className="mt-1.5 flex flex-wrap gap-1.5">
                          <span
                            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
                            style={{ background: "var(--tint)", color: "var(--text)" }}
                          >
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{
                                background: STAGES.find((s) => s.value === _stage)?.dot,
                              }}
                            />
                            {stageLabel(c.value.stage)}
                          </span>
                          {c.value.workType && (
                            <span
                              className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium"
                              style={{ borderColor: "var(--divider)", color: "var(--muted)" }}
                            >
                              {workTypeLabel(c.value.workType)}
                            </span>
                          )}
                          {_isDue && (
                            <span
                              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
                              style={{ background: "#FFF0EE", color: "#DB200D" }}
                            >
                              Follow-up due {_daysAgo >= 0 ? `• ${_daysAgo}d` : ""}
                            </span>
                          )}
                          {_isDueToday && (
                            <span
                              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
                              style={{ background: "#FFF8E1", color: "#8A6D00" }}
                            >
                              Due today
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p
                          className="truncate text-left text-sm"
                          title={c.value.nextStep || c.value.contactDetails || undefined}
                          style={{
                            lineHeight: 1.3,
                            color:
                              c.value.nextStep || c.value.contactDetails
                                ? undefined
                                : "var(--muted)",
                          }}
                        >
                          {c.value.nextStep || c.value.contactDetails || "—"}
                        </p>
                        {c.value.whyThem && (
                          <p
                            className="truncate text-left text-[12px]"
                            style={{ color: "var(--muted)" }}
                          >
                            {c.value.whyThem}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-3 lg:contents">
                        <div className="min-w-0 text-left">
                          {norm ? (
                            <a
                              href={norm}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="flex h-8 items-center gap-1 whitespace-nowrap text-sm font-medium"
                              style={{ color: "var(--brand)", lineHeight: 1.3 }}
                            >
                              Link <ExternalLink size={13} />
                            </a>
                          ) : (
                            <span
                              className="flex h-8 items-center text-sm"
                              style={{ color: "var(--muted)", lineHeight: 1.3 }}
                            >
                              —
                            </span>
                          )}
                        </div>
                        <div
                          className="flex shrink-0 items-center justify-end gap-2 lg:w-[76px]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => openEdit(c)}
                            aria-label={`Edit ${c.value.name}`}
                            title={`Edit ${c.value.name}`}
                            className="flex h-8 w-8 items-center justify-center rounded-[8px]"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={() => triggerArchive(c)}
                            aria-label={`Archive ${c.value.name}`}
                            title={`Archive ${c.value.name}`}
                            className="flex h-8 w-8 items-center justify-center rounded-[8px]"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
          <footer className="mt-auto px-0 pt-8 pb-2 text-xs" style={{ color: "var(--muted)" }}>
            {counts.total} {counts.total === 1 ? "contact" : "contacts"} • Data saved to your
            private account
          </footer>
        </section>

        {/* Persistent Right-Hand Studio Desk (Overview when idle, Contact Dossier when selected) */}
        {isDesktop && (
          <aside
            aria-label={selected ? "Contact details" : "Overview"}
            className="relative sticky flex shrink-0 flex-col border-l self-stretch"
            style={{
              top: "calc(var(--safe-area-inset-top) + 69px)",
              minHeight: "calc(100vh - var(--safe-area-inset-top) - 69px)",
              width: minimized ? 56 : panelWidth,
              borderColor: "var(--divider)",
              background: "var(--bg)",
            }}
          >
            {!minimized && (
              <>
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize details panel"
                  tabIndex={0}
                  onMouseDown={startResize}
                  className="absolute bottom-0 left-0 top-0 z-10 flex w-[12px] -translate-x-[6px] cursor-ew-resize items-center justify-center opacity-0 hover:opacity-100 focus:opacity-100"
                >
                  <span
                    className="flex h-[44px] w-[8px] items-center justify-center rounded-full"
                    style={{ background: "var(--divider)" }}
                  >
                    <GripVertical size={12} style={{ color: "var(--muted)" }} />
                  </span>
                </div>
                {panelHeader}
                {selected ? (
                  <div key={selected.id} className="animate-swap flex min-h-0 flex-1 flex-col">
                    {panelContent}
                  </div>
                ) : (
                  <div className="flex min-h-0 flex-1 flex-col">{emptyPanel}</div>
                )}
              </>
            )}
            {minimized && (
              <div className="flex min-h-0 flex-1 flex-col items-center gap-4 py-4">
                <button
                  onClick={() => setMinimized(false)}
                  className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-[10px]"
                  aria-label="Expand details"
                >
                  <ChevronUp size={18} className="-rotate-90" />
                </button>
                <span
                  className="small-caps"
                  style={{ color: "var(--muted)", writingMode: "vertical-rl" }}
                >
                  {selected ? "Details" : "Overview"}
                </span>
              </div>
            )}
          </aside>
        )}
      </main>

      {/* Mobile / Tablet Bottom Pill Bar */}
      {!isDesktop && !settingsOpen && !modal && !showDeleteAll && (
        <nav
          aria-label="Navigation"
          className="fixed bottom-4 left-1/2 z-40 flex w-[calc(100vw-32px)] max-w-[420px] -translate-x-1/2 items-center justify-between rounded-full border px-2 py-2"
          style={{
            background: "var(--surface)",
            borderColor: "var(--divider)",
            boxShadow: "var(--shadow)",
          }}
        >
          <button
            onClick={() => {
              setFilter("all");
              setActiveFocus(null);
              setPanelOpen(false);
              setSelectedId(null);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="flex min-w-[72px] flex-col items-center gap-0.5 rounded-full px-3 py-1.5"
            style={
              !panelOpen
                ? { background: "var(--text)", color: "var(--bg)" }
                : { color: "var(--muted)" }
            }
          >
            <Home size={20} />
            <span className="text-[11px] font-medium">Contacts</span>
          </button>
          <button
            onClick={() => {
              setPanelOpen(true);
              setMinimized(false);
              setSelectedId(null);
            }}
            className="flex min-w-[72px] flex-col items-center gap-0.5 rounded-full px-3 py-1.5"
            style={
              panelOpen && !selected
                ? { background: "var(--text)", color: "var(--bg)" }
                : { color: "var(--muted)" }
            }
          >
            <LayoutGrid size={20} />
            <span className="text-[11px] font-medium">Overview</span>
          </button>
          <button
            onClick={() => openAdd()}
            aria-label="Add contact"
            className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full text-white"
            style={{ background: "#DB200D" }}
          >
            <Plus size={24} />
          </button>
          <button
            onClick={() => openSettings("profile")}
            aria-label="Open settings"
            className="flex min-w-[72px] flex-col items-center gap-0.5 rounded-full px-3 py-1.5"
            style={{ color: "var(--muted)" }}
          >
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt=""
                className="h-[24px] w-[24px] rounded-full object-cover"
              />
            ) : (
              <span
                className="flex h-[24px] w-[24px] items-center justify-center rounded-full text-[11px] font-semibold"
                style={{ background: "#0D0D0C", color: "#F0EBE7" }}
              >
                {headerInitials}
              </span>
            )}
            <span className="text-[11px] font-medium">You</span>
          </button>
        </nav>
      )}

      {isTablet && panelOpen && !minimized && (
        <div
          className="fixed inset-0 z-40 flex justify-end"
          role="dialog"
          aria-modal="true"
        >
          <button
            aria-label="Close"
            onClick={closePanel}
            className="absolute inset-0 bg-black/30"
          />
          <aside
            className="animate-fade relative flex w-[min(520px,92vw)] flex-col"
            style={{ background: "var(--surface)" }}
          >
            {panelHeader}
            {selected ? (
              <div key={selected.id} className="animate-swap flex min-h-0 flex-1 flex-col">
                {panelContent}
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">{emptyPanel}</div>
            )}
          </aside>
        </div>
      )}

      {isMobile && panelOpen && !minimized && (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true">
          <button
            aria-label="Close"
            onClick={closePanel}
            className="absolute inset-0 bg-black/30"
          />
          <section
            className="absolute inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-[16px]"
            style={{ height: `${sheetPct}vh`, background: "var(--surface)" }}
          >
            <div
              onPointerDown={startSheetDrag}
              className="flex shrink-0 cursor-grab flex-col items-center gap-1 pt-2.5 pb-1"
            >
              <span
                className="h-[4px] w-[40px] rounded-full"
                style={{ background: "var(--divider)" }}
              />
            </div>
            {panelHeader}
            {selected ? (
              <div key={selected.id} className="animate-swap flex min-h-0 flex-1 flex-col">
                {panelContent}
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">{emptyPanel}</div>
            )}
          </section>
        </div>
      )}

      {/* Settings Dialog */}
      {settingsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Settings"
        >
          <button
            aria-label="Close settings"
            onClick={() => setSettingsOpen(false)}
            className="absolute inset-0 bg-black/35"
          />
          <div
            className="animate-fade relative flex max-h-[88vh] w-full max-w-[620px] flex-col overflow-hidden rounded-t-[24px] sm:rounded-[24px]"
            style={{ background: "var(--surface)", boxShadow: "var(--shadow)" }}
          >
            <div className="flex shrink-0 items-start justify-between gap-4 px-5 pt-5 sm:px-6 sm:pt-6">
              <div>
                <p className="small-caps" style={{ color: "var(--muted)" }}>
                  Settings
                </p>
                <h2 className="mt-1 text-[20px] font-semibold leading-tight">Studio Settings</h2>
              </div>
              <button
                onClick={() => setSettingsOpen(false)}
                className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-[10px]"
              >
                <X size={19} />
              </button>
            </div>
            <div
              className="mx-5 mt-4 flex shrink-0 gap-1 rounded-full border p-1 sm:mx-6"
              style={{ borderColor: "var(--divider)", background: "var(--bg-soft)" }}
              role="tablist"
            >
              {(["profile", "shortcuts", "account"] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={settingsTab === t}
                  onClick={() => setSettingsTab(t)}
                  className="min-h-[40px] flex-1 rounded-full px-4 text-sm font-medium"
                  style={
                    settingsTab === t
                      ? { background: "var(--text)", color: "var(--bg)" }
                      : { color: "var(--muted)" }
                  }
                >
                  {t === "profile" ? "Profile" : t === "shortcuts" ? "Shortcuts" : "Account"}
                </button>
              ))}
            </div>
            <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6">
              {settingsTab === "profile" ? (
                <div className="pt-5">
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleAvatarFile(f);
                      e.target.value = "";
                    }}
                  />
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {profileDraft.avatarUrl ? (
                        <img
                          src={profileDraft.avatarUrl}
                          alt="Your profile photo"
                          className="h-[56px] w-[56px] shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <span
                          className="flex h-[56px] w-[56px] shrink-0 items-center justify-center rounded-full text-[20px] font-semibold"
                          style={{ background: "#0D0D0C", color: "#F0EBE7" }}
                        >
                          {draftInitials}
                        </span>
                      )}
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => avatarInputRef.current?.click()}
                          disabled={avatarUploading}
                          className="min-h-[36px] rounded-full border px-4 text-sm font-medium"
                          style={{ borderColor: "var(--divider)" }}
                        >
                          {avatarUploading
                            ? "Uploading…"
                            : profileDraft.avatarUrl
                            ? "Change photo"
                            : "Upload photo"}
                        </button>
                        {profileDraft.avatarUrl && (
                          <button
                            onClick={handleRemoveAvatar}
                            className="min-h-[28px] text-xs font-medium underline underline-offset-4"
                            style={{ color: "var(--muted)" }}
                          >
                            Remove photo
                          </button>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={saveProfile}
                      className="btn-press flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full px-5 text-sm font-medium text-white"
                      style={{ background: "#DB200D" }}
                    >
                      <Check size={15} /> Save
                    </button>
                  </div>

                  <div className="mt-6 grid grid-cols-2 gap-3">
                    <div
                      className="rounded-[20px] border p-4"
                      style={{ borderColor: "var(--divider)" }}
                    >
                      <p className="text-[13px]" style={{ color: "var(--muted)" }}>
                        Contacts
                      </p>
                      <p className="mt-2 text-[28px] font-semibold leading-none">{counts.total}</p>
                      <div className="mt-4 flex items-center justify-between">
                        <span
                          className="flex h-[32px] w-[32px] items-center justify-center rounded-full"
                          style={{ background: "var(--tint)" }}
                        >
                          <Users size={16} />
                        </span>
                        <span
                          className="rounded-full border px-2.5 py-1 text-xs font-medium"
                          style={{ borderColor: "var(--divider)", color: "var(--muted)" }}
                        >
                          Total
                        </span>
                      </div>
                    </div>
                    <div
                      className="rounded-[20px] border p-4"
                      style={{ borderColor: "var(--divider)" }}
                    >
                      <p className="text-[13px]" style={{ color: "var(--muted)" }}>
                        Replied
                      </p>
                      <p className="mt-2 text-[28px] font-semibold leading-none">
                        {counts.replied}
                      </p>
                      <div className="mt-4 flex items-center justify-between">
                        <span
                          className="flex h-[32px] w-[32px] items-center justify-center rounded-full"
                          style={{ background: "var(--tint)" }}
                        >
                          <Check size={16} />
                        </span>
                        <span
                          className="rounded-full border px-2.5 py-1 text-xs font-medium"
                          style={{ borderColor: "var(--divider)", color: "var(--muted)" }}
                        >
                          {counts.total > 0
                            ? `${Math.round((counts.replied / counts.total) * 100)}%`
                            : "0%"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6">
                    <label
                      htmlFor="profile-name"
                      className="small-caps block"
                      style={{ color: "var(--muted)" }}
                    >
                      Name
                    </label>
                    <input
                      id="profile-name"
                      value={profileDraft.name}
                      onChange={(e) => setProfileDraft((d) => ({ ...d, name: e.target.value }))}
                      placeholder="Your name or studio"
                      className="mt-2 h-[48px] w-full rounded-[12px] border px-3.5 text-[15px]"
                      style={{ borderColor: "var(--divider)", background: "var(--input)" }}
                    />
                  </div>

                  <div
                    className="mt-6 rounded-[20px] border p-4"
                    style={{ borderColor: "var(--divider)", background: "var(--bg-soft)" }}
                  >
                    <p className="small-caps" style={{ color: "var(--muted)" }}>
                      Your pitch card — how you show up
                    </p>
                    <div className="mt-4 space-y-3">
                      <div>
                        <label className="small-caps block" style={{ color: "var(--muted)" }}>
                          What I do
                        </label>
                        <input
                          value={profileDraft.whatIDo || ""}
                          onChange={(e) =>
                            setProfileDraft((d) => ({ ...d, whatIDo: e.target.value }))
                          }
                          placeholder="Visual designer — branding, editorial, social"
                          className="mt-2 h-[48px] w-full rounded-[12px] border px-3.5 text-[15px]"
                          style={{ borderColor: "var(--divider)", background: "var(--input)" }}
                        />
                      </div>
                      <div>
                        <label className="small-caps block" style={{ color: "var(--muted)" }}>
                          Open for
                        </label>
                        <input
                          value={profileDraft.openFor || ""}
                          onChange={(e) =>
                            setProfileDraft((d) => ({ ...d, openFor: e.target.value }))
                          }
                          placeholder="Branding for studios, editorial collabs…"
                          className="mt-2 h-[48px] w-full rounded-[12px] border px-3.5 text-[15px]"
                          style={{ borderColor: "var(--divider)", background: "var(--input)" }}
                        />
                      </div>
                      <div>
                        <label className="small-caps block" style={{ color: "var(--muted)" }}>
                          Featured work
                        </label>
                        <input
                          value={profileDraft.featuredLink || ""}
                          onChange={(e) =>
                            setProfileDraft((d) => ({ ...d, featuredLink: e.target.value }))
                          }
                          placeholder="https://your-portfolio.com/best-work"
                          className="mt-2 h-[48px] w-full rounded-[12px] border px-3.5 text-[15px]"
                          style={{ borderColor: "var(--divider)", background: "var(--input)" }}
                        />
                      </div>
                    </div>
                  </div>

                  <div id="profile-socials" className="mt-8">
                    <h3 className="text-[16px] font-semibold">Link social accounts</h3>
                    <div className="mt-4 space-y-3">
                      {profileDraft.socials.map((s) =>
                        s.custom ? (
                          <div
                            key={s.id}
                            className="space-y-2 rounded-[16px] border p-3"
                            style={{ borderColor: "var(--divider)" }}
                          >
                            <div className="flex gap-2">
                              <input
                                value={s.platform}
                                onChange={(e) => updateSocial(s.id, "platform", e.target.value)}
                                placeholder="Platform name"
                                className="h-[44px] flex-1 rounded-[12px] border px-3.5 text-[15px]"
                                style={{
                                  borderColor: "var(--divider)",
                                  background: "var(--input)",
                                }}
                              />
                              <button
                                onClick={() => removeCustomSocial(s.id)}
                                className="rounded-[10px] border px-3 text-sm font-medium"
                                style={{ borderColor: "var(--divider)", color: "var(--muted)" }}
                              >
                                Remove
                              </button>
                            </div>
                            <input
                              value={s.value}
                              onChange={(e) => updateSocial(s.id, "value", e.target.value)}
                              placeholder="@handle or https://..."
                              className="h-[44px] w-full rounded-[12px] border px-3.5 text-[15px]"
                              style={{ borderColor: "var(--divider)", background: "var(--input)" }}
                            />
                          </div>
                        ) : (
                          <div
                            key={s.id}
                            className="rounded-[16px] border p-3"
                            style={{ borderColor: "var(--divider)" }}
                          >
                            <label className="small-caps block" style={{ color: "var(--muted)" }}>
                              {s.platform}
                            </label>
                            <input
                              value={s.value}
                              onChange={(e) => updateSocial(s.id, "value", e.target.value)}
                              placeholder={socialPlaceholder(s.platform)}
                              className="mt-2 h-[44px] w-full rounded-[12px] border px-3.5 text-[15px]"
                              style={{ borderColor: "var(--divider)", background: "var(--input)" }}
                            />
                          </div>
                        )
                      )}
                    </div>
                    <button
                      onClick={addCustomSocial}
                      className="mt-4 min-h-[40px] rounded-[10px] border px-4 text-sm font-medium"
                      style={{ borderColor: "var(--divider)" }}
                    >
                      + Add another
                    </button>
                    {linkedSocials.length > 0 && (
                      <div
                        className="mt-6 rounded-[20px] border p-4"
                        style={{ borderColor: "var(--divider)" }}
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full"
                            style={{ background: "var(--tint)" }}
                          >
                            <AtSign size={17} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[15px] font-semibold">Linked accounts</p>
                            <ul className="mt-3 space-y-2">
                              {linkedSocials.map((s) => (
                                <li
                                  key={s.id}
                                  className="flex items-center justify-between gap-3 border-t py-2.5"
                                  style={{ borderColor: "var(--divider)" }}
                                >
                                  <span className="text-sm font-medium">{s.platform}</span>
                                  <a
                                    href={socialHref(s.platform, s.value)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="truncate text-sm font-medium underline"
                                    style={{ color: "var(--brand)" }}
                                  >
                                    {socialDisplay(s.platform, s.value)}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-8 flex gap-2">
                    <button
                      onClick={() => setSettingsOpen(false)}
                      className="min-h-[46px] flex-1 rounded-[12px] border text-sm font-medium"
                      style={{ borderColor: "var(--divider)" }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveProfile}
                      className="btn-press min-h-[46px] flex-1 rounded-[12px] text-sm font-medium text-white"
                      style={{ background: "#DB200D" }}
                    >
                      Save profile
                    </button>
                  </div>
                </div>
              ) : settingsTab === "shortcuts" ? (
                <div className="pt-2">
                  <p className="mt-4 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                    Shortcuts pause while typing. Press Esc while typing to blur the field, then
                    shortcuts work again.
                  </p>
                  {SHORTCUT_GROUPS.map((g) => (
                    <div key={g.group} className="mt-7">
                      <p className="small-caps" style={{ color: "var(--muted)" }}>
                        {g.group}
                      </p>
                      <div className="mt-2 border-t" style={{ borderColor: "var(--divider)" }}>
                        {g.items.map((item) => {
                          const isCapturing = capturing === item.action;
                          return (
                            <div
                              key={item.action}
                              className="flex min-h-[48px] items-center justify-between gap-3 border-b py-2"
                              style={{ borderColor: "var(--divider)" }}
                            >
                              <span className="min-w-0 text-sm">{item.label}</span>
                              <span className="flex shrink-0 items-center gap-2">
                                <span
                                  className="inline-flex min-h-[28px] items-center rounded-full border px-2.5 text-xs font-medium"
                                  style={{
                                    borderColor: "var(--divider)",
                                    color: "var(--muted)",
                                  }}
                                >
                                  {isCapturing
                                    ? "Press a key…"
                                    : displayShortcut(shortcuts[item.action])}
                                </span>
                                <button
                                  onClick={() =>
                                    setCapturing(isCapturing ? null : item.action)
                                  }
                                  className="min-h-[32px] rounded-full border px-3 text-xs font-medium"
                                  style={{ borderColor: "var(--divider)" }}
                                >
                                  {isCapturing ? "Cancel" : "Change"}
                                </button>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <div className="mt-6 flex gap-2">
                    <button
                      onClick={resetShortcuts}
                      className="min-h-[46px] flex-1 rounded-[12px] border text-sm font-medium"
                      style={{ borderColor: "var(--divider)" }}
                    >
                      Reset to defaults
                    </button>
                    <button
                      onClick={saveShortcuts}
                      className="btn-press min-h-[46px] flex-1 rounded-[12px] text-sm font-medium text-white"
                      style={{ background: "#DB200D" }}
                    >
                      Save shortcuts
                    </button>
                  </div>
                </div>
              ) : (
                <div className="pt-6">
                  <h3 className="text-[16px] font-semibold">Account</h3>
                  <div className="mt-5">
                    <p className="small-caps" style={{ color: "var(--muted)" }}>
                      Appearance
                    </p>
                    <div
                      className="mt-2 flex rounded-[12px] border p-1"
                      style={{ borderColor: "var(--divider)", background: "var(--bg-soft)" }}
                    >
                      {(
                        [
                          { v: "system", label: "System" },
                          { v: "light", label: "Light" },
                          { v: "dark", label: "Dark" },
                        ] as const
                      ).map(({ v, label }) => (
                        <button
                          key={v}
                          onClick={() => changeTheme(v)}
                          className="min-h-[40px] flex-1 rounded-[9px] px-2 text-sm font-medium"
                          style={
                            themeMode === v
                              ? { background: "var(--text)", color: "var(--bg)" }
                              : { color: "var(--muted)" }
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div
                    className="mt-5 rounded-[12px] border p-4"
                    style={{ borderColor: "var(--divider)" }}
                  >
                    <p className="small-caps" style={{ color: "var(--muted)" }}>
                      Signed in as
                    </p>
                    <p className="mt-2 truncate text-[15px] font-medium">
                      {user?.email || "Signed in"}
                    </p>
                  </div>
                  <div className="mt-4 flex flex-col gap-2">
                    <button
                      onClick={handleSignOut}
                      className="min-h-[46px] w-full rounded-[12px] border text-sm font-medium"
                      style={{ borderColor: "var(--divider)" }}
                    >
                      Sign out
                    </button>
                    <button
                      onClick={() => {
                        setSettingsOpen(false);
                        setShowDeleteAll(true);
                      }}
                      className="min-h-[46px] w-full rounded-[12px] border text-sm font-medium"
                      style={{ borderColor: "var(--divider)", color: "#DB200D" }}
                    >
                      Delete all my data…
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Full Add / Edit Contact Modal */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <button
            aria-label="Close dialog"
            onClick={() => !busy && setModal(null)}
            className="absolute inset-0 bg-black/35"
          />
          <div
            ref={formRef}
            className="animate-fade relative flex max-h-[88vh] w-full max-w-[620px] flex-col overflow-hidden rounded-t-[16px] sm:rounded-[16px]"
            style={{ background: "var(--surface)", boxShadow: "var(--shadow)" }}
          >
            <div className="flex shrink-0 items-start justify-between gap-4 px-5 pt-4 sm:px-6 sm:pt-5">
              <div>
                <p className="small-caps" style={{ color: "var(--muted)" }}>
                  {modal.mode === "add" ? "New outreach" : "Edit contact"}
                </p>
                <h2 className="mt-1 text-[20px] font-semibold leading-tight">
                  {modal.mode === "add" ? "Add contact" : `Edit ${modal.contact.value.name}`}
                </h2>
              </div>
              <button
                onClick={() => setModal(null)}
                className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-[10px]"
              >
                <X size={19} />
              </button>
            </div>
            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(e) => {
                e.preventDefault();
                submitForm();
              }}
            >
              <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6 space-y-3">
                <div>
                  <label className="small-caps block" style={{ color: "var(--muted)" }}>
                    Name *
                  </label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                    placeholder="Full name or studio"
                    className="mt-2 h-[48px] w-full rounded-[12px] border px-3.5 text-[15px]"
                    style={{ borderColor: "var(--divider)", background: "var(--input)" }}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="small-caps block" style={{ color: "var(--muted)" }}>
                      Channel
                    </label>
                    <input
                      value={form.channel}
                      onChange={(e) => setForm({ ...form, channel: e.target.value })}
                      placeholder="Instagram, Email, Studio…"
                      className="mt-2 h-[48px] w-full rounded-[12px] border px-3.5 text-[15px]"
                      style={{ borderColor: "var(--divider)", background: "var(--input)" }}
                    />
                  </div>
                  <div>
                    <label className="small-caps block" style={{ color: "var(--muted)" }}>
                      Outreach date
                    </label>
                    <input
                      type="date"
                      value={form.outreachDate}
                      onChange={(e) => setForm({ ...form, outreachDate: e.target.value })}
                      className="mt-2 h-[48px] w-full rounded-[12px] border px-3.5 text-[15px]"
                      style={{ borderColor: "var(--divider)", background: "var(--input)" }}
                    />
                  </div>
                </div>
                <div>
                  <label className="small-caps block" style={{ color: "var(--muted)" }}>
                    Contact details
                  </label>
                  <input
                    value={form.contactDetails}
                    onChange={(e) => setForm({ ...form, contactDetails: e.target.value })}
                    placeholder="@handle, email, or phone"
                    className="mt-2 h-[48px] w-full rounded-[12px] border px-3.5 text-[15px]"
                    style={{ borderColor: "var(--divider)", background: "var(--input)" }}
                  />
                </div>
                <div>
                  <label className="small-caps block" style={{ color: "var(--muted)" }}>
                    Link
                  </label>
                  <input
                    value={form.link}
                    onChange={(e) => setForm({ ...form, link: e.target.value })}
                    placeholder="https://…"
                    className="mt-2 h-[48px] w-full rounded-[12px] border px-3.5 text-[15px]"
                    style={{ borderColor: "var(--divider)", background: "var(--input)" }}
                  />
                  {showPreview && (
                    <p className="mt-1 break-all text-xs" style={{ color: "var(--muted)" }}>
                      Will save as:{" "}
                      <a
                        href={previewLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium underline"
                        style={{ color: "var(--brand)" }}
                      >
                        {previewLink}
                      </a>
                    </p>
                  )}
                </div>
                <div>
                  <label className="small-caps block" style={{ color: "var(--muted)" }}>
                    Journey — where is this?
                  </label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {STAGES.map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setForm({ ...form, stage: s.value })}
                        className="min-h-[36px] rounded-full border px-3 text-xs font-medium"
                        style={
                          form.stage === s.value
                            ? {
                                background: "var(--text)",
                                color: "var(--bg)",
                                borderColor: "var(--text)",
                              }
                            : { borderColor: "var(--divider)", color: "var(--muted)" }
                        }
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="small-caps block" style={{ color: "var(--muted)" }}>
                      Work type
                    </label>
                    <select
                      value={form.workType}
                      onChange={(e) =>
                        setForm({ ...form, workType: e.target.value as WorkType })
                      }
                      className="mt-2 h-[48px] w-full rounded-[12px] border px-3.5 text-[15px]"
                      style={{ borderColor: "var(--divider)", background: "var(--input)" }}
                    >
                      {WORK_TYPES.map((w) => (
                        <option key={w.value} value={w.value}>
                          {w.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="small-caps block" style={{ color: "var(--muted)" }}>
                      Follow-up date
                    </label>
                    <input
                      type="date"
                      value={form.followUpDate}
                      onChange={(e) => setForm({ ...form, followUpDate: e.target.value })}
                      className="mt-2 h-[48px] w-full rounded-[12px] border px-3.5 text-[15px]"
                      style={{ borderColor: "var(--divider)", background: "var(--input)" }}
                    />
                  </div>
                </div>
                <div>
                  <label className="small-caps block" style={{ color: "var(--muted)" }}>
                    What caught your eye?
                  </label>
                  <textarea
                    value={form.whyThem}
                    onChange={(e) => setForm({ ...form, whyThem: e.target.value })}
                    rows={2}
                    placeholder="Loved their recent branding — the way they handled type stayed with me…"
                    className="mt-2 w-full resize-y rounded-[12px] border px-3.5 py-3 text-[15px] leading-relaxed"
                    style={{ borderColor: "var(--divider)", background: "var(--input)" }}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="small-caps block" style={{ color: "var(--muted)" }}>
                      Pitch you sent
                    </label>
                    <input
                      value={form.whatSent}
                      onChange={(e) => setForm({ ...form, whatSent: e.target.value })}
                      placeholder="Intro + 2 branding pieces"
                      className="mt-2 h-[48px] w-full rounded-[12px] border px-3.5 text-[15px]"
                      style={{ borderColor: "var(--divider)", background: "var(--input)" }}
                    />
                  </div>
                  <div>
                    <label className="small-caps block" style={{ color: "var(--muted)" }}>
                      Next step
                    </label>
                    <input
                      value={form.nextStep}
                      onChange={(e) => setForm({ ...form, nextStep: e.target.value })}
                      placeholder="Follow up in 4 days with idea"
                      className="mt-2 h-[48px] w-full rounded-[12px] border px-3.5 text-[15px]"
                      style={{ borderColor: "var(--divider)", background: "var(--input)" }}
                    />
                  </div>
                </div>
                <div>
                  <label className="small-caps block" style={{ color: "var(--muted)" }}>
                    Notes
                  </label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={3}
                    placeholder="Context, next step…"
                    className="mt-2 w-full resize-y rounded-[12px] border px-3.5 py-3 text-[15px] leading-relaxed"
                    style={{ borderColor: "var(--divider)", background: "var(--input)" }}
                  />
                </div>
              </div>
              <div
                className="shrink-0 border-t px-5 py-3 sm:px-6"
                style={{ borderColor: "var(--divider)", background: "var(--surface)" }}
              >
                {formError && (
                  <p role="alert" className="mb-2 text-sm font-medium" style={{ color: "#DB200D" }}>
                    {formError}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setModal(null)}
                    className="min-h-[46px] flex-1 rounded-[12px] border text-sm font-medium"
                    style={{ borderColor: "var(--divider)" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={busy || !form.name.trim()}
                    className="btn-press min-h-[46px] flex-1 rounded-[12px] text-sm font-medium text-white disabled:opacity-50"
                    style={{ background: "#DB200D" }}
                  >
                    {busy ? "Saving…" : modal.mode === "add" ? "Add contact" : "Save changes"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete All Data Dialog */}
      {showDeleteAll && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <button
            aria-label="Close"
            onClick={() => setShowDeleteAll(false)}
            className="absolute inset-0 bg-black/35"
          />
          <div
            className="relative w-full max-w-[460px] rounded-t-[16px] p-6 sm:rounded-[16px]"
            style={{ background: "var(--surface)", boxShadow: "var(--shadow)" }}
          >
            <h2 className="text-[22px] font-semibold">Delete all my data?</h2>
            <p className="mt-2 leading-relaxed" style={{ color: "var(--muted)" }}>
              This will permanently delete all your contacts, notes, templates and settings from
              your account.
            </p>
            <div className="mt-6 flex gap-2">
              <button
                onClick={() => setShowDeleteAll(false)}
                className="min-h-[46px] flex-1 rounded-[12px] border text-sm font-medium"
                style={{ borderColor: "var(--divider)" }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAllMyData}
                disabled={deleteAllBusy}
                className="min-h-[46px] flex-1 rounded-[12px] text-sm font-medium text-white disabled:opacity-50"
                style={{ background: "#DB200D" }}
              >
                {deleteAllBusy ? "Deleting…" : "Delete everything"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Win Loop Modal */}
      {winModal && winContact && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <button
            aria-label="Close win dialog"
            onClick={() => {
              setWinModal(false);
              setWinContact(null);
            }}
            className="absolute inset-0 bg-black/35"
          />
          <div
            className="relative w-full max-w-[520px] rounded-t-[16px] p-6 sm:rounded-[16px]"
            style={{ background: "var(--surface)", boxShadow: "var(--shadow)" }}
          >
            <h2 className="text-[22px] font-semibold">Win: {winContact.value.name}</h2>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
              What worked? Who else should you reach? This builds your Proof Stack.
            </p>
            <label className="small-caps mt-5 block" style={{ color: "var(--muted)" }}>
              What worked?
            </label>
            <textarea
              value={winNote}
              onChange={(e) => setWinNote(e.target.value)}
              rows={3}
              placeholder="They loved the editorial direction. Quick yes after 2nd follow-up."
              className="mt-2 w-full rounded-[12px] border px-3.5 py-3 text-[15px]"
              style={{ borderColor: "var(--divider)", background: "var(--input)" }}
            />
            <label className="small-caps mt-4 block" style={{ color: "var(--muted)" }}>
              Who else should I reach? (handle or name)
            </label>
            <input
              value={winReferral}
              onChange={(e) => setWinReferral(e.target.value)}
              placeholder="@studio or Studio Name"
              className="mt-2 h-[48px] w-full rounded-[12px] border px-3.5 text-[15px]"
              style={{ borderColor: "var(--divider)", background: "var(--input)" }}
            />
            <div className="mt-6 flex gap-2">
              <button
                onClick={() => {
                  setWinModal(false);
                  setWinContact(null);
                }}
                className="min-h-[46px] flex-1 rounded-[12px] border text-sm font-medium"
                style={{ borderColor: "var(--divider)" }}
              >
                Skip
              </button>
              <button
                onClick={saveWinLoop}
                className="btn-press min-h-[46px] flex-1 rounded-[12px] text-sm font-medium text-white"
                style={{ background: "var(--brand)" }}
              >
                Save win
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5-Second Undo Toast */}
      {pendingDelete && (
        <div
          role="status"
          className="toast-in fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 whitespace-nowrap rounded-full px-4 py-3 text-sm font-medium text-white shadow-lg"
          style={{ background: "#0D0D0C" }}
        >
          <span>Archived {pendingDelete.contact.value.name}.</span>
          <button
            onClick={undoDelete}
            className="min-h-[32px] rounded-full bg-white px-3 text-xs font-semibold text-black"
          >
            Undo (Z)
          </button>
        </div>
      )}

      {toast && !pendingDelete && (
        <div
          role="status"
          className="toast-in fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full px-4 py-3 text-sm font-medium text-white shadow-lg"
          style={{ background: "#0D0D0C" }}
        >
          <Check size={16} /> {toast}
        </div>
      )}
    </div>
  );
}