// Stripe Checkout — Pricing Page
//
// Fetches plan catalogue from GET /api/stripe/plans (static, no Stripe call).
// On "Subscribe" click → POST /api/stripe/checkout → redirect to Stripe-hosted page.
// Success/cancel query params (?checkout=success | ?checkout=cancelled) are read on mount.

import { useEffect, useState } from 'react'

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

const HIGHLIGHT_ID = 'pro' // visually accented plan

export function PricingPage({ onBack }: PricingPageProps) {
  const [plans, setPlans]           = useState<Plan[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [checkoutStatus, setCheckoutStatus] = useState<'success' | 'cancelled' | null>(null)
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  // Read success/cancel redirect from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const status = params.get('checkout')
    if (status === 'success') setCheckoutStatus('success')
    if (status === 'cancelled') setCheckoutStatus('cancelled')
    // Clean the query string without a full reload
    if (status) {
      const clean = window.location.pathname
      window.history.replaceState({}, '', clean)
    }
  }, [])

  // Load plans
  useEffect(() => {
    fetch('/api/stripe/plans')
      .then((r) => r.json())
      .then((data: { plans: Plan[] }) => {
        setPlans(data.plans)
        setLoading(false)
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load plans')
        setLoading(false)
      })
  }, [])

  async function handleCheckout(planId: string) {
    setLoadingPlan(planId)
    setCheckoutError(null)
    try {
      const res = await fetch('/api/stripe/checkout', {
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
      // Redirect to Stripe-hosted checkout
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
            background: 'transparent',
            border: 'none',
            color: '#2563eb',
            fontSize: 14,
            cursor: 'pointer',
            padding: 0,
            textDecoration: 'underline',
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
            <strong>Payment successful.</strong> Your subscription is now active.
            Check your email for confirmation.
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

      <h2 style={{ color: '#f8fafc', fontSize: 24, fontWeight: 700, margin: '0 0 6px' }}>
        Pricing
      </h2>
      <p style={{ color: '#64748b', fontSize: 14, margin: '0 0 36px' }}>
        Monthly subscription. Cancel any time. No setup fees.
      </p>

      {/* Checkout error */}
      {checkoutError && (
        <div style={{
          background: '#450a0a', border: '1px solid #7f1d1d', borderRadius: 8,
          padding: '12px 16px', marginBottom: 24, color: '#fca5a5', fontSize: 13,
        }}>
          <strong>Checkout error:</strong> {checkoutError}
        </div>
      )}

      {loading && (
        <div style={{ color: '#64748b', textAlign: 'center', padding: '60px 0' }}>
          Loading plans…
        </div>
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
                  background:   highlighted ? '#1e3a5f' : '#1e293b',
                  border:       `1px solid ${highlighted ? '#2563eb' : '#1e293b'}`,
                  borderRadius: 12,
                  padding:      '24px 22px',
                  display:      'flex',
                  flexDirection:'column',
                  position:     'relative',
                  outline:      highlighted ? '2px solid #2563eb' : 'none',
                }}
              >
                {highlighted && (
                  <div style={{
                    position:     'absolute',
                    top:          -12,
                    left:         '50%',
                    transform:    'translateX(-50%)',
                    background:   '#2563eb',
                    color:        '#fff',
                    fontSize:     11,
                    fontWeight:   700,
                    padding:      '2px 12px',
                    borderRadius: 20,
                    letterSpacing:'0.06em',
                    textTransform:'uppercase',
                    whiteSpace:   'nowrap',
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
