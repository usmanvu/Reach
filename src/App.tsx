import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase, isSupabaseConfigured } from "./supabaseClient";
import { Search, Plus, Download, X, Copy, Check, Trash2, ChevronDown } from "lucide-react";

type Stage = "to-reach" | "pitched" | "in-conversation" | "follow-up" | "won";
type WorkType = "branding" | "editorial" | "social" | "collaboration" | "";
type ThreadKind = "created" | "why" | "sent" | "next" | "stage" | "note" | "win";
type ThreadEntry = { id: string; kind: ThreadKind; text: string; link?: string; createdAt: string };
type ContactValue = { name: string; channel: string; outreachDate: string; contactDetails: string; link: string; notes: string; createdAt: string; updatedAt: string; stage: Stage; whyThem: string; whatSent: string; nextStep: string; workType: WorkType; followUpDate: string; featuredLink: string; winNote: string; referredBy: string; deletedAt: string; thread: ThreadEntry[] };
type Contact = { id: string; value: ContactValue };
type ThemeMode = "system" | "light" | "dark";
type Filter = "all" | "to-reach" | "follow-up" | "won";
type View = "queue" | "contacts";
type TemplateItem = { id: string; title: string; text: string };
type ProfileValue = { name: string; whatIDo: string; openFor: string };

const STAGES: { value: Stage; label: string }[] = [
  { value: "to-reach", label: "To reach" },
  { value: "pitched", label: "Pitched" },
  { value: "in-conversation", label: "In conversation" },
  { value: "follow-up", label: "Follow-up due" },
  { value: "won", label: "Won" },
];
const WORK_TYPES: { value: WorkType; label: string }[] = [
  { value: "branding", label: "Branding" },
  { value: "editorial", label: "Editorial" },
  { value: "social", label: "Social" },
  { value: "collaboration", label: "Collaboration" },
];
const DEFAULT_TEMPLATES: TemplateItem[] = [
  { id: "first-outreach", title: "First outreach", text: "Hi [Name],\n\nI loved your recent [detail]. The way you handled it stayed with me. I am a visual designer focused on branding, editorial, and social, and I kept thinking about how your work and mine might fit.\n\nIf you are open to it, I would love to share a few relevant pieces. No pressure, I just admired the work and wanted to say hello.\n\nWarmly" },
  { id: "follow-up", title: "Polite follow-up", text: "Hi [Name],\n\nJust floating my last message back up. No pressure, I know inboxes get busy.\n\nIf it helps, I can share a quick idea or a relevant piece for [detail]. If now is not the right time, that is completely fine too.\n\nWarmly" },
  { id: "thank-you", title: "Thank you", text: "Hi [Name],\n\nThank you for the conversation. I really enjoyed [detail] and working through it with you.\n\nIf anything comes up down the line, I am happy to help. Let's stay in touch.\n\nWarmly" },
];
const DEFAULT_PROFILE: ProfileValue = { name: "", whatIDo: "", openFor: "" };
const SHORTCUTS = [
  { keys: "Cmd + K", label: "Command Palette" },
  { keys: "/", label: "Search" },
  { keys: "N", label: "New contact" },
  { keys: "E", label: "Edit thread" },
  { keys: "Cmd + Enter", label: "Save" },
  { keys: "Esc", label: "Cancel / Close" },
  { keys: "J", label: "Next" },
  { keys: "K", label: "Previous" },
  { keys: "Enter", label: "Open selected" },
  { keys: "B", label: "Back" },
];

function uid() { return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function todayISO() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function addDaysISO(days: number) { const d = new Date(); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function formatDate(v: string) { if (!v) return ""; const d = new Date(`${v}T12:00:00`); if (Number.isNaN(d.getTime())) return v; return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
function formatTime(d: Date) { return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }); }
function isEmailValue(v: string) { return /^[^\s@/]+@[^\s@]+\.[^\s@]+$/.test(v.trim()); }
function daysSinceISO(d: string, today: string) { if (!d) return -1; return Math.floor((new Date(`${today}T12:00:00`).getTime() - new Date(`${d}T12:00:00`).getTime()) / 86400000); }
function stageLabel(s: Stage) { return STAGES.find((x) => x.value === s)?.label || "To reach"; }
function stageColor(s: Stage) { if (s === "won") return "var(--brand)"; if (s === "follow-up") return "var(--danger)"; if (s === "in-conversation") return "var(--success)"; if (s === "pitched") return "var(--text)"; return "var(--muted)"; }
function initialsFor(name: string) { const p = (name || "").trim().split(/\s+/).filter(Boolean); if (!p.length) return "?"; if (p.length === 1) return p[0].slice(0, 2).toUpperCase(); return `${p[0][0]}${p[p.length - 1][0]}`.toUpperCase(); }
function csvCell(v: string) { return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }
function safeHref(raw: string) { const v = (raw || "").trim(); if (!v) return ""; if (v.toLowerCase().startsWith("javascript:") || v.toLowerCase().startsWith("data:")) return ""; if (/^https?:\/\//i.test(v)) return v; if (/^mailto:/i.test(v)) return v; if (isEmailValue(v)) return `mailto:${v}`; if (v.includes(".") && !v.includes(" ")) return `https://${v.replace(/^@+/, "")}`; return ""; }
function parsePasteToContact(raw: string) {
  const input = (raw || "").trim(); if (!input) return { name: "", channel: "", link: "", contactDetails: "" };
  const urlMatch = input.match(/(https?:\/\/[^\s,]+|www\.[^\s,]+|[a-z0-9-]+\.[a-z]{2,}\/[^\s,]*)/i);
  if (urlMatch) { const link = urlMatch[0].startsWith("http") ? urlMatch[0] : `https://${urlMatch[0]}`; const handle = link.replace(/^https?:\/\//, "").split("/").filter(Boolean).pop() || ""; const name = handle.replace(/^@/, "").replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); let channel = "Website"; if (link.includes("instagram")) channel = "Instagram"; else if (link.includes("linkedin")) channel = "LinkedIn"; else if (link.includes("x.com") || link.includes("twitter")) channel = "X"; else if (link.includes("behance")) channel = "Behance"; return { name, channel, link, contactDetails: input }; }
  if (isEmailValue(input)) return { name: input.split("@")[0].replace(/[.\-_]/g, " "), channel: "Email", link: `mailto:${input}`, contactDetails: input };
  const handle = input.replace(/^@+/, "").replace(/\s+/g, ""); if (handle && !handle.includes(" ")) return { name: handle.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), channel: "Instagram", link: `https://instagram.com/${handle}`, contactDetails: input };
  return { name: input, channel: "", link: "", contactDetails: input };
}
function isFollowUpDue(c: ContactValue, today: string) {
  if (c.stage === "won") return false; if (c.deletedAt) return false;
  if (c.followUpDate && c.followUpDate <= today) return true;
  if (c.stage === "follow-up") return true;
  if (!c.followUpDate && c.stage === "pitched" && daysSinceISO(c.outreachDate, today) >= 4) return true;
  return false;
}
function threadLabel(k: ThreadKind) { if (k === "why") return "Why them"; if (k === "sent") return "Pitch sent"; if (k === "next") return "Next step"; if (k === "stage") return "Moved"; if (k === "win") return "What worked"; if (k === "created") return "Added"; return "Note"; }

async function api(action: string, args: Record<string, unknown>) {
  if (!isSupabaseConfigured) throw new Error("Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel.");
  const { data: { user } } = await supabase.auth.getUser(); if (!user) throw new Error("Please sign in to see your contacts.");
  if (action === "records.list") {
    if (args.collection === "outreach-contacts") { const { data, error } = await supabase.from("outreach_contacts").select("id, value").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1000); if (error) throw error; return { records: (data || []).map((r: any) => ({ id: r.id, value: r.value })) }; }
    if (args.collection === "outreach-settings") { const { data, error } = await supabase.from("outreach_settings").select("id, value").eq("user_id", user.id).limit(1).maybeSingle(); if (error) throw error; return { records: data ? [{ id: data.id, value: data.value }] : [] }; }
    return { records: [] };
  }
  if (action === "records.create") {
    if (args.collection === "outreach-contacts") { const { data, error } = await supabase.from("outreach_contacts").insert({ user_id: user.id, value: args.value }).select("id").single(); if (error) throw error; return { id: data.id }; }
    if (args.collection === "outreach-settings") { const { data, error } = await supabase.from("outreach_settings").insert({ user_id: user.id, value: args.value }).select("id").single(); if (error) throw error; return { id: data.id }; }
    return { id: uid() };
  }
  if (action === "records.replace") {
    if (args.collection === "outreach-contacts") { const { error } = await supabase.from("outreach_contacts").update({ value: args.value }).eq("id", args.id).eq("user_id", user.id); if (error) throw error; return {}; }
    if (args.collection === "outreach-settings") { const { error } = await supabase.from("outreach_settings").update({ value: args.value }).eq("id", args.id).eq("user_id", user.id); if (error) throw error; return {}; }
    return {};
  }
  throw new Error(`Unknown action ${action}`);
}

function normalizeContactValue(v: any): ContactValue {
  const rawStage = typeof v?.stage === "string" ? v.stage : "";
  let stage: Stage = "to-reach";
  if (["to-reach", "pitched", "in-conversation", "follow-up", "won"].includes(rawStage)) stage = rawStage;
  else if (rawStage === "paused" || rawStage === "archived") stage = "to-reach";
  else if (v?.followedUp) stage = "follow-up";
  else if (v?.replied) stage = "in-conversation";
  const now = new Date().toISOString();
  const thread: ThreadEntry[] = Array.isArray(v?.thread) && v.thread.length ? v.thread.map((e: any) => ({ id: String(e.id || uid()), kind: (["created", "why", "sent", "next", "stage", "note", "win"].includes(e.kind) ? e.kind : "note") as ThreadKind, text: String(e.text || ""), link: String(e.link || ""), createdAt: String(e.createdAt || now) })) : [];
  if (!thread.length) {
    thread.push({ id: uid(), kind: "created", text: `Added to To-Reach`, createdAt: String(v?.createdAt || now) });
    if (v?.whyThem) thread.push({ id: uid(), kind: "why", text: String(v.whyThem), createdAt: String(v?.createdAt || now) });
    if (v?.whatSent) thread.push({ id: uid(), kind: "sent", text: String(v.whatSent), createdAt: String(v?.updatedAt || now) });
    if (v?.nextStep) thread.push({ id: uid(), kind: "next", text: String(v.nextStep), createdAt: String(v?.updatedAt || now) });
    if (v?.notes) thread.push({ id: uid(), kind: "note", text: String(v.notes), createdAt: String(v?.updatedAt || now) });
    const winText = v?.winNote || v?.testimonial || ""; if (winText) thread.push({ id: uid(), kind: "win", text: String(winText), createdAt: String(v?.updatedAt || now) });
  }
  return {
    name: typeof v?.name === "string" ? v.name : "", channel: typeof v?.channel === "string" ? v.channel : "", outreachDate: typeof v?.outreachDate === "string" ? v.outreachDate : todayISO(),
    contactDetails: typeof v?.contactDetails === "string" ? v.contactDetails : "", link: typeof v?.link === "string" ? v.link : "", notes: typeof v?.notes === "string" ? v.notes : "",
    createdAt: typeof v?.createdAt === "string" ? v.createdAt : now, updatedAt: typeof v?.updatedAt === "string" ? v.updatedAt : now, stage,
    whyThem: typeof v?.whyThem === "string" ? v.whyThem : "", whatSent: typeof v?.whatSent === "string" ? v.whatSent : "", nextStep: typeof v?.nextStep === "string" ? v.nextStep : "",
    workType: (["branding", "editorial", "social", "collaboration"].includes(v?.workType) ? v.workType : "") as WorkType,
    followUpDate: typeof v?.followUpDate === "string" ? v.followUpDate : "", featuredLink: typeof v?.featuredLink === "string" ? v.featuredLink : "",
    winNote: typeof v?.winNote === "string" ? v.winNote : (typeof v?.testimonial === "string" ? v.testimonial : ""), referredBy: typeof v?.referredBy === "string" ? v.referredBy : (typeof v?.referredById === "string" ? v.referredById : ""), deletedAt: typeof v?.deletedAt === "string" ? v.deletedAt : "", thread,
  };
}
function syncDerived(v: ContactValue): ContactValue {
  const why = v.thread.find((e) => e.kind === "why")?.text || ""; const sent = v.thread.find((e) => e.kind === "sent")?.text || ""; const next = [...v.thread].reverse().find((e) => e.kind === "next")?.text || ""; const win = v.thread.find((e) => e.kind === "win")?.text || ""; const notes = v.thread.filter((e) => e.kind === "note").map((e) => e.text).join("\n");
  return { ...v, whyThem: why, whatSent: sent, nextStep: next, winNote: win, notes, updatedAt: new Date().toISOString() };
}

export default function App() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<View>("queue");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [prevId, setPrevId] = useState<string | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateItem[]>(DEFAULT_TEMPLATES);
  const [profile, setProfile] = useState<ProfileValue>(DEFAULT_PROFILE);
  const [profileDraft, setProfileDraft] = useState<ProfileValue>(DEFAULT_PROFILE);
  const [pasteText, setPasteText] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [entryDraft, setEntryDraft] = useState("");
  const [entryError, setEntryError] = useState<string | null>(null);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [selectedProofId, setSelectedProofId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [winDraft, setWinDraft] = useState("");
  const [winReferral, setWinReferral] = useState("");
  const [pendingArchive, setPendingArchive] = useState<{ contact: Contact; timer: number } | null>(null);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteAllBusy, setDeleteAllBusy] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authSent, setAuthSent] = useState(false);
  const [authMode, setAuthMode] = useState<"magic" | "password" | "forgot" | "recovery">("magic");
  const [authIsSignup, setAuthIsSignup] = useState(false);
  const [authName, setAuthName] = useState("");
  const [authNewPassword, setAuthNewPassword] = useState("");
  const [contactDetailDraft, setContactDetailDraft] = useState("");
  const [contactLinkDraft, setContactLinkDraft] = useState("");

  const searchRef = useRef<HTMLInputElement | null>(null);
  const captureRef = useRef<HTMLInputElement | null>(null);
  const paletteRef = useRef<HTMLInputElement | null>(null);
  const toastTimer = useRef<number | null>(null);
  const isDesktop = typeof window !== "undefined" ? window.matchMedia("(min-width: 1024px)").matches : true;
  const [isDesktopState, setIsDesktopState] = useState(isDesktop);
  useEffect(() => { const m = window.matchMedia("(min-width: 1024px)"); const fn = () => setIsDesktopState(m.matches); fn(); m.addEventListener("change", fn); return () => m.removeEventListener("change", fn); }, []);

  const showToast = (msg: string) => { setToast(msg); if (toastTimer.current) window.clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToast(null), 3200); };

  useEffect(() => {
    if (!isSupabaseConfigured) { setAuthLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => { setUser(data.session?.user ?? null); setAuthLoading(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => { setUser(session?.user ?? null); setAuthLoading(false); if (event === "PASSWORD_RECOVERY") setAuthMode("recovery"); });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const root = document.documentElement; const apply = () => { if (themeMode === "system") { const dark = window.matchMedia("(prefers-color-scheme: dark)").matches; root.setAttribute("data-theme", dark ? "dark" : "light"); } else root.setAttribute("data-theme", themeMode); };
    apply(); const m = window.matchMedia("(prefers-color-scheme: dark)"); m.addEventListener("change", apply); return () => m.removeEventListener("change", apply);
  }, [themeMode]);

  const loadAll = async () => {
    setLoading(true); setLoadError(null);
    try {
      const list = await api("records.list", { collection: "outreach-contacts" }) as { records: { id: string; value: any }[] };
      const mapped = (list.records || []).map((r) => ({ id: r.id, value: normalizeContactValue(r.value) }));
      setContacts(mapped);
      const s = await api("records.list", { collection: "outreach-settings" }) as { records: { id: string; value: any }[] };
      const first = s.records?.[0]; if (first) { setSettingsId(first.id); if (first.value.themeMode) setThemeMode(first.value.themeMode); if (Array.isArray(first.value.templates) && first.value.templates.length) setTemplates(first.value.templates.map((t: any) => ({ id: String(t.id), title: String(t.title), text: String(t.text) }))); if (first.value.profile) setProfile({ name: String(first.value.profile.name || ""), whatIDo: String(first.value.profile.whatIDo || ""), openFor: String(first.value.profile.openFor || "") }); if (first.value.selectedId) setSelectedId(first.value.selectedId); }
    } catch (e) { setLoadError(e instanceof Error ? e.message : "Could not load contacts."); } finally { setLoading(false); }
  };
  useEffect(() => { if (user) loadAll(); }, [user]);

  const saveSettings = async (nextTheme = themeMode, nextTemplates = templates, nextProfile = profile, nextSelected = selectedId) => {
    const value = { themeMode: nextTheme, templates: nextTemplates, profile: nextProfile, selectedId: nextSelected };
    if (settingsId) await api("records.replace", { collection: "outreach-settings", id: settingsId, value });
    else { const created = await api("records.create", { collection: "outreach-settings", value }) as { id: string }; setSettingsId(created.id); }
  };
  const persistContact = async (contact: Contact, nextValue: ContactValue) => {
    const synced = syncDerived(nextValue); setContacts((prev) => prev.map((c) => (c.id === contact.id ? { ...c, value: synced } : c)));
    await api("records.replace", { collection: "outreach-contacts", id: contact.id, value: synced });
  };

  const selected = useMemo(() => contacts.find((c) => c.id === selectedId && !c.value.deletedAt) || null, [contacts, selectedId]);
  useEffect(() => { if (selected) { setContactDetailDraft(selected.value.contactDetails); setContactLinkDraft(selected.value.link); setWinDraft(selected.value.winNote); setEditingEntryId(null); setActiveTemplateId(null); } }, [selected?.id]);

  const today = todayISO();
  const visible = useMemo(() => contacts.filter((c) => !c.value.deletedAt), [contacts]);
  const counts = useMemo(() => ({ total: visible.length, due: visible.filter((c) => isFollowUpDue(c.value, today)).length, toReach: visible.filter((c) => c.value.stage === "to-reach").length, inConversation: visible.filter((c) => c.value.stage === "in-conversation").length, won: visible.filter((c) => c.value.stage === "won").length }), [visible, today]);
  const queue = useMemo(() => {
    const notSnoozed = (c: Contact) => !c.value.followUpDate || c.value.followUpDate <= today;
    const due = visible.filter((c) => isFollowUpDue(c.value, today)).sort((a, b) => (a.value.followUpDate || a.value.outreachDate).localeCompare(b.value.followUpDate || b.value.outreachDate));
    const toReach = visible.filter((c) => c.value.stage === "to-reach" && notSnoozed(c)).sort((a, b) => a.value.createdAt.localeCompare(b.value.createdAt));
    const convo = visible.filter((c) => c.value.stage === "in-conversation" && notSnoozed(c)).sort((a, b) => a.value.updatedAt.localeCompare(b.value.updatedAt));
    const pitched = visible.filter((c) => c.value.stage === "pitched" && notSnoozed(c)).sort((a, b) => a.value.updatedAt.localeCompare(b.value.updatedAt));
    return [...due, ...toReach, ...convo, ...pitched].filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i);
  }, [visible, today]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = visible.filter((c) => { if (filter === "to-reach" && c.value.stage !== "to-reach") return false; if (filter === "follow-up" && !isFollowUpDue(c.value, today) && c.value.stage !== "follow-up") return false; if (filter === "won" && c.value.stage !== "won") return false; if (!q) return true; return [c.value.name, c.value.channel, c.value.contactDetails, c.value.link, c.value.whyThem, c.value.whatSent, c.value.nextStep, c.value.notes, c.value.workType].some((v) => (v || "").toLowerCase().includes(q)); });
    return [...list].sort((a, b) => b.value.updatedAt.localeCompare(a.value.updatedAt));
  }, [visible, search, filter, today]);
  const proofStack = useMemo(() => visible.filter((c) => c.value.stage === "won" && c.value.winNote).map((c) => ({ id: c.id, name: c.value.name, text: c.value.winNote, link: c.value.featuredLink || c.value.link })), [visible]);

  const selectContact = (id: string | null) => { if (id && selectedId && id !== selectedId) setPrevId(selectedId); setSelectedId(id); if (id) saveSettings(themeMode, templates, profile, id).catch(() => {}); };
  const handlePasteAdd = async (e?: React.FormEvent) => {
    if (e) e.preventDefault(); const raw = pasteText.trim(); if (!raw) return; setBusy(true);
    try {
      const parsed = parsePasteToContact(raw);
      const dup = contacts.find((c) => !c.value.deletedAt && c.value.name.toLowerCase() === parsed.name.toLowerCase());
      if (dup) { selectContact(dup.id); showToast("You already have this contact. Opened it instead."); setPasteText(""); return; }
      const value: ContactValue = { name: parsed.name || raw, channel: parsed.channel, outreachDate: today, contactDetails: parsed.contactDetails, link: parsed.link, notes: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), stage: "to-reach", whyThem: "", whatSent: "", nextStep: "", workType: "", followUpDate: "", featuredLink: "", winNote: "", referredBy: "", deletedAt: "", thread: [{ id: uid(), kind: "created", text: "Added to To-Reach", createdAt: new Date().toISOString() }] };
      const created = await api("records.create", { collection: "outreach-contacts", value }) as { id: string };
      setContacts((prev) => [{ id: created.id, value }, ...prev]); setPasteText(""); showToast(`Added to To-Reach: ${value.name}`); selectContact(created.id); setView("contacts");
    } catch (err) { showToast(err instanceof Error ? err.message : "Could not add contact"); } finally { setBusy(false); }
  };
  const markDone = async (contact: Contact) => {
    let nextStage: Stage = contact.value.stage; let nextFollow: string = contact.value.followUpDate;
    if (contact.value.stage === "to-reach") nextStage = "pitched"; else if (contact.value.stage === "pitched") nextStage = "in-conversation"; else if (contact.value.stage === "follow-up") { nextStage = "in-conversation"; nextFollow = ""; } else if (contact.value.stage === "in-conversation") { nextStage = "follow-up"; nextFollow = addDaysISO(4); }
    const entry: ThreadEntry = { id: uid(), kind: "stage", text: `Marked done. Moved to ${stageLabel(nextStage)}`, createdAt: new Date().toISOString() };
    await persistContact(contact, { ...contact.value, stage: nextStage, followUpDate: nextFollow, thread: [...contact.value.thread, entry] }); showToast("Done. Next up.");
  };
  const snooze = async (contact: Contact) => { const entry: ThreadEntry = { id: uid(), kind: "stage", text: "Snoozed 4 days", createdAt: new Date().toISOString() }; await persistContact(contact, { ...contact.value, followUpDate: addDaysISO(4), thread: [...contact.value.thread, entry] }); showToast("Snoozed 4 days."); };
  const setStage = async (contact: Contact, stage: Stage) => {
    const entry: ThreadEntry = { id: uid(), kind: "stage", text: `Moved to ${stageLabel(stage)}`, createdAt: new Date().toISOString() };
    await persistContact(contact, { ...contact.value, stage, thread: [...contact.value.thread, entry] }); showToast(`Moved to ${stageLabel(stage)}`);
    if (stage === "won") { setWinDraft(contact.value.winNote); setWinReferral(""); }
  };
  const addThreadEntry = (kind: ThreadKind) => { if (!selected) return; const entry: ThreadEntry = { id: uid(), kind, text: "", createdAt: new Date().toISOString() }; setContacts((prev) => prev.map((c) => (c.id === selected.id ? { ...c, value: { ...c.value, thread: [...c.value.thread, entry] } } : c))); setEditingEntryId(entry.id); setEntryDraft(""); setEntryError(null); };
  const saveThreadEntry = async () => { if (!selected || !editingEntryId) return; if (!entryDraft.trim()) { setEntryError("Add 1 line to save."); return; } const nextThread = selected.value.thread.map((en) => (en.id === editingEntryId ? { ...en, text: entryDraft.trim() } : en)); await persistContact(selected, { ...selected.value, thread: nextThread }); setEditingEntryId(null); setEntryDraft(""); setEntryError(null); showToast("Saved"); };
  const saveContactBasics = async () => { if (!selected) return; await persistContact(selected, { ...selected.value, contactDetails: contactDetailDraft.trim(), link: contactLinkDraft.trim() }); showToast("Saved"); };
  const saveWin = async () => { if (!selected) return; if (!winDraft.trim()) { showToast("Add 1 line for What worked."); return; } const nextThread = selected.value.thread.filter((en) => en.kind !== "win"); nextThread.push({ id: uid(), kind: "win", text: winDraft.trim(), createdAt: new Date().toISOString() }); const featured = selected.value.featuredLink; await persistContact(selected, { ...selected.value, thread: nextThread, featuredLink: featured }); if (winReferral.trim()) { const parsed = parsePasteToContact(winReferral.trim()); const v: ContactValue = { name: parsed.name || winReferral.trim(), channel: parsed.channel, outreachDate: today, contactDetails: parsed.contactDetails, link: parsed.link, notes: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), stage: "to-reach", whyThem: "", whatSent: "", nextStep: "", workType: "", followUpDate: "", featuredLink: "", winNote: "", referredBy: selected.value.name, deletedAt: "", thread: [{ id: uid(), kind: "created", text: `Added via ${selected.value.name}`, createdAt: new Date().toISOString() }] }; const created = await api("records.create", { collection: "outreach-contacts", value: v }) as { id: string }; setContacts((prev) => [{ id: created.id, value: v }, ...prev]); } setWinReferral(""); showToast("Win saved to Proof Stack."); };
  const archiveContact = async (contact: Contact) => { if (pendingArchive) window.clearTimeout(pendingArchive.timer); const timer = window.setTimeout(() => setPendingArchive(null), 5000); setPendingArchive({ contact, timer }); setContacts((prev) => prev.map((c) => (c.id === contact.id ? { ...c, value: { ...c.value, deletedAt: new Date().toISOString() } } : c))); if (selectedId === contact.id) setSelectedId(null); showToast(`Archived ${contact.value.name}.`); };
  const undoArchive = async () => { if (!pendingArchive) return; const c = pendingArchive.contact; window.clearTimeout(pendingArchive.timer); setPendingArchive(null); setContacts((prev) => prev.map((x) => (x.id === c.id ? { ...x, value: { ...x.value, deletedAt: "" } } : x))); showToast("Restored."); };
  const copyText = async (text: string, key: string) => { try { await navigator.clipboard.writeText(text); setCopiedKey(key); setTimeout(() => setCopiedKey(null), 2000); showToast("Copied to clipboard"); } catch { showToast("Select the text to copy it"); } };
  const exportCSV = () => { const headers = ["name", "channel", "outreach date", "contact", "link", "stage", "work type", "why them", "what sent", "next step", "follow-up date", "featured link", "win note", "notes"]; const rows = contacts.filter((c) => !c.value.deletedAt).map((c) => [c.value.name, c.value.channel, c.value.outreachDate, c.value.contactDetails, c.value.link, stageLabel(c.value.stage), c.value.workType, c.value.whyThem, c.value.whatSent, c.value.nextStep, c.value.followUpDate, c.value.featuredLink, c.value.winNote, c.value.notes]); const csv = "\uFEFF" + [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n"); const blob = new Blob([csv], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `reach-${today}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 800); showToast(`Exported ${rows.length} contacts`); };
  const saveProfile = async () => { const next = { name: profileDraft.name.trim(), whatIDo: profileDraft.whatIDo.trim(), openFor: profileDraft.openFor.trim() }; setProfile(next); await saveSettings(themeMode, templates, next, selectedId); setSettingsOpen(false); showToast("Profile saved."); };
  const saveTemplate = async (id: string, text: string) => { const next = templates.map((t) => (t.id === id ? { ...t, text } : t)); setTemplates(next); await saveSettings(themeMode, next, profile, selectedId); showToast("Template saved"); };
  const deleteAll = async () => { if (deleteConfirm !== "DELETE" || !user) return; setDeleteAllBusy(true); try { await supabase.from("outreach_contacts").delete().eq("user_id", user.id); await supabase.from("outreach_settings").delete().eq("user_id", user.id); setContacts([]); setSelectedId(null); setTemplates(DEFAULT_TEMPLATES); setProfile(DEFAULT_PROFILE); setShowDeleteAll(false); setDeleteConfirm(""); showToast("All your data was deleted"); } catch (e) { showToast("Could not delete data"); } finally { setDeleteAllBusy(false); } };

  const friendlyAuthError = (msg: string) => { const m = msg.toLowerCase(); if (m.includes("invalid login")) return "Incorrect email or password. Try again, or use Forgot password."; if (m.includes("already registered")) return "This email already has an account. Switch to Sign in."; if (m.includes("expired")) return "That link expired. Request a new one."; if (m.includes("rate limit")) return "Too many attempts. Wait a few minutes."; return msg; };
  const sendMagic = async (e?: React.FormEvent) => { if (e) e.preventDefault(); if (!authEmail.trim() || !authEmail.includes("@")) { setAuthError("Please enter a valid email."); return; } setAuthBusy(true); setAuthError(null); const { error } = await supabase.auth.signInWithOtp({ email: authEmail.trim(), options: { emailRedirectTo: window.location.origin } }); setAuthBusy(false); if (error) setAuthError(friendlyAuthError(error.message)); else setAuthSent(true); };
  const signInPassword = async (e?: React.FormEvent) => { if (e) e.preventDefault(); if (!authEmail.includes("@")) { setAuthError("Please enter a valid email."); return; } if (!authPassword) { setAuthError("Please enter your password."); return; } setAuthBusy(true); setAuthError(null); if (authIsSignup) { const { error } = await supabase.auth.signUp({ email: authEmail.trim(), password: authPassword, options: { data: { full_name: authName.trim() }, emailRedirectTo: window.location.origin } }); if (error) setAuthError(friendlyAuthError(error.message)); } else { const { error } = await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword }); if (error) setAuthError(friendlyAuthError(error.message)); } setAuthBusy(false); };
  const sendReset = async (e?: React.FormEvent) => { if (e) e.preventDefault(); if (!authEmail.includes("@")) { setAuthError("Please enter a valid email."); return; } setAuthBusy(true); const { error } = await supabase.auth.resetPasswordForEmail(authEmail.trim(), { redirectTo: window.location.origin }); setAuthBusy(false); if (error) setAuthError(friendlyAuthError(error.message)); else setAuthSent(true); };
  const saveNewPassword = async (e?: React.FormEvent) => { if (e) e.preventDefault(); if (authNewPassword.length < 8) { setAuthError("Password must be at least 8 characters."); return; } setAuthBusy(true); const { error } = await supabase.auth.updateUser({ password: authNewPassword }); setAuthBusy(false); if (error) setAuthError(friendlyAuthError(error.message)); else { setAuthMode("magic"); showToast("Password updated"); } };
  const signInGoogle = async () => { setAuthBusy(true); const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } }); if (error) { setAuthError(friendlyAuthError(error.message)); setAuthBusy(false); } };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement; const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((v) => !v); setPaletteQuery(""); setTimeout(() => paletteRef.current?.focus(), 50); return; }
      if (mod && e.key === "Enter") { e.preventDefault(); if (editingEntryId) saveThreadEntry(); else if (selected && document.activeElement?.tagName === "TEXTAREA") saveContactBasics(); return; }
      if (e.key === "Escape") { if (paletteOpen) setPaletteOpen(false); else if (settingsOpen) setSettingsOpen(false); else if (editingEntryId) { setEditingEntryId(null); setEntryDraft(""); } else if (selected) setSelectedId(null); return; }
      if (typing) return;
      if (e.key === "/") { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); setView("contacts"); return; }
      if (e.key.toLowerCase() === "n") { e.preventDefault(); captureRef.current?.focus(); captureRef.current?.select(); return; }
      if (e.key.toLowerCase() === "e" && selected) { e.preventDefault(); addThreadEntry("note"); return; }
      if (e.key.toLowerCase() === "j") { const list = view === "queue" ? queue : filtered; const idx = list.findIndex((c) => c.id === selectedId); const next = list[Math.min(idx + 1, list.length - 1)] || list[0]; if (next) selectContact(next.id); return; }
      if (e.key.toLowerCase() === "k") { const list = view === "queue" ? queue : filtered; const idx = list.findIndex((c) => c.id === selectedId); const prev = list[Math.max(idx - 1, 0)] || list[0]; if (prev) selectContact(prev.id); return; }
      if (e.key === "Enter" && selectedId) { return; }
      if (e.key.toLowerCase() === "b" && prevId) { e.preventDefault(); selectContact(prevId); return; }
    };
    window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler);
  }, [paletteOpen, settingsOpen, editingEntryId, selected, selectedId, prevId, view, queue, filtered, entryDraft]);

  if (authLoading) return (<div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ width: "100%", maxWidth: 560, padding: 24 }}>{[0, 1, 2, 3, 4, 5].map((i) => (<div key={i} className="skeleton" style={{ height: 56, marginTop: 16 }} />))}</div></div>);
  if (!isSupabaseConfigured) return (<div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "var(--bg)", color: "var(--text)" }}><div style={{ maxWidth: 520, textAlign: "center" }}><p className="small-caps" style={{ color: "var(--muted)" }}>Reach. Setup needed</p><h1 className="display" style={{ marginTop: 16 }}>Connect your database to load contacts.</h1><p className="body" style={{ color: "var(--muted)", marginTop: 16 }}>Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel.</p></div></div>);
  if (!user) return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 480 }}>
        <p className="small-caps" style={{ color: "var(--muted)" }}>Reach</p><h1 className="display" style={{ marginTop: 16 }}>Outreach, curated.</h1><p className="body" style={{ color: "var(--muted)", marginTop: 16 }}>Your data, only yours.</p>
        {authSent ? (<div style={{ marginTop: 24, border: "1px solid var(--divider)", borderRadius: 12, padding: 24 }}><p className="body" style={{ fontWeight: 600 }}>Check your inbox</p><p className="body" style={{ color: "var(--muted)", marginTop: 8 }}>We sent a link to {authEmail}. It expires in 1 hour.</p><button onClick={() => { setAuthSent(false); setAuthMode("magic"); }} className="btn-press" style={{ marginTop: 16, minHeight: 44, padding: "0 16px", border: "1px solid var(--divider)", borderRadius: 12, background: "transparent", color: "var(--text)" }}>Use a different email</button></div>) : authMode === "recovery" ? (<form onSubmit={saveNewPassword} style={{ marginTop: 24 }}><label className="small-caps" style={{ color: "var(--muted)" }}>New password</label><input value={authNewPassword} onChange={(e) => setAuthNewPassword(e.target.value)} type="password" placeholder="8+ characters" style={{ marginTop: 8, height: 48, width: "100%", borderRadius: 12, border: "1px solid var(--divider)", padding: "0 16px", background: "var(--surface)" }} />{authError && <p role="alert" style={{ color: "var(--danger)", marginTop: 8, fontSize: 12 }}>{authError}</p>}<button type="submit" disabled={authBusy} className="btn-press" style={{ marginTop: 16, width: "100%", minHeight: 48, borderRadius: 12, background: "var(--brand)", color: "white", fontWeight: 600 }}>{authBusy ? "Saving." : "Save new password"}</button></form>) : authMode === "magic" ? (<form onSubmit={sendMagic} style={{ marginTop: 24 }}><label className="small-caps" style={{ color: "var(--muted)" }}>Email</label><input value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} type="email" placeholder="you@studio.com" style={{ marginTop: 8, height: 48, width: "100%", borderRadius: 12, border: "1px solid var(--divider)", padding: "0 16px", background: "var(--surface)" }} />{authError && <p role="alert" style={{ color: "var(--danger)", marginTop: 8, fontSize: 12 }}>{authError}</p>}<button type="submit" disabled={authBusy} className="btn-press" style={{ marginTop: 16, width: "100%", minHeight: 48, borderRadius: 12, background: "var(--brand)", color: "white", fontWeight: 600 }}>{authBusy ? "Sending." : "Send magic link"}</button><button type="button" onClick={signInGoogle} disabled={authBusy} className="btn-press" style={{ marginTop: 8, width: "100%", minHeight: 48, borderRadius: 12, border: "1px solid var(--divider)", background: "var(--surface)", color: "var(--text)", fontWeight: 500 }}>Continue with Google</button><button type="button" onClick={() => { setAuthMode("password"); setAuthError(null); }} style={{ marginTop: 16, background: "transparent", border: 0, color: "var(--muted)", textDecoration: "underline", fontSize: 12 }}>Use password instead</button></form>) : authMode === "forgot" ? (<form onSubmit={sendReset} style={{ marginTop: 24 }}><label className="small-caps" style={{ color: "var(--muted)" }}>Email</label><input value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} type="email" placeholder="you@studio.com" style={{ marginTop: 8, height: 48, width: "100%", borderRadius: 12, border: "1px solid var(--divider)", padding: "0 16px", background: "var(--surface)" }} />{authError && <p role="alert" style={{ color: "var(--danger)", marginTop: 8, fontSize: 12 }}>{authError}</p>}<button type="submit" disabled={authBusy} className="btn-press" style={{ marginTop: 16, width: "100%", minHeight: 48, borderRadius: 12, background: "var(--brand)", color: "white", fontWeight: 600 }}>{authBusy ? "Sending." : "Send reset link"}</button><button type="button" onClick={() => setAuthMode("password")} style={{ marginTop: 16, background: "transparent", border: 0, color: "var(--muted)", textDecoration: "underline", fontSize: 12 }}>Back to sign in</button></form>) : (<form onSubmit={signInPassword} style={{ marginTop: 24 }}>{authIsSignup && (<><label className="small-caps" style={{ color: "var(--muted)" }}>Full name</label><input value={authName} onChange={(e) => setAuthName(e.target.value)} placeholder="Your name" style={{ marginTop: 8, marginBottom: 16, height: 48, width: "100%", borderRadius: 12, border: "1px solid var(--divider)", padding: "0 16px", background: "var(--surface)" }} /></>)}<label className="small-caps" style={{ color: "var(--muted)" }}>Email</label><input value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} type="email" placeholder="you@studio.com" style={{ marginTop: 8, height: 48, width: "100%", borderRadius: 12, border: "1px solid var(--divider)", padding: "0 16px", background: "var(--surface)" }} /><label className="small-caps" style={{ color: "var(--muted)", display: "block", marginTop: 16 }}>Password</label><input value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} type="password" placeholder="8+ characters" style={{ marginTop: 8, height: 48, width: "100%", borderRadius: 12, border: "1px solid var(--divider)", padding: "0 16px", background: "var(--surface)" }} />{authError && <p role="alert" style={{ color: "var(--danger)", marginTop: 8, fontSize: 12 }}>{authError}</p>}<button type="submit" disabled={authBusy} className="btn-press" style={{ marginTop: 16, width: "100%", minHeight: 48, borderRadius: 12, background: "var(--brand)", color: "white", fontWeight: 600 }}>{authBusy ? "Signing in." : authIsSignup ? "Create account" : "Sign in"}</button><div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}><button type="button" onClick={() => setAuthIsSignup((v) => !v)} style={{ background: "transparent", border: 0, color: "var(--muted)", textDecoration: "underline", fontSize: 12 }}>{authIsSignup ? "Have an account? Sign in" : "No account? Create one"}</button><button type="button" onClick={() => setAuthMode("forgot")} style={{ background: "transparent", border: 0, color: "var(--muted)", textDecoration: "underline", fontSize: 12 }}>Forgot password?</button></div><button type="button" onClick={() => setAuthMode("magic")} style={{ marginTop: 16, background: "transparent", border: 0, color: "var(--muted)", textDecoration: "underline", fontSize: 12 }}>Use magic link instead</button></form>)}
        <div style={{ marginTop: 32, display: "flex", flexWrap: "wrap", gap: 8 }}>{SHORTCUTS.map((s) => (<span key={s.label} style={{ fontSize: 12, color: "var(--muted)", border: "1px solid var(--divider)", borderRadius: 999, padding: "8px" }}>{s.keys} {s.label}</span>))}</div>
      </div>
    </div>
  );

  const activeTemplate = templates.find((t) => t.id === activeTemplateId) || null;
  const selectedProof = proofStack.find((p) => p.id === selectedProofId) || null;
  const paletteResults = paletteQuery.trim() ? visible.filter((c) => c.value.name.toLowerCase().includes(paletteQuery.toLowerCase())).slice(0, 6) : visible.slice(0, 6);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      <header style={{ height: 64, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", borderBottom: "1px solid var(--divider)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}><span style={{ width: 10, height: 10, background: "var(--brand)", borderRadius: 2, flexShrink: 0 }} /><span style={{ fontSize: 15, fontWeight: 500, letterSpacing: "-0.01em" }}>Reach</span><span className="caption" style={{ color: "var(--muted)", display: isDesktopState ? "block" : "none" }}>Outreach, curated.</span></div>
        <nav aria-label="Primary" style={{ display: "flex", gap: 8, background: "var(--surface-2)", borderRadius: 999, padding: 4 }}>
          {(["queue", "contacts"] as View[]).map((v) => (<button key={v} onClick={() => setView(v)} aria-current={view === v ? "page" : undefined} className="btn-press" style={{ minHeight: 40, padding: "0 16px", borderRadius: 999, background: view === v ? "var(--text)" : "transparent", color: view === v ? "var(--bg)" : "var(--muted)", fontSize: 15, fontWeight: 500, textTransform: "capitalize" }}>{v === "queue" ? "Queue" : "Contacts"}</button>))}
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => captureRef.current?.focus()} className="btn-press" style={{ minHeight: 44, padding: "0 16px", borderRadius: 12, background: "var(--brand)", color: "white", fontSize: 15, fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}><Plus size={17} /> Add</button>
          <button onClick={() => { setProfileDraft(profile); setSettingsOpen(true); }} aria-label="Open settings" className="btn-press" style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--text)", color: "var(--bg)", fontSize: 15, fontWeight: 600 }}>{initialsFor(profile.name)}</button>
        </div>
      </header>

      <main style={{ display: "flex", alignItems: "stretch", width: "100%" }}>
        <section style={{ flex: 1, minWidth: 0, padding: 24, paddingBottom: 96 }}>
          <p className="small-caps" style={{ color: "var(--muted)" }}>{view === "queue" ? "Do this next" : "Your outreach"}</p>
          <h1 className="display" style={{ marginTop: 8 }}>{view === "queue" ? "Who do you contact next?" : "Every conversation, held with care."}</h1>
          <form onSubmit={handlePasteAdd} style={{ marginTop: 24, maxWidth: 560, display: "flex", gap: 8 }}>
            <input ref={captureRef} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="Paste handle, link, or name" aria-label="Paste handle, link, or name" style={{ height: 48, flex: 1, borderRadius: 12, border: "1px solid var(--divider)", padding: "0 16px", background: "var(--surface)", fontSize: 15 }} />
            <button type="submit" disabled={!pasteText.trim() || busy} className="btn-press" style={{ minHeight: 48, padding: "0 16px", borderRadius: 12, background: "var(--brand)", color: "white", fontSize: 15, fontWeight: 500, opacity: !pasteText.trim() ? 0.5 : 1 }}>{busy ? "Adding." : "Add to To-Reach"}</button>
          </form>
          {pasteText.trim() && (() => { const pv = parsePasteToContact(pasteText.trim()); return pv.name ? <p className="caption" style={{ color: "var(--muted)", marginTop: 8 }}>Preview: {pv.name} / {pv.channel || "Add channel"} / {pv.link || "No link yet"}</p> : null; })()}

          {view === "queue" && (
            <div style={{ marginTop: 32, maxWidth: 720 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", border: "1px solid var(--divider)", borderRadius: 12, overflow: "hidden" }}>
                {[{ label: "Follow-up due", value: counts.due }, { label: "To reach", value: counts.toReach }, { label: "In conversation", value: counts.inConversation }].map((r) => (<div key={r.label} style={{ padding: 16, textAlign: "center" }}><div style={{ fontSize: 28, fontWeight: 600 }}>{r.value}</div><div className="small-caps" style={{ color: "var(--muted)", marginTop: 8 }}>{r.label}</div></div>))}
              </div>
              {loading ? (<div style={{ marginTop: 24 }}>{[0, 1, 2, 3, 4, 5].map((i) => (<div key={i} className="skeleton" style={{ height: 56, marginTop: 8 }} />))}</div>) : loadError ? (<div style={{ marginTop: 24, border: "1px solid var(--divider)", borderRadius: 12, padding: 24 }}><p className="body" style={{ fontWeight: 600 }}>Couldn&apos;t reach your saved contacts.</p><p className="body" style={{ color: "var(--muted)", marginTop: 8 }}>{loadError}</p><button onClick={loadAll} className="btn-press" style={{ marginTop: 16, minHeight: 40, padding: "0 16px", borderRadius: 12, border: "1px solid var(--divider)", background: "var(--surface)" }}>Try again</button></div>) : queue.length === 0 ? (<div style={{ marginTop: 32, textAlign: "center", padding: 24 }}><p style={{ fontSize: 28, fontWeight: 600 }}>Nothing due today.</p><p className="body" style={{ color: "var(--muted)", marginTop: 8 }}>You are caught up. Add 1 person you admired this week.</p><button onClick={() => captureRef.current?.focus()} className="btn-press" style={{ marginTop: 24, minHeight: 48, padding: "0 16px", borderRadius: 12, background: "var(--brand)", color: "white", fontWeight: 500 }}>Add to To-Reach</button></div>) : (<div style={{ marginTop: 24 }}><p className="small-caps" style={{ color: "var(--muted)" }}>Queue / {queue.length} actionable</p><div style={{ marginTop: 16, borderTop: "1px solid var(--divider)" }}>{queue.map((c, idx) => (<div key={c.id} style={{ minHeight: 56, display: "flex", alignItems: "center", gap: 16, padding: "8px 16px", borderBottom: "1px solid var(--divider)", background: c.id === selectedId ? "var(--surface-2)" : "transparent", borderLeft: idx === 0 ? "2px solid var(--brand)" : "2px solid transparent", cursor: "pointer" }} onClick={() => selectContact(c.id)}><span style={{ width: 8, height: 8, borderRadius: "50%", background: stageColor(c.value.stage), flexShrink: 0 }} /><div style={{ flex: 1, minWidth: 0 }}><div className="body" style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.value.name} {c.value.referredBy ? <span style={{ color: "var(--muted)", fontWeight: 400 }}>Via {c.value.referredBy}</span> : null}</div><div className="caption" style={{ color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{stageLabel(c.value.stage)} / {c.value.nextStep || c.value.whyThem || c.value.contactDetails || "Open to see context"}{c.value.followUpDate ? ` / Due ${formatDate(c.value.followUpDate)}` : ""}</div></div><button onClick={(e) => { e.stopPropagation(); snooze(c); }} className="btn-press" style={{ minHeight: 32, padding: "0 8px", borderRadius: 999, border: "1px solid var(--divider)", background: "transparent", color: "var(--muted)", fontSize: 12 }}>Snooze 4d</button><button onClick={(e) => { e.stopPropagation(); markDone(c); }} className="btn-press" style={{ minHeight: 32, padding: "0 16px", borderRadius: 999, background: "var(--brand)", color: "white", fontSize: 12, fontWeight: 500 }}>Mark done</button></div>))}</div></div>)}
              {proofStack.length > 0 && (<div style={{ marginTop: 32 }}><p className="small-caps" style={{ color: "var(--muted)" }}>Proof Stack / {proofStack.length} wins</p><div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>{proofStack.slice(0, 3).map((p) => (<button key={p.id} onClick={() => selectContact(p.id)} style={{ textAlign: "left", border: "1px solid var(--divider)", borderRadius: 12, padding: 16, background: "var(--surface)" }}><div className="body" style={{ fontWeight: 600 }}>{p.name}</div><div className="body" style={{ color: "var(--muted)", marginTop: 8 }}>{p.text}</div>{p.link ? <div className="caption" style={{ color: "var(--brand)", marginTop: 8, textDecoration: "underline" }}>{p.link}</div> : null}</button>))}</div></div>)}
            </div>
          )}

          {view === "contacts" && (
            <div style={{ marginTop: 32, maxWidth: 720 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <div style={{ position: "relative", flex: 1, minWidth: 240 }}><Search size={17} style={{ position: "absolute", left: 16, top: 16, color: "var(--muted)" }} /><input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, notes, or link" aria-label="Search contacts" style={{ height: 48, width: "100%", borderRadius: 12, border: "1px solid var(--divider)", padding: "0 16px 0 40px", background: "var(--surface)", fontSize: 15 }} />{search && <button onClick={() => setSearch("")} aria-label="Clear search" style={{ position: "absolute", right: 8, top: 8, width: 32, height: 32, borderRadius: "50%", background: "transparent", border: 0 }}><X size={16} /></button>}</div>
                <div role="tablist" aria-label="Filter contacts" style={{ display: "flex", gap: 8 }}>{([{ v: "all", label: "All" }, { v: "to-reach", label: "To reach" }, { v: "follow-up", label: "Follow-up" }, { v: "won", label: "Won" }] as const).map((f) => (<button key={f.v} role="tab" aria-selected={filter === f.v} onClick={() => setFilter(f.v)} className="btn-press" style={{ height: 40, padding: "0 16px", borderRadius: 999, background: filter === f.v ? "var(--text)" : "transparent", color: filter === f.v ? "var(--bg)" : "var(--muted)", fontSize: 15, fontWeight: 500 }}>{f.label}</button>))}</div>
              </div>
              <p className="caption" style={{ color: "var(--muted)", marginTop: 16 }}>{counts.total} contacts / {counts.due} due / {counts.won} won</p>
              {loading ? (<div style={{ marginTop: 16 }}>{[0, 1, 2, 3, 4, 5].map((i) => (<div key={i} className="skeleton" style={{ height: 56, marginTop: 8 }} />))}</div>) : loadError ? (<div style={{ marginTop: 16, border: "1px solid var(--divider)", borderRadius: 12, padding: 24 }}><p className="body" style={{ fontWeight: 600 }}>Couldn&apos;t reach your saved contacts.</p><p className="body" style={{ color: "var(--muted)", marginTop: 8 }}>{loadError}</p><button onClick={loadAll} className="btn-press" style={{ marginTop: 16, minHeight: 40, padding: "0 16px", borderRadius: 12, border: "1px solid var(--divider)", background: "var(--surface)" }}>Try again</button></div>) : filtered.length === 0 ? (contacts.length === 0 && !search && filter === "all" ? (<div style={{ textAlign: "center", padding: 24, marginTop: 16 }}><p style={{ fontSize: 28, fontWeight: 600 }}>No one on your list yet.</p><p className="body" style={{ color: "var(--muted)", marginTop: 8 }}>Start with someone whose work you loved. Paste a handle, add why them, and pitch.</p><button onClick={() => captureRef.current?.focus()} className="btn-press" style={{ marginTop: 24, minHeight: 48, padding: "0 16px", borderRadius: 12, background: "var(--brand)", color: "white", fontWeight: 500 }}>Add contact</button></div>) : (<div style={{ textAlign: "center", padding: 24, marginTop: 16 }}><p className="body" style={{ fontWeight: 600 }}>No matches.</p><p className="body" style={{ color: "var(--muted)", marginTop: 8 }}>Try a different name or note.</p><button onClick={() => { setSearch(""); setFilter("all"); }} className="btn-press" style={{ marginTop: 16, minHeight: 44, padding: "0 16px", borderRadius: 12, border: "1px solid var(--divider)", background: "var(--surface)" }}>Clear search and filters</button></div>)) : (<div style={{ marginTop: 16, borderTop: "1px solid var(--divider)" }}>{filtered.map((c) => { const due = isFollowUpDue(c.value, today); return (<div key={c.id} onClick={() => selectContact(c.id)} style={{ minHeight: 56, display: "flex", alignItems: "center", gap: 16, padding: "8px 16px", borderBottom: "1px solid var(--divider)", background: c.id === selectedId ? "var(--surface-2)" : "transparent", cursor: "pointer" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: stageColor(c.value.stage), flexShrink: 0 }} /><div style={{ flex: 1, minWidth: 0 }}><div className="body" style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.value.name}</div><div className="caption" style={{ color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{stageLabel(c.value.stage)} / {c.value.nextStep || c.value.whyThem || c.value.contactDetails || "Open to see context"}</div></div>{due ? <span style={{ fontSize: 12, fontWeight: 500, color: "var(--danger)", whiteSpace: "nowrap" }}>Due {c.value.followUpDate ? formatDate(c.value.followUpDate) : ""}</span> : null}{c.value.workType ? <span style={{ fontSize: 12, color: "var(--muted)", border: "1px solid var(--divider)", borderRadius: 999, padding: "8px", whiteSpace: "nowrap" }}>{c.value.workType}</span> : null}</div>); })}</div>)}
            </div>
          )}
        </section>

        {selected && (
          <aside style={{ width: isDesktopState ? 400 : "100%", flexShrink: 0, borderLeft: isDesktopState ? "1px solid var(--divider)" : "none", background: "var(--surface)", position: isDesktopState ? "sticky" : "fixed", top: isDesktopState ? 64 : 0, left: 0, right: 0, bottom: 0, zIndex: 40, height: isDesktopState ? "calc(100vh - 64px)" : "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid var(--divider)" }}><span className="small-caps" style={{ color: "var(--muted)" }}>Thread</span><button onClick={() => setSelectedId(null)} aria-label="Close thread" className="btn-press" style={{ width: 40, height: 40, borderRadius: 12, background: "transparent", border: 0, color: "var(--text)" }}><X size={18} /></button></div>
            <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
              <h2 className="display" style={{ fontSize: 28 }}>{selected.value.name}</h2>
              <p className="caption" style={{ color: "var(--muted)", marginTop: 8 }}>{selected.value.channel} / Added {formatDate(selected.value.createdAt.slice(0, 10))}{selected.value.referredBy ? ` / Via ${selected.value.referredBy}` : ""}</p>
              <div style={{ marginTop: 24, display: "flex", flexWrap: "wrap", gap: 8 }}>{STAGES.map((s) => { const active = selected.value.stage === s.value; return (<button key={s.value} onClick={() => setStage(selected, s.value)} aria-pressed={active} className="btn-press" style={{ minHeight: 32, padding: "0 16px", borderRadius: 999, border: "1px solid var(--divider)", background: active ? "var(--text)" : "transparent", color: active ? "var(--bg)" : "var(--muted)", fontSize: 12, fontWeight: 500 }}>{s.label}</button>); })}</div>
              <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 16 }}>
                <div><label className="small-caps" style={{ color: "var(--muted)" }}>Contact</label><input value={contactDetailDraft} onChange={(e) => setContactDetailDraft(e.target.value)} onBlur={saveContactBasics} placeholder="@handle, email, or phone" style={{ marginTop: 8, height: 48, width: "100%", borderRadius: 12, border: "1px solid var(--divider)", padding: "0 16px", background: "var(--surface)", fontSize: 15 }} /></div>
                <div><label className="small-caps" style={{ color: "var(--muted)" }}>Link</label><input value={contactLinkDraft} onChange={(e) => setContactLinkDraft(e.target.value)} onBlur={saveContactBasics} placeholder="https://..." style={{ marginTop: 8, height: 48, width: "100%", borderRadius: 12, border: "1px solid var(--divider)", padding: "0 16px", background: "var(--surface)", fontSize: 15 }} />{safeHref(selected.value.link) ? <a href={safeHref(selected.value.link)} target="_blank" rel="noopener noreferrer" style={{ display: "block", marginTop: 8, fontSize: 12, color: "var(--text)", textDecoration: "underline" }}>Open link</a> : null}</div>
              </div>
              {selected.value.stage !== "to-reach" && (<div style={{ marginTop: 24, display: "flex", gap: 16, flexWrap: "wrap" }}><div style={{ flex: 1, minWidth: 160 }}><label className="small-caps" style={{ color: "var(--muted)" }}>Work type</label><select value={selected.value.workType} onChange={(e) => persistContact(selected, { ...selected.value, workType: e.target.value as WorkType })} style={{ marginTop: 8, height: 48, width: "100%", borderRadius: 12, border: "1px solid var(--divider)", padding: "0 16px", background: "var(--surface)", fontSize: 15 }}><option value="">Select work</option>{WORK_TYPES.map((w) => (<option key={w.value} value={w.value}>{w.label}</option>))}</select></div>{(selected.value.stage === "in-conversation" || selected.value.stage === "follow-up") && (<div style={{ flex: 1, minWidth: 160 }}><label className="small-caps" style={{ color: "var(--muted)" }}>Follow-up date</label><input type="date" value={selected.value.followUpDate} onChange={(e) => persistContact(selected, { ...selected.value, followUpDate: e.target.value })} style={{ marginTop: 8, height: 48, width: "100%", borderRadius: 12, border: "1px solid var(--divider)", padding: "0 16px", background: "var(--surface)", fontSize: 15 }} /></div>)}</div>)}
              <div style={{ marginTop: 32 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span className="small-caps" style={{ color: "var(--muted)" }}>Thread / {selected.value.thread.length} entries</span><span className="caption" style={{ color: "var(--muted)" }}>Cmd + Enter saves</span></div>
                <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 16 }}>{selected.value.thread.map((en) => (<div key={en.id} style={{ borderLeft: `2px solid ${en.kind === "win" ? "var(--brand)" : "var(--divider)"}`, paddingLeft: 16 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span className="small-caps" style={{ color: "var(--muted)" }}>{threadLabel(en.kind)} / {formatDate(en.createdAt.slice(0, 10))}</span>{editingEntryId !== en.id && en.kind !== "created" && en.kind !== "stage" ? <button onClick={() => { setEditingEntryId(en.id); setEntryDraft(en.text); }} style={{ background: "transparent", border: 0, color: "var(--muted)", fontSize: 12, textDecoration: "underline" }}>Edit</button> : null}</div>{editingEntryId === en.id ? (<><textarea value={entryDraft} onChange={(e) => setEntryDraft(e.target.value)} rows={3} autoFocus placeholder="1 line. What matters?" style={{ marginTop: 8, width: "100%", borderRadius: 12, border: "1px solid var(--divider)", padding: 16, background: "var(--surface)", fontSize: 15, lineHeight: 1.8 }} />{entryError && <p role="alert" style={{ color: "var(--danger)", fontSize: 12, marginTop: 8 }}>{entryError}</p>}<div style={{ display: "flex", gap: 16, marginTop: 8 }}><button onClick={saveThreadEntry} className="btn-press" style={{ minHeight: 32, padding: "0 16px", borderRadius: 12, background: "var(--brand)", color: "white", fontSize: 12, fontWeight: 500 }}>Save</button><button onClick={() => setEditingEntryId(null)} style={{ background: "transparent", border: 0, color: "var(--muted)", fontSize: 12, textDecoration: "underline" }}>Cancel</button></div></>) : (<p className="body" style={{ marginTop: 8, lineHeight: 1.8 }}>{en.text}</p>)}</div>))}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 24 }}>{([{ k: "why", label: "Add Why" }, { k: "sent", label: "Add Pitch sent" }, { k: "next", label: "Add Next step" }, { k: "note", label: "Add Note" }] as const).map((a) => (<button key={a.k} onClick={() => addThreadEntry(a.k)} className="btn-press" style={{ minHeight: 32, padding: "0 16px", borderRadius: 999, border: "1px solid var(--divider)", background: "transparent", color: "var(--muted)", fontSize: 12, fontWeight: 500 }}>{a.label}</button>))}</div>
              </div>
              <div style={{ marginTop: 32 }}><p className="small-caps" style={{ color: "var(--muted)" }}>Pitch</p><div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 8 }}>{templates.map((t) => { const active = t.id === activeTemplateId; return (<button key={t.id} onClick={() => setActiveTemplateId(active ? null : t.id)} aria-pressed={active} className="btn-press" style={{ minHeight: 32, padding: "0 16px", borderRadius: 999, border: "1px solid var(--divider)", background: active ? "var(--text)" : "transparent", color: active ? "var(--bg)" : "var(--muted)", fontSize: 12, fontWeight: 500 }}>{t.title}</button>); })}</div>{activeTemplate && (<div style={{ marginTop: 16, border: "1px solid var(--divider)", borderRadius: 12, padding: 16 }}><p className="body" style={{ whiteSpace: "pre-wrap", lineHeight: 1.8 }}>{activeTemplate.text.replace("[Name]", selected.value.name).replace("[detail]", selected.value.whyThem || "your recent work")}{selectedProof ? `\n\nProof: ${selectedProof.text} - ${selectedProof.name}${selectedProof.link ? ` (${selectedProof.link})` : ""}` : ""}</p><button onClick={() => copyText(activeTemplate.text.replace("[Name]", selected.value.name).replace("[detail]", selected.value.whyThem || "your recent work") + (selectedProof ? `\n\nProof: ${selectedProof.text} - ${selectedProof.name}` : ""), `template-${activeTemplate.id}`)} className="btn-press" style={{ marginTop: 16, minHeight: 40, padding: "0 16px", borderRadius: 12, background: "var(--brand)", color: "white", fontSize: 15, fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>{copiedKey === `template-${activeTemplate.id}` ? <><Check size={16} /> Copied</> : <><Copy size={16} /> Copy pitch</>}</button><div style={{ marginTop: 16 }}><p className="small-caps" style={{ color: "var(--muted)" }}>Attach proof</p><div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>{proofStack.length === 0 ? <span className="caption" style={{ color: "var(--muted)" }}>No wins yet. Mark 1 contact Won to build Proof Stack.</span> : proofStack.map((p) => (<button key={p.id} onClick={() => setSelectedProofId(selectedProofId === p.id ? null : p.id)} className="btn-press" style={{ minHeight: 32, padding: "0 16px", borderRadius: 999, border: "1px solid var(--divider)", background: selectedProofId === p.id ? "var(--text)" : "transparent", color: selectedProofId === p.id ? "var(--bg)" : "var(--muted)", fontSize: 12 }}>{p.name}</button>))}</div></div></div>)}
              </div>
              {selected.value.stage === "won" && (<div style={{ marginTop: 32, border: "1px solid var(--divider)", borderRadius: 12, padding: 16 }}><p className="small-caps" style={{ color: "var(--muted)" }}>Win / Proof Stack</p><label className="small-caps" style={{ color: "var(--muted)", display: "block", marginTop: 16 }}>What worked?</label><textarea value={winDraft} onChange={(e) => setWinDraft(e.target.value)} rows={3} placeholder="They loved the editorial direction. Quick yes after 2nd follow-up." style={{ marginTop: 8, width: "100%", borderRadius: 12, border: "1px solid var(--divider)", padding: 16, background: "var(--surface)", fontSize: 15, lineHeight: 1.8 }} /><label className="small-caps" style={{ color: "var(--muted)", display: "block", marginTop: 16 }}>Who else should I reach? Handle or name</label><input value={winReferral} onChange={(e) => setWinReferral(e.target.value)} placeholder="@studio or Studio Name" style={{ marginTop: 8, height: 48, width: "100%", borderRadius: 12, border: "1px solid var(--divider)", padding: "0 16px", background: "var(--surface)", fontSize: 15 }} /><button onClick={saveWin} className="btn-press" style={{ marginTop: 16, minHeight: 44, padding: "0 16px", borderRadius: 12, background: "var(--brand)", color: "white", fontWeight: 500 }}>Save win</button></div>)}
              <div style={{ marginTop: 32, display: "flex", gap: 16, paddingBottom: 24 }}><button onClick={() => markDone(selected)} className="btn-press" style={{ minHeight: 44, padding: "0 16px", borderRadius: 12, background: "var(--brand)", color: "white", fontWeight: 500 }}>Mark done</button><button onClick={() => snooze(selected)} className="btn-press" style={{ minHeight: 44, padding: "0 16px", borderRadius: 12, border: "1px solid var(--divider)", background: "transparent", color: "var(--text)" }}>Snooze 4 days</button><button onClick={() => archiveContact(selected)} className="btn-press" style={{ minHeight: 44, padding: "0 16px", borderRadius: 12, background: "transparent", border: 0, color: "var(--danger)", display: "flex", alignItems: "center", gap: 8 }}><Trash2 size={16} /> Archive</button></div>
            </div>
          </aside>
        )}
      </main>

      {!isDesktopState && !settingsOpen && !paletteOpen && (
        <nav aria-label="Navigation" style={{ position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)", zIndex: 40, display: "flex", alignItems: "center", justifyContent: "space-between", width: "calc(100vw - 32px)", maxWidth: 420, border: "1px solid var(--divider)", borderRadius: 999, padding: 8, background: "var(--surface)", boxShadow: "var(--shadow)" }}>
          <button onClick={() => { setView("queue"); setSelectedId(null); }} className="btn-press" style={{ minWidth: 72, padding: "8px 16px", borderRadius: 999, background: view === "queue" && !selected ? "var(--text)" : "transparent", color: view === "queue" && !selected ? "var(--bg)" : "var(--muted)", fontSize: 12, fontWeight: 500 }}>Queue</button>
          <button onClick={() => { setView("contacts"); setSelectedId(null); }} className="btn-press" style={{ minWidth: 72, padding: "8px 16px", borderRadius: 999, background: view === "contacts" && !selected ? "var(--text)" : "transparent", color: view === "contacts" && !selected ? "var(--bg)" : "var(--muted)", fontSize: 12, fontWeight: 500 }}>Contacts</button>
          <button onClick={() => captureRef.current?.focus()} aria-label="Add contact" className="btn-press" style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--brand)", color: "white", border: 0 }}><Plus size={24} /></button>
          <button onClick={() => { setProfileDraft(profile); setSettingsOpen(true); }} className="btn-press" style={{ minWidth: 72, padding: "8px 16px", borderRadius: 999, background: "transparent", color: "var(--muted)", fontSize: 12, fontWeight: 500 }}>You</button>
        </nav>
      )}

      {settingsOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", justifyContent: "flex-end" }} role="dialog" aria-modal="true" aria-label="Settings">
          <button aria-label="Close settings" onClick={() => setSettingsOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", border: 0 }} />
          <aside className="animate-drawer" style={{ position: "relative", width: "min(400px, 92vw)", background: "var(--surface)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid var(--divider)" }}><span className="small-caps" style={{ color: "var(--muted)" }}>Settings</span><button onClick={() => setSettingsOpen(false)} aria-label="Close settings" className="btn-press" style={{ width: 40, height: 40, borderRadius: 12, background: "transparent", border: 0 }}><X size={18} /></button></div>
            <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
              <section><p className="small-caps" style={{ color: "var(--muted)" }}>Profile</p><label className="small-caps" style={{ color: "var(--muted)", display: "block", marginTop: 16 }}>Name</label><input value={profileDraft.name} onChange={(e) => setProfileDraft({ ...profileDraft, name: e.target.value })} placeholder="Your name" style={{ marginTop: 8, height: 48, width: "100%", borderRadius: 12, border: "1px solid var(--divider)", padding: "0 16px", background: "var(--surface)", fontSize: 15 }} /><label className="small-caps" style={{ color: "var(--muted)", display: "block", marginTop: 16 }}>What I do</label><input value={profileDraft.whatIDo} onChange={(e) => setProfileDraft({ ...profileDraft, whatIDo: e.target.value })} placeholder="Visual designer, branding and editorial" style={{ marginTop: 8, height: 48, width: "100%", borderRadius: 12, border: "1px solid var(--divider)", padding: "0 16px", background: "var(--surface)", fontSize: 15 }} /><label className="small-caps" style={{ color: "var(--muted)", display: "block", marginTop: 16 }}>Open for</label><input value={profileDraft.openFor} onChange={(e) => setProfileDraft({ ...profileDraft, openFor: e.target.value })} placeholder="Branding, editorial, social" style={{ marginTop: 8, height: 48, width: "100%", borderRadius: 12, border: "1px solid var(--divider)", padding: "0 16px", background: "var(--surface)", fontSize: 15 }} /><button onClick={saveProfile} className="btn-press" style={{ marginTop: 16, minHeight: 44, padding: "0 16px", borderRadius: 12, background: "var(--brand)", color: "white", fontWeight: 500 }}>Save profile</button><p className="caption" style={{ color: "var(--muted)", marginTop: 8 }}>Signed in as {user?.email || "Signed in"}</p></section>
              <section style={{ marginTop: 32 }}><p className="small-caps" style={{ color: "var(--muted)" }}>Proof Stack / {proofStack.length} wins</p>{proofStack.length === 0 ? <p className="body" style={{ color: "var(--muted)", marginTop: 16 }}>No wins yet. Mark 1 contact Won to build proof.</p> : proofStack.map((p) => (<div key={p.id} style={{ marginTop: 16, border: "1px solid var(--divider)", borderRadius: 12, padding: 16 }}><p className="body" style={{ fontWeight: 600 }}>{p.name}</p><p className="body" style={{ color: "var(--muted)", marginTop: 8 }}>{p.text}</p></div>))}</section>
              <section style={{ marginTop: 32 }}><p className="small-caps" style={{ color: "var(--muted)" }}>Appearance</p><div style={{ marginTop: 16, display: "flex", gap: 8 }}>{(["system", "light", "dark"] as ThemeMode[]).map((m) => (<button key={m} onClick={() => { setThemeMode(m); saveSettings(m, templates, profile, selectedId).catch(() => {}); }} className="btn-press" style={{ minHeight: 40, padding: "0 16px", borderRadius: 999, background: themeMode === m ? "var(--text)" : "transparent", color: themeMode === m ? "var(--bg)" : "var(--muted)", border: "1px solid var(--divider)", fontSize: 15, textTransform: "capitalize" }}>{m}</button>))}</div><div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 8 }}>{SHORTCUTS.map((s) => (<span key={s.label} style={{ fontSize: 12, color: "var(--muted)", border: "1px solid var(--divider)", borderRadius: 999, padding: "8px" }}>{s.keys} {s.label}</span>))}</div></section>
              <section style={{ marginTop: 32 }}><p className="small-caps" style={{ color: "var(--muted)" }}>Data</p><button onClick={exportCSV} className="btn-press" style={{ marginTop: 16, minHeight: 44, padding: "0 16px", borderRadius: 12, border: "1px solid var(--divider)", background: "var(--surface)", display: "flex", alignItems: "center", gap: 8 }}><Download size={16} /> Export CSV</button><button onClick={async () => { setSettingsOpen(false); await supabase.auth.signOut(); setContacts([]); setSelectedId(null); }} className="btn-press" style={{ marginTop: 8, minHeight: 44, padding: "0 16px", borderRadius: 12, border: "1px solid var(--divider)", background: "transparent", color: "var(--text)" }}>Sign out</button>{!showDeleteAll ? <button onClick={() => setShowDeleteAll(true)} style={{ marginTop: 16, background: "transparent", border: 0, color: "var(--danger)", fontSize: 12, textDecoration: "underline" }}>Delete all my data</button> : (<div style={{ marginTop: 16, border: "1px solid var(--divider)", borderRadius: 12, padding: 16 }}><p className="body" style={{ fontWeight: 600 }}>Delete all my data?</p><p className="body" style={{ color: "var(--muted)", marginTop: 8 }}>Type DELETE to confirm. This cannot be undone.</p><input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder="Type DELETE" style={{ marginTop: 16, height: 48, width: "100%", borderRadius: 12, border: "1px solid var(--divider)", padding: "0 16px", background: "var(--surface)", fontSize: 15 }} /><div style={{ display: "flex", gap: 8, marginTop: 16 }}><button onClick={() => { setShowDeleteAll(false); setDeleteConfirm(""); }} className="btn-press" style={{ flex: 1, minHeight: 44, borderRadius: 12, border: "1px solid var(--divider)", background: "transparent" }}>Cancel</button><button onClick={deleteAll} disabled={deleteConfirm !== "DELETE" || deleteAllBusy} className="btn-press" style={{ flex: 1, minHeight: 44, borderRadius: 12, background: "var(--danger)", color: "white", opacity: deleteConfirm !== "DELETE" ? 0.5 : 1 }}>{deleteAllBusy ? "Deleting." : "Delete everything"}</button></div></div>)}</section>
            </div>
          </aside>
        </div>
      )}

      {paletteOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", justifyContent: "center", paddingTop: 96 }} role="dialog" aria-modal="true" aria-label="Command palette">
          <button aria-label="Close palette" onClick={() => setPaletteOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", border: 0 }} />
          <div className="animate-fade" style={{ position: "relative", width: "min(560px, 92vw)", background: "var(--surface)", borderRadius: 16, boxShadow: "var(--shadow)", overflow: "hidden", height: "fit-content" }}>
            <div style={{ padding: 16, borderBottom: "1px solid var(--divider)", display: "flex", alignItems: "center", gap: 8 }}><Search size={17} style={{ color: "var(--muted)" }} /><input ref={paletteRef} value={paletteQuery} onChange={(e) => setPaletteQuery(e.target.value)} placeholder="Search contacts, or type a handle to create" autoFocus style={{ flex: 1, border: 0, outline: "none", background: "transparent", fontSize: 15, color: "var(--text)" }} /></div>
            <div style={{ maxHeight: 320, overflowY: "auto" }}>
              <button onClick={() => { setPaletteOpen(false); setView("queue"); }} style={{ width: "100%", textAlign: "left", padding: 16, background: "transparent", border: 0, borderBottom: "1px solid var(--divider)" }}><span className="body" style={{ fontWeight: 500 }}>Go to Queue</span><span className="caption" style={{ color: "var(--muted)", display: "block", marginTop: 8 }}>Cmd + K / Queue</span></button>
              <button onClick={() => { setPaletteOpen(false); setView("contacts"); }} style={{ width: "100%", textAlign: "left", padding: 16, background: "transparent", border: 0, borderBottom: "1px solid var(--divider)" }}><span className="body" style={{ fontWeight: 500 }}>Go to Contacts</span><span className="caption" style={{ color: "var(--muted)", display: "block", marginTop: 8 }}>Cmd + K / Contacts</span></button>
              {paletteResults.map((c) => (<button key={c.id} onClick={() => { setPaletteOpen(false); selectContact(c.id); setView("contacts"); }} style={{ width: "100%", textAlign: "left", padding: 16, background: "transparent", border: 0, borderBottom: "1px solid var(--divider)", display: "flex", alignItems: "center", gap: 16 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: stageColor(c.value.stage) }} /><span style={{ flex: 1, minWidth: 0 }}><span className="body" style={{ fontWeight: 500, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.value.name}</span><span className="caption" style={{ color: "var(--muted)" }}>{stageLabel(c.value.stage)}</span></span><ChevronDown size={16} style={{ transform: "rotate(-90deg)", color: "var(--muted)" }} /></button>))}
              {paletteQuery.trim() && (<button onClick={() => { setPasteText(paletteQuery); setPaletteOpen(false); setTimeout(() => captureRef.current?.focus(), 100); }} style={{ width: "100%", textAlign: "left", padding: 16, background: "transparent", border: 0 }}><span className="body" style={{ fontWeight: 500 }}>Create contact: {paletteQuery}</span><span className="caption" style={{ color: "var(--muted)", display: "block", marginTop: 8 }}>Enter to add to To-Reach</span></button>)}
            </div>
            <div style={{ padding: 16, borderTop: "1px solid var(--divider)", display: "flex", gap: 16 }}><span className="caption" style={{ color: "var(--muted)" }}>Cmd + K palette</span><span className="caption" style={{ color: "var(--muted)" }}>/ Search</span><span className="caption" style={{ color: "var(--muted)" }}>N New</span><span className="caption" style={{ color: "var(--muted)" }}>Esc Close</span></div>
          </div>
        </div>
      )}

      {toast && (<div role="status" className="toast-in" style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 70, display: "flex", alignItems: "center", gap: 8, borderRadius: 999, padding: "16px", background: "#0D0D0C", color: "white", fontSize: 15, fontWeight: 500, boxShadow: "var(--shadow)", whiteSpace: "nowrap" }}><Check size={16} /> {toast}</div>)}
      {pendingArchive && (<div role="status" className="toast-in" style={{ position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)", zIndex: 70, display: "flex", alignItems: "center", gap: 16, borderRadius: 999, padding: "16px", background: "#0D0D0C", color: "white", fontSize: 15, fontWeight: 500, boxShadow: "var(--shadow)", whiteSpace: "nowrap" }}><span>Archived {pendingArchive.contact.value.name}.</span><button onClick={undoArchive} style={{ minHeight: 32, padding: "0 16px", borderRadius: 999, background: "white", color: "black", fontSize: 12, fontWeight: 600 }}>Undo</button></div>)}
    </div>
  );
}
