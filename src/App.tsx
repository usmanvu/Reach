import { useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from './supabaseClient'

type Status = 'New' | 'Reached Out' | 'Replied' | 'Follow-up' | 'Closed'
type Platform = 'Instagram' | 'TikTok' | 'YouTube' | 'X' | 'LinkedIn' | 'Email' | 'Other'

interface Contact {
  id: string
  name: string
  handle: string
  platform: Platform
  link: string
  status: Status
  lastContact: string
  notes: string
  createdAt: string
}

const STATUSES: Status[] = ['New', 'Reached Out', 'Replied', 'Follow-up', 'Closed']
const PLATFORMS: Platform[] = ['Instagram', 'TikTok', 'YouTube', 'X', 'LinkedIn', 'Email', 'Other']

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDate(v: string): string {
  if (!v) return '—'
  const d = new Date(`${v}T12:00:00`)
  if (Number.isNaN(d.getTime())) return v
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function daysSince(v: string): number | null {
  if (!v) return null
  const d = new Date(`${v}T12:00:00`)
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  return Math.floor((now.getTime() - d.getTime()) / 86400000)
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0].slice(0, 1) + parts[parts.length - 1].slice(0, 1)).toUpperCase()
}

function platformUrl(platform: Platform, handle: string): string {
  const h = handle.replace(/^@/, '').trim()
  if (!h) return ''
  if (platform === 'Instagram') return `https://instagram.com/${h}`
  if (platform === 'TikTok') return `https://tiktok.com/@${h}`
  if (platform === 'YouTube') return `https://youtube.com/@${h}`
  if (platform === 'X') return `https://x.com/${h}`
  if (platform === 'LinkedIn') return `https://linkedin.com/in/${h}`
  if (platform === 'Email') return `mailto:${h}`
  return `https://${h}`
}

function normalizeLink(input: string, platform: Platform): string {
  const s = input.trim()
  if (!s) return ''
  if (s.startsWith('http://') || s.startsWith('https://')) return s
  if (s.startsWith('@')) return platformUrl(platform, s)
  const dl = s.toLowerCase()
  if (dl.includes('tiktok.com') || dl.includes('youtube.com') || dl.includes('instagram.com') || dl.includes('linkedin.com') || dl.includes('x.com')) {
    return `https://${s}`
  }
  if (s.includes('/')) {
    const parts = s.split('/')
    const domain = parts[0]
    const rest = parts.slice(1)
    return `https://${domain}/${rest.join('/')}`
  }
  return platformUrl(platform, s)
}

type FormState = Omit<Contact, 'id' | 'createdAt'>

const EMPTY_FORM: FormState = {
  name: '',
  handle: '',
  platform: 'Instagram',
  link: '',
  status: 'New',
  lastContact: todayISO(),
  notes: '',
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [authMsg, setAuthMsg] = useState('')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'All' | Status>('All')
  const [platformFilter, setPlatformFilter] = useState<'All' | Platform>('All')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false)
      const saved = localStorage.getItem('reach-contacts')
      if (saved) {
        try {
          setContacts(JSON.parse(saved) as Contact[])
        } catch {
          setContacts([])
        }
      }
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setAuthLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!supabase || !user) return
    const load = async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      if (error) {
        setLoading(false)
        return
      }
      const mapped: Contact[] = (data ?? []).map((row: Record<string, unknown>) => ({
        id: String(row.id),
        name: String(row.name ?? ''),
        handle: String(row.handle ?? ''),
        platform: (String(row.platform ?? 'Instagram') as Platform),
        link: String(row.link ?? ''),
        status: (String(row.status ?? 'New') as Status),
        lastContact: String(row.last_contact ?? ''),
        notes: String(row.notes ?? ''),
        createdAt: String(row.created_at ?? ''),
      }))
      setContacts(mapped)
      setLoading(false)
    }
    load()
  }, [user])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return contacts.filter((c) => {
      if (statusFilter !== 'All' && c.status !== statusFilter) return false
      if (platformFilter !== 'All' && c.platform !== platformFilter) return false
      if (!q) return true
      return (
        c.name.toLowerCase().includes(q) ||
        c.handle.toLowerCase().includes(q) ||
        c.notes.toLowerCase().includes(q) ||
        c.platform.toLowerCase().includes(q)
      )
    })
  }, [contacts, search, statusFilter, platformFilter])

  const stats = useMemo(() => {
    const total = contacts.length
    const replied = contacts.filter((c) => c.status === 'Replied').length
    const followUp = contacts.filter((c) => {
      const d = daysSince(c.lastContact)
      return d !== null && d >= 7 && c.status !== 'Closed' && c.status !== 'Replied'
    }).length
    const thisWeek = contacts.filter((c) => {
      const d = daysSince(c.lastContact)
      return d !== null && d >= 0 && d <= 7
    }).length
    return { total, replied, followUp, thisWeek }
  }, [contacts])

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setAuthMsg('')
    if (!supabase) {
      setAuthMsg('Demo mode: Supabase is not configured. Add your Vercel env vars to enable magic-link login.')
      return
    }
    if (!email.trim()) {
      setAuthMsg('Enter your email first.')
      return
    }
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) setAuthMsg(error.message)
    else setAuthMsg(`Magic link sent to ${email.trim()}. Check your inbox and spam.`)
  }

  async function handleSignOut() {
    if (supabase) await supabase.auth.signOut()
    setUser(null)
    setContacts([])
  }

  function resetForm() {
    setForm({ ...EMPTY_FORM, lastContact: todayISO() })
    setEditingId(null)
    setShowForm(false)
  }

  function startEdit(c: Contact) {
    setEditingId(c.id)
    setForm({
      name: c.name,
      handle: c.handle,
      platform: c.platform,
      link: c.link,
      status: c.status,
      lastContact: c.lastContact,
      notes: c.notes,
    })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    const link = form.link.trim() ? normalizeLink(form.link, form.platform) : normalizeLink(form.handle, form.platform)
    const cleaned: FormState = { ...form, name: form.name.trim(), handle: form.handle.trim(), link }

    if (supabase && user) {
      if (editingId) {
        const { error } = await supabase
          .from('contacts')
          .update({
            name: cleaned.name,
            handle: cleaned.handle,
            platform: cleaned.platform,
            link: cleaned.link,
            status: cleaned.status,
            last_contact: cleaned.lastContact,
            notes: cleaned.notes,
          })
          .eq('id', editingId)
          .eq('user_id', user.id)
        if (!error) {
          setContacts((prev) => prev.map((c) => (c.id === editingId ? { ...c, ...cleaned } : c)))
          resetForm()
        }
        return
      }
      const { data, error } = await supabase
        .from('contacts')
        .insert({
          user_id: user.id,
          name: cleaned.name,
          handle: cleaned.handle,
          platform: cleaned.platform,
          link: cleaned.link,
          status: cleaned.status,
          last_contact: cleaned.lastContact,
          notes: cleaned.notes,
        })
        .select()
        .single()
      if (!error && data) {
        const row = data as Record<string, unknown>
        const created: Contact = {
          id: String(row.id),
          name: cleaned.name,
          handle: cleaned.handle,
          platform: cleaned.platform,
          link: cleaned.link,
          status: cleaned.status,
          lastContact: cleaned.lastContact,
          notes: cleaned.notes,
          createdAt: String(row.created_at ?? ''),
        }
        setContacts((prev) => [created, ...prev])
        resetForm()
      }
      return
    }

    if (editingId) {
      const next = contacts.map((c) => (c.id === editingId ? { ...c, ...cleaned } : c))
      setContacts(next)
      localStorage.setItem('reach-contacts', JSON.stringify(next))
    } else {
      const created: Contact = { id: uid(), createdAt: new Date().toISOString(), ...cleaned }
      const next = [created, ...contacts]
      setContacts(next)
      localStorage.setItem('reach-contacts', JSON.stringify(next))
    }
    resetForm()
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this contact?')) return
    if (supabase && user) {
      await supabase.from('contacts').delete().eq('id', id).eq('user_id', user.id)
    }
    const next = contacts.filter((c) => c.id !== id)
    setContacts(next)
    localStorage.setItem('reach-contacts', JSON.stringify(next))
  }

  async function markContacted(id: string) {
    const nextDate = todayISO()
    if (supabase && user) {
      await supabase.from('contacts').update({ last_contact: nextDate, status: 'Reached Out' }).eq('id', id).eq('user_id', user.id)
    }
    const next = contacts.map((c) => (c.id === id ? { ...c, lastContact: nextDate, status: 'Reached Out' as Status } : c))
    setContacts(next)
    localStorage.setItem('reach-contacts', JSON.stringify(next))
  }

  if (authLoading) {
    return (
      <div className="auth-wrap">
        <p style={{ color: '#6b7280' }}>Loading Reach…</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <div className="logo">
            <span className="logo-mark">↗</span> Reach
          </div>
          <h1>Your outreach, in one place.</h1>
          <p>Track creators, follow-ups and conversations. Sign in with a magic link — no password needed. Each account sees only its own contacts.</p>
          {!isSupabaseConfigured && (
            <div className="banner">Demo mode — Supabase is not configured. Add VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY in Vercel to enable real login.</div>
          )}
          <form onSubmit={handleSignIn}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <button className="btn btn-primary" type="submit" style={{ width: '100%', marginTop: 14 }}>
              Send magic link
            </button>
          </form>
          {authMsg && <p className="auth-success" style={{ marginTop: 14 }}>{authMsg}</p>}
          <p style={{ fontSize: 12, marginTop: 16 }}>By signing in you agree to keep your contacts private to your account.</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="logo">
            <span className="logo-mark">↗</span> Reach
          </div>
          <div className="user-chip">
            <span>{user.email}</span>
            <button className="btn btn-small" onClick={handleSignOut}>Sign out</button>
          </div>
        </div>
      </header>

      <main className="wrap">
        <div className="hero">
          <h1>Who are you reaching out to?</h1>
          <p>{loading ? 'Syncing…' : `${contacts.length} contacts • Follow up before they go cold.`}</p>
        </div>

        {!isSupabaseConfigured && (
          <div className="banner">Supabase is not configured — contacts are saved locally in this browser only. Add your Vercel env vars to sync across devices.</div>
        )}

        <section className="stats">
          <div className="stat"><div className="stat-label">Total contacts</div><div className="stat-value">{stats.total}</div><div className="stat-sub">Everyone you track</div></div>
          <div className="stat"><div className="stat-label">Replied</div><div className="stat-value">{stats.replied}</div><div className="stat-sub">Conversations started</div></div>
          <div className="stat"><div className="stat-label">Needs follow-up</div><div className="stat-value">{stats.followUp}</div><div className="stat-sub">No contact in 7+ days</div></div>
          <div className="stat"><div className="stat-label">Active this week</div><div className="stat-value">{stats.thisWeek}</div><div className="stat-sub">Contacted in last 7 days</div></div>
        </section>

        <div className="toolbar">
          <div className="search"><input placeholder="Search name, handle, notes…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'All' | Status)}>
            <option value="All">All statuses</option>
            {STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
          </select>
          <select className="select" value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value as 'All' | Platform)}>
            <option value="All">All platforms</option>
            {PLATFORMS.map((p) => (<option key={p} value={p}>{p}</option>))}
          </select>
          <button className="btn btn-primary" onClick={() => { setForm({ ...EMPTY_FORM, lastContact: todayISO() }); setEditingId(null); setShowForm(true); }}>+ Add contact</button>
        </div>

        {showForm && (
          <form className="form-panel" onSubmit={handleSave}>
            <h3 style={{ margin: '0 0 12px' }}>{editingId ? 'Edit contact' : 'New contact'}</h3>
            <div className="form-grid">
              <div className="field"><label>Name *</label><input required placeholder="e.g. Ayesha Khan" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="field"><label>Handle</label><input placeholder="@username" value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value })} /></div>
              <div className="field"><label>Platform</label><select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value as Platform })}>{PLATFORMS.map((p) => (<option key={p} value={p}>{p}</option>))}</select></div>
              <div className="field"><label>Link</label><input placeholder="https://… or @handle" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} /></div>
              <div className="field"><label>Status</label><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Status })}>{STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}</select></div>
              <div className="field"><label>Last contact</label><input type="date" value={form.lastContact} onChange={(e) => setForm({ ...form, lastContact: e.target.value })} /></div>
              <div className="field field-full"><label>Notes</label><textarea rows={3} placeholder="What did you talk about? What is next?" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn" onClick={resetForm}>Cancel</button>
              <button type="submit" className="btn btn-primary">{editingId ? 'Save changes' : 'Add contact'}</button>
            </div>
          </form>
        )}

        <div className="grid">
          {filtered.length === 0 && (
            <div className="empty">
              <strong style={{ color: '#111827' }}>No contacts yet</strong>
              <p>Add your first creator to start tracking outreach.</p>
              <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Add contact</button>
            </div>
          )}
          {filtered.map((c) => {
            const d = daysSince(c.lastContact)
            return (
              <article className="card" key={c.id}>
                <div className="card-top">
                  <div className="avatar">{getInitials(c.name)}</div>
                  <div>
                    <div className="card-name">{c.name}</div>
                    <div className="card-handle">{c.handle || 'No handle'}</div>
                  </div>
                </div>
                <div className="badges">
                  <span className="badge">{c.platform}</span>
                  <span className={`badge badge-status-${c.status}`}>{c.status}</span>
                </div>
                <div className="meta">
                  <span>Last contact: <strong>{formatDate(c.lastContact)}</strong></span>
                  <span>{d === null ? '' : d === 0 ? '• Today' : d === 1 ? '• Yesterday' : `• ${d} days ago`}</span>
                </div>
                {c.notes && <div className="notes">{c.notes}</div>}
                {c.link && (<a href={c.link.startsWith('http') ? c.link : `https://${c.link}`} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 600 }}>Open profile ↗</a>)}
                <div className="card-actions">
                  <button className="btn btn-small btn-primary" onClick={() => markContacted(c.id)}>Mark contacted</button>
                  <button className="btn btn-small" onClick={() => startEdit(c)}>Edit</button>
                  <button className="btn btn-small btn-danger" onClick={() => handleDelete(c.id)}>Delete</button>
                </div>
              </article>
            )
          })}
        </div>
      </main>
    </div>
  )
}
