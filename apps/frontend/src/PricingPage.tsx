// Stripe Checkout — Pricing Page
//
// Fetches plan catalogue from GET /api/stripe/plans (static, no Stripe call).
// On "Subscribe" click → POST /api/stripe/checkout → redirect to Stripe-hosted page.
// Success/cancel query params (?checkout=success | ?checkout=cancelled) are read on mount.
//
// Free trial state is persisted in localStorage under TRIAL_KEY.
// Trial expires after 48 h, 3 tracks analysed, or 5 scene views — whichever comes first.

import { useEffect, useRef, useState } from 'react'

// ─── Trial constants (import these wherever limits are enforced) ───────────────

// ─── Trial token — localStorage stores only the opaque server-issued token ────
// All limits are enforced server-side (/api/trial/*).

export const TRIAL_TOKEN_KEY = 'sv_trial_token'

export interface TrialStatus {
  active:           boolean
  expired:          boolean
  tracksUsed:       number
  scenesUsed:       number
  tracksRemaining:  number
  scenesRemaining:  number
  expiresAt:        string
  maxTracks:        number
  maxScenes:        number
}

export function getStoredTrialToken(): string | null {
  return localStorage.getItem(TRIAL_TOKEN_KEY)
}

export async function fetchTrialStatus(): Promise<TrialStatus | null> {
  const token = getStoredTrialToken()
  if (!token) return null
  try {
    const res = await fetch('/api/trial/status', { headers: { 'x-trial-token': token } })
    if (!res.ok) return null
    return res.json() as Promise<TrialStatus>
  } catch { return null }
}

export async function isTrialActive(): Promise<boolean> {
  const s = await fetchTrialStatus()
  return s?.active ?? false
}

interface Plan {
  id:          string
  name:        string
  price_cents: number
  interval:    string
  description: string
  features:    string[]
}

interface PricingPageProps {
  onBack: () => void
}

function fmt$(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style:                 'currency',
    currency:              'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

const HIGHLIGHT_ID = 'supervisor'

// ─── Static content blocks ────────────────────────────────────────────────────

function SectionHeader({ label, title }: { label: string; title: string }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ color: '#2563eb', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
        {label}
      </div>
      <h3 style={{ color: '#f8fafc', fontSize: 20, fontWeight: 700, margin: 0 }}>{title}</h3>
    </div>
  )
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map((item) => (
        <li key={item} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14, color: '#94a3b8' }}>
          <span style={{ color: '#2563eb', marginTop: 2, flexShrink: 0, fontSize: 12 }}>◆</span>
          {item}
        </li>
      ))}
    </ul>
  )
}

function Divider() {
  return <div style={{ borderTop: '1px solid #1e293b', margin: '40px 0' }} />
}

// ─── PAYG credits ─────────────────────────────────────────────────────────────

const PAYG_PACKS = [
  { label: 'Per track', price: '$1.50', sub: 'single track' },
  { label: '12-pack',   price: '$15',   sub: '$1.25 / track' },
  { label: '50-pack',   price: '$49',   sub: '$0.98 / track' },
]

function PaygSection() {
  return (
    <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: '28px 24px' }}>
      <SectionHeader label="Pay-As-You-Go" title="Credits" />
      <p style={{ color: '#64748b', fontSize: 14, margin: '0 0 24px', lineHeight: 1.6 }}>
        For one-off projects, small batches, and "I just need to test a few tracks." No subscription required.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {PAYG_PACKS.map((pack) => (
          <div
            key={pack.label}
            style={{
              background: '#1e293b',
              borderRadius: 10,
              padding: '18px 16px',
              textAlign: 'center',
            }}
          >
            <div style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600, marginBottom: 8, letterSpacing: '0.04em' }}>
              {pack.label}
            </div>
            <div style={{ color: '#f8fafc', fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{pack.price}</div>
            <div style={{ color: '#475569', fontSize: 12, marginTop: 4 }}>{pack.sub}</div>
          </div>
        ))}
      </div>
      <p style={{ color: '#475569', fontSize: 12, margin: '16px 0 0', lineHeight: 1.5 }}>
        Includes full HEXIQA analysis, timeline, narrative phrases, audit hash, and clearance readiness.
      </p>
    </div>
  )
}

// ─── Free trial block ─────────────────────────────────────────────────────────

const TRIAL_FEATURES = [
  '3 tracks',
  '5 scene views',
  'Or 48 hours — whichever comes first',
  'Full HEXIQA emotional timeline',
  'Full 360-phrase narrative explanation',
  'Full clearance readiness check',
  'Deterministic audit hash',
  'CSV export enabled',
]

function msToHhMm(ms: number): string {
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return `${h}h ${m}m`
}

function FreeTrialSection({ onTrialStart }: { onTrialStart: () => void }) {
  const [status, setStatus]     = useState<TrialStatus | null>(null)
  const [starting, setStarting] = useState(false)
  const [timeLeft, setTimeLeft] = useState(0)
  const tickRef                 = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load server-side trial status on mount
  useEffect(() => {
    fetchTrialStatus().then((s) => {
      setStatus(s)
      if (s?.active) {
        const remaining = new Date(s.expiresAt).getTime() - Date.now()
        setTimeLeft(Math.max(0, remaining))
      }
    })
  }, [])

  // Tick down the display timer (cosmetic only — expiry enforced server-side)
  useEffect(() => {
    if (!status?.active) return
    const tick = () => setTimeLeft((t) => Math.max(0, t - 30_000))
    tickRef.current = setInterval(tick, 30_000)
    return () => { if (tickRef.current) clearInterval(tickRef.current) }
  }, [status?.active])

  async function activate() {
    setStarting(true)
    try {
      const res = await fetch('/api/trial/start', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to start trial')
      const data = await res.json() as { trialToken: string; expiresAt: string }
      localStorage.setItem(TRIAL_TOKEN_KEY, data.trialToken)
      const remaining = new Date(data.expiresAt).getTime() - Date.now()
      setTimeLeft(Math.max(0, remaining))
      setStatus({
        active: true, expired: false,
        tracksUsed: 0, scenesUsed: 0,
        tracksRemaining: 3, scenesRemaining: 5,
        expiresAt: data.expiresAt, maxTracks: 3, maxScenes: 5,
      })
      onTrialStart()
    } catch {
      setStarting(false)
    }
  }

  const trialLive = status?.active === true
  const trialDone = !!status && !status.active

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #0d1f3c 0%, #0f172a 100%)',
        border: `1px solid ${trialLive ? '#22c55e' : '#2563eb'}`,
        borderRadius: 14,
        padding: '28px 24px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: -30,
          right: -30,
          width: 120,
          height: 120,
          borderRadius: '50%',
          background: 'rgba(37,99,235,0.08)',
        }}
      />

      <SectionHeader label="Start Free" title="Free Trial" />
      <p style={{ color: '#94a3b8', fontSize: 14, margin: '0 0 20px', lineHeight: 1.6 }}>
        Try SyncVision with no credit card. After the trial, choose Pay-As-You-Go or a monthly plan.
      </p>
      <BulletList items={TRIAL_FEATURES} />

      {/* ── Active trial status ── */}
      {trialLive && status && (
        <div style={{
          marginTop: 20,
          background: '#052e16',
          border: '1px solid #166534',
          borderRadius: 10,
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          <div style={{ color: '#86efac', fontWeight: 700, fontSize: 14 }}>Trial active</div>
          <div style={{ display: 'flex', gap: 20 }}>
            <span style={{ color: '#4ade80', fontSize: 13 }}>
              {status.tracksRemaining} track{status.tracksRemaining !== 1 ? 's' : ''} remaining
            </span>
            <span style={{ color: '#4ade80', fontSize: 13 }}>
              {status.scenesRemaining} scene view{status.scenesRemaining !== 1 ? 's' : ''} remaining
            </span>
            <span style={{ color: '#4ade80', fontSize: 13 }}>{msToHhMm(timeLeft)} left</span>
          </div>
        </div>
      )}

      {/* ── Expired / exhausted ── */}
      {trialDone && status && (
        <div style={{
          marginTop: 20,
          background: '#1c1917',
          border: '1px solid #44403c',
          borderRadius: 10,
          padding: '14px 16px',
          color: '#a8a29e',
          fontSize: 13,
        }}>
          {status.expired
            ? 'Your 48-hour trial has ended.'
            : status.tracksRemaining === 0
            ? 'You have used all 3 trial tracks.'
            : 'You have used all 5 trial scene views.'}
          {' '}Choose a plan below to continue.
        </div>
      )}

      {/* ── CTA ── */}
      {!status && (
        <button
          onClick={activate}
          disabled={starting}
          style={{
            marginTop: 24,
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '12px 28px',
            fontWeight: 700,
            fontSize: 15,
            cursor: starting ? 'not-allowed' : 'pointer',
            opacity: starting ? 0.7 : 1,
            width: '100%',
          }}
        >
          {starting ? 'Starting…' : 'Start Free Trial'}
        </button>
      )}
      {trialLive && (
        <button
          onClick={onTrialStart}
          style={{
            marginTop: 16,
            background: '#166534',
            color: '#86efac',
            border: '1px solid #166534',
            borderRadius: 8,
            padding: '12px 28px',
            fontWeight: 700,
            fontSize: 15,
            cursor: 'pointer',
            width: '100%',
          }}
        >
          Back to App
        </button>
      )}
    </div>
  )
}

// ─── Architecture pill badges ─────────────────────────────────────────────────

function Pill({ label, sub }: { label: string; sub: string }) {
  return (
    <div
      style={{
        background: '#1e293b',
        borderRadius: 8,
        padding: '10px 14px',
        display: 'inline-flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      <span style={{ color: '#f8fafc', fontSize: 14, fontWeight: 700 }}>{label}</span>
      <span style={{ color: '#64748b', fontSize: 11 }}>{sub}</span>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export function PricingPage({ onBack }: PricingPageProps) {
  const [plans, setPlans]           = useState<Plan[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [checkoutStatus, setCheckoutStatus] = useState<'success' | 'cancelled' | null>(null)
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const status = params.get('checkout')
    if (status === 'success') setCheckoutStatus('success')
    if (status === 'cancelled') setCheckoutStatus('cancelled')
    if (status) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  useEffect(() => {
    fetch('/api/stripe/plans')
      .then((r) => r.json())
      .then((data: { plans: Plan[] }) => { setPlans(data.plans); setLoading(false) })
      .catch((e) => { setError(e instanceof Error ? e.message : 'Failed to load plans'); setLoading(false) })
  }, [])

  async function handleCheckout(planId: string) {
    setLoadingPlan(planId)
    setCheckoutError(null)
    try {
      const res  = await fetch('/api/stripe/checkout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ planId }),
      })
      const data = await res.json() as { url?: string; error?: string }
      if (!res.ok || !data.url) {
        setCheckoutError(data.error ?? 'Checkout session failed')
        setLoadingPlan(null)
        return
      }
      window.location.href = data.url
    } catch (e) {
      setCheckoutError(e instanceof Error ? e.message : 'Network error')
      setLoadingPlan(null)
    }
  }

  return (
    <div>
      {/* Back nav */}
      <div style={{ marginBottom: 28 }}>
        <button
          onClick={onBack}
          style={{
            background: 'transparent', border: 'none', color: '#2563eb',
            fontSize: 14, cursor: 'pointer', padding: 0, textDecoration: 'underline',
          }}
        >
          ← Scene Selection
        </button>
      </div>

      {/* Checkout status banners */}
      {checkoutStatus === 'success' && (
        <div style={{
          background: '#052e16', border: '1px solid #166534', borderRadius: 10,
          padding: '14px 20px', marginBottom: 28, color: '#86efac',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 20 }}>✓</span>
          <div>
            <strong>Payment successful.</strong> Your subscription is now active. Check your email for confirmation.
          </div>
        </div>
      )}
      {checkoutStatus === 'cancelled' && (
        <div style={{
          background: '#1c1917', border: '1px solid #44403c', borderRadius: 10,
          padding: '14px 20px', marginBottom: 28, color: '#a8a29e',
        }}>
          Checkout cancelled — no charge was made. Choose a plan below to try again.
        </div>
      )}

      {/* ── Hero ── */}
      <div style={{ marginBottom: 40 }}>
        <h2 style={{ color: '#f8fafc', fontSize: 28, fontWeight: 800, margin: '0 0 10px', lineHeight: 1.2 }}>
          Auditable. Deterministic. Decision Engine.
        </h2>
        <p style={{ color: '#64748b', fontSize: 15, margin: 0, lineHeight: 1.7 }}>
          SyncVision is not an AI model. It does not hallucinate, drift, or reinterpret.
          It is a rules-based, invariant emotional analysis engine — every score reproducible,
          every explanation traceable, every decision defensible.
        </p>
      </div>

      {/* ── Why SyncVision Exists ── */}
      <div style={{ background: '#1e293b', borderRadius: 14, padding: '28px 24px', marginBottom: 16 }}>
        <SectionHeader label="The Problem" title="Why SyncVision Exists" />
        <p style={{ color: '#94a3b8', fontSize: 14, margin: '0 0 16px', lineHeight: 1.7 }}>
          Music supervision has always relied on taste, instinct, and subjective interpretation — but studios,
          agencies, and publishers increasingly demand defensible, reproducible, audit-ready decisions.
          Emotional fit alone is not enough. Clearance readiness alone is not enough. And "AI-style guessing"
          is never acceptable in a legal, editorial, or broadcast environment.
        </p>
        <div
          style={{
            background: '#0f172a',
            borderLeft: '3px solid #2563eb',
            borderRadius: '0 8px 8px 0',
            padding: '14px 18px',
            color: '#cbd5e1',
            fontSize: 14,
            lineHeight: 1.6,
            fontStyle: 'italic',
          }}
        >
          How do we evaluate a track's emotional fit AND its clearance readiness in a way that is
          deterministic, explainable, and defensible?
        </div>
      </div>

      {/* ── HEXIQA Engine ── */}
      <div style={{ background: '#1e293b', borderRadius: 14, padding: '28px 24px', marginBottom: 16 }}>
        <SectionHeader label="Core Engine" title="Explainable Scene Fit Scoring" />
        <p style={{ color: '#64748b', fontSize: 12, fontWeight: 700, margin: '0 0 12px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Powered by the HEXIQA Emotional Quality Engine
        </p>
        <p style={{ color: '#94a3b8', fontSize: 14, margin: '0 0 20px', lineHeight: 1.7 }}>
          HEXIQA is a 6-dimensional emotional quality system — deterministic, invariant, MIR-standard,
          non-AI, and mathematically grounded. It generates a <strong style={{ color: '#f8fafc' }}>512-point
          emotional analysis timeline</strong> measuring:
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {['Pleasure', 'Arousal', 'Valence', 'Dominance', 'Energy', 'Tension', 'Timbre', 'Key', 'Tempo'].map((d) => (
            <span
              key={d}
              style={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 6,
                padding: '4px 10px',
                color: '#cbd5e1',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {d}
            </span>
          ))}
          <span
            style={{
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: 6,
              padding: '4px 10px',
              color: '#94a3b8',
              fontSize: 12,
            }}
          >
            + Non-invasive semantic lyric analysis
          </span>
        </div>
        <p style={{ color: '#475569', fontSize: 13, margin: 0, lineHeight: 1.5 }}>
          These measurements are mathematical extractions, not interpretations.
        </p>
      </div>

      {/* ── 360-Phrase + Architecture ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div style={{ background: '#1e293b', borderRadius: 14, padding: '24px 20px' }}>
          <SectionHeader label="Language Bridge" title="360-Phrase Normalization" />
          <p style={{ color: '#94a3b8', fontSize: 13, margin: '0 0 16px', lineHeight: 1.6 }}>
            The 512-point HEXIQA timeline is translated into 360 narrative phrasings — the emotional
            vocabulary supervisors, editors, and studios already use.
          </p>
          <BulletList items={['Deterministic', 'Rule-based', 'Drift-free', 'Explainable']} />
          <div style={{ marginTop: 16, background: '#0f172a', borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Pill label="10%" sub="Unique fingerprint" />
              <span style={{ color: '#475569', fontSize: 18 }}>+</span>
              <Pill label="90%" sub="Standardized narrative" />
            </div>
          </div>
        </div>

        <div style={{ background: '#1e293b', borderRadius: 14, padding: '24px 20px' }}>
          <SectionHeader label="Architecture" title="70/30 CQRS + CMAMs" />
          <p style={{ color: '#94a3b8', fontSize: 13, margin: '0 0 16px', lineHeight: 1.6 }}>
            Math first. Narrative second. A 30/70 system would become interpretive and drift-prone —
            the opposite of SyncVision's stance.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ background: '#0f172a', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ color: '#f8fafc', fontSize: 13, fontWeight: 700 }}>CQRS</span>
                <span style={{ color: '#2563eb', fontSize: 14, fontWeight: 800 }}>70%</span>
              </div>
              <div style={{ color: '#475569', fontSize: 11 }}>Raw HEXIQA math, MIR transforms, deterministic timeline</div>
            </div>
            <div style={{ background: '#0f172a', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ color: '#f8fafc', fontSize: 13, fontWeight: 700 }}>CMAMs</span>
                <span style={{ color: '#94a3b8', fontSize: 14, fontWeight: 800 }}>30%</span>
              </div>
              <div style={{ color: '#475569', fontSize: 11 }}>Narrative translation, context modulation, phrase mapping</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── The SyncVision Score ── */}
      <div style={{ background: '#1e293b', borderRadius: 14, padding: '28px 24px', marginBottom: 16 }}>
        <SectionHeader label="Output" title="The SyncVision Score" />
        <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 20px' }}>
          Scene Fit + Clearance Readiness + Confidence
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            {
              num: '1', title: 'Scene-Fit Score',
              items: ['HEXIQA 512-point timeline', '360-phrase normalization', '70/30 CQRS/CMAMs weighting', 'Deterministic audit hashing'],
            },
            {
              num: '2', title: 'Clearance Readiness',
              items: ['ISRC', 'PRO affiliation', 'Master ownership', 'Writer & publisher splits', 'Conflict detection', 'Missing metadata penalties'],
            },
            {
              num: '3', title: 'Confidence Score',
              items: ['Editorial review', 'Legal review', 'Agency / client presentations', 'Studio approvals'],
            },
          ].map(({ num, title, items }) => (
            <div key={num} style={{ background: '#0f172a', borderRadius: 10, padding: '16px 14px' }}>
              <div style={{ color: '#2563eb', fontSize: 22, fontWeight: 800, marginBottom: 4 }}>{num}</div>
              <div style={{ color: '#f8fafc', fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{title}</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {items.map((item) => (
                  <li key={item} style={{ color: '#64748b', fontSize: 11, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                    <span style={{ color: '#334155', marginTop: 2 }}>›</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {['SyncVision Score (0–100)', 'Confidence Score (%)', 'Rank ordering', 'Narrative explanation', 'Deterministic audit hash'].map((o) => (
            <span
              key={o}
              style={{
                background: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: 6,
                padding: '5px 12px',
                color: '#94a3b8',
                fontSize: 12,
              }}
            >
              {o}
            </span>
          ))}
        </div>
      </div>

      <Divider />

      {/* ── Free trial ── */}
      <FreeTrialSection onTrialStart={onBack} />

      <div style={{ marginTop: 16 }}>
        <PaygSection />
      </div>

      <Divider />

      {/* ── Subscription plans ── */}
      <h2 style={{ color: '#f8fafc', fontSize: 24, fontWeight: 700, margin: '0 0 6px' }}>Pricing</h2>
      <p style={{ color: '#64748b', fontSize: 14, margin: '0 0 36px' }}>
        Monthly subscription. Cancel any time. No setup fees.
      </p>

      {checkoutError && (
        <div style={{
          background: '#450a0a', border: '1px solid #7f1d1d', borderRadius: 8,
          padding: '12px 16px', marginBottom: 24, color: '#fca5a5', fontSize: 13,
        }}>
          <strong>Checkout error:</strong> {checkoutError}
        </div>
      )}

      {loading && (
        <div style={{ color: '#64748b', textAlign: 'center', padding: '60px 0' }}>Loading plans…</div>
      )}

      {error && (
        <div style={{
          background: '#450a0a', border: '1px solid #7f1d1d', borderRadius: 10,
          padding: 20, color: '#fca5a5',
        }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
        }}>
          {plans.map((plan) => {
            const highlighted = plan.id === HIGHLIGHT_ID
            const isLoading   = loadingPlan === plan.id
            return (
              <div
                key={plan.id}
                style={{
                  background:    highlighted ? '#1e3a5f' : '#1e293b',
                  border:        `1px solid ${highlighted ? '#2563eb' : '#1e293b'}`,
                  borderRadius:  12,
                  padding:       '24px 22px',
                  display:       'flex',
                  flexDirection: 'column',
                  position:      'relative',
                  outline:       highlighted ? '2px solid #2563eb' : 'none',
                }}
              >
                {highlighted && (
                  <div style={{
                    position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                    background: '#2563eb', color: '#fff', fontSize: 11, fontWeight: 700,
                    padding: '2px 12px', borderRadius: 20, letterSpacing: '0.06em',
                    textTransform: 'uppercase', whiteSpace: 'nowrap',
                  }}>
                    Most popular
                  </div>
                )}

                <div style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600, marginBottom: 8, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  {plan.name}
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, marginBottom: 4 }}>
                  <span style={{ color: '#f8fafc', fontSize: 34, fontWeight: 800, lineHeight: 1 }}>
                    {fmt$(plan.price_cents)}
                  </span>
                  <span style={{ color: '#64748b', fontSize: 13, paddingBottom: 4 }}>
                    /{plan.interval}
                  </span>
                </div>

                <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 20px', lineHeight: 1.5 }}>
                  {plan.description}
                </p>

                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {plan.features.map((f) => (
                    <li key={f} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: '#94a3b8' }}>
                      <span style={{ color: '#22c55e', marginTop: 1, flexShrink: 0 }}>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleCheckout(plan.id)}
                  disabled={!!loadingPlan}
                  style={{
                    marginTop:    'auto',
                    background:   highlighted ? '#2563eb' : '#0f172a',
                    color:        '#fff',
                    border:       highlighted ? 'none' : '1px solid #334155',
                    borderRadius: 8,
                    padding:      '11px 0',
                    fontWeight:   700,
                    fontSize:     14,
                    cursor:       loadingPlan ? 'not-allowed' : 'pointer',
                    opacity:      loadingPlan && !isLoading ? 0.5 : 1,
                    transition:   'opacity 0.15s',
                  }}
                >
                  {isLoading ? 'Redirecting…' : `Subscribe — ${fmt$(plan.price_cents)}/mo`}
                </button>
              </div>
            )
          })}
        </div>
      )}

      <p style={{ color: '#334155', fontSize: 12, marginTop: 28, textAlign: 'center' }}>
        Payments processed by Stripe. Your card details never touch our servers.
      </p>
    </div>
  )
}
