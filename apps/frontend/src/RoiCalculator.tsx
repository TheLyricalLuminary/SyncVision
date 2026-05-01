// ROI Calculator — SyncVision
//
// All calculations are pure functions with no side effects.
// Only hard-coded constant: WEEKS_PER_MONTH = 4.33
//
// Formulas:
//   monthly_hours_saved = searches_per_week * WEEKS_PER_MONTH * avg_hours_saved_per_search
//   monthly_value       = monthly_hours_saved * hourly_rate
//   annual_value        = monthly_value * 12
//   roi_multiple        = monthly_value / plan_price
//   break_even_hours    = plan_price / hourly_rate          (hours/month to justify plan)
//   value_gap           = monthly_value - plan_price

import { useState } from 'react'

// ─── Constants ────────────────────────────────────────────────────────────────

const WEEKS_PER_MONTH = 4.33 // only hidden constant — ISO calendar average

const PLANS = [
  { id: 'solo',   label: 'Solo',   price: 199  },
  { id: 'pro',    label: 'Pro',    price: 499  },
  { id: 'agency', label: 'Agency', price: 1200 },
] as const

// ─── Pure calculation functions ───────────────────────────────────────────────

function calcMonthlyhoursSaved(
  searchesPerWeek: number,
  avgHoursSavedPerSearch: number,
): number {
  return searchesPerWeek * WEEKS_PER_MONTH * avgHoursSavedPerSearch
}

function calcMonthlyValue(monthlyHoursSaved: number, hourlyRate: number): number {
  return monthlyHoursSaved * hourlyRate
}

function calcAnnualValue(monthlyValue: number): number {
  return monthlyValue * 12
}

function calcRoiMultiple(monthlyValue: number, planPrice: number): number {
  if (planPrice === 0) return 0
  return monthlyValue / planPrice
}

function calcBreakEvenHours(planPrice: number, hourlyRate: number): number {
  if (hourlyRate === 0) return 0
  return planPrice / hourlyRate
}

function calcValueGap(monthlyValue: number, planPrice: number): number {
  return monthlyValue - planPrice
}

// ─── Derived outputs (assembled from pure fns) ────────────────────────────────

interface Inputs {
  hourlyRate: number
  searchesPerWeek: number
  avgHoursSavedPerSearch: number
  projectsPerMonth: number
}

interface Intermediates {
  monthlyHoursSaved: number
  monthlyValue: number
  annualValue: number
}

interface PlanResult {
  id: string
  label: string
  price: number
  roiMultiple: number
  breakEvenHours: number
  valueGap: number
}

interface Outputs {
  intermediates: Intermediates
  plans: PlanResult[]
}

function compute(inputs: Inputs): Outputs {
  const monthlyHoursSaved = calcMonthlyhoursSaved(
    inputs.searchesPerWeek,
    inputs.avgHoursSavedPerSearch,
  )
  const monthlyValue = calcMonthlyValue(monthlyHoursSaved, inputs.hourlyRate)
  const annualValue  = calcAnnualValue(monthlyValue)

  const plans: PlanResult[] = PLANS.map((plan) => ({
    id:             plan.id,
    label:          plan.label,
    price:          plan.price,
    roiMultiple:    calcRoiMultiple(monthlyValue, plan.price),
    breakEvenHours: calcBreakEvenHours(plan.price, inputs.hourlyRate),
    valueGap:       calcValueGap(monthlyValue, plan.price),
  }))

  return {
    intermediates: { monthlyHoursSaved, monthlyValue, annualValue },
    plans,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt$$(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style:    'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)
}

function fmtHrs(n: number): string {
  return `${n.toFixed(1)} hrs`
}

function fmtMult(n: number): string {
  return `${n.toFixed(2)}×`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface SliderRowProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  onChange: (v: number) => void
}

function SliderRow({ label, value, min, max, step, unit, onChange }: SliderRowProps) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <label style={{ color: '#94a3b8', fontSize: 13, fontWeight: 500 }}>{label}</label>
        <span style={{ color: '#f8fafc', fontSize: 13, fontWeight: 700 }}>
          {unit === '$' ? `$${value}` : `${value}${unit}`}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#2563eb' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
        <span style={{ color: '#475569', fontSize: 11 }}>
          {unit === '$' ? `$${min}` : `${min}${unit}`}
        </span>
        <span style={{ color: '#475569', fontSize: 11 }}>
          {unit === '$' ? `$${max}` : `${max}${unit}`}
        </span>
      </div>
    </div>
  )
}

interface PlanCardProps {
  plan: PlanResult
  monthlyValue: number
}

function PlanCard({ plan, monthlyValue }: PlanCardProps) {
  const positive = plan.valueGap >= 0
  const roiColor =
    plan.roiMultiple >= 5 ? '#22c55e'
    : plan.roiMultiple >= 2 ? '#facc15'
    : '#f87171'

  return (
    <div
      style={{
        background:   '#1e293b',
        border:       `1px solid ${positive ? '#1e3a5f' : '#450a0a'}`,
        borderRadius: 10,
        padding:      '18px 20px',
        flex:         '1 1 0',
        minWidth:     180,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ color: '#f8fafc', fontWeight: 700, fontSize: 15 }}>{plan.label}</div>
          <div style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>{fmt$$(plan.price)}/mo</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: roiColor, fontSize: 22, fontWeight: 800, lineHeight: 1 }}>
            {fmtMult(plan.roiMultiple)}
          </div>
          <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>ROI</div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid #0f172a', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Row label="Value gap"      value={fmt$$(plan.valueGap)}          color={positive ? '#22c55e' : '#f87171'} />
        <Row label="Break-even"     value={fmtHrs(plan.breakEvenHours)}   color="#94a3b8" />
        <Row label="Your value"     value={fmt$$(monthlyValue)}            color="#f8fafc" />
      </div>
    </div>
  )
}

function Row({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
      <span style={{ color: '#64748b' }}>{label}</span>
      <span style={{ color, fontWeight: 600 }}>{value}</span>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface RoiCalculatorProps {
  onBack: () => void
}

export function RoiCalculator({ onBack }: RoiCalculatorProps) {
  const [inputs, setInputs] = useState<Inputs>({
    hourlyRate:             150,
    searchesPerWeek:        10,
    avgHoursSavedPerSearch: 1.5,
    projectsPerMonth:       4,
  })

  const [debugOpen, setDebugOpen] = useState(false)

  const set = (key: keyof Inputs) => (v: number) =>
    setInputs((prev) => ({ ...prev, [key]: v }))

  const outputs = compute(inputs)
  const { intermediates, plans } = outputs

  return (
    <div>
      {/* Back nav */}
      <div style={{ marginBottom: 28 }}>
        <button
          onClick={onBack}
          style={{
            background:    'transparent',
            border:        'none',
            color:         '#2563eb',
            fontSize:      14,
            cursor:        'pointer',
            padding:       0,
            textDecoration:'underline',
          }}
        >
          ← Scene Selection
        </button>
      </div>

      <h2 style={{ color: '#f8fafc', fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>
        ROI Calculator
      </h2>
      <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 28px' }}>
        Adjust your usage to see exact dollar value vs SyncVision plan pricing.
        All outputs are derived from the four inputs below — no hidden logic.
      </p>

      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-start' }}>

        {/* ── Inputs panel ── */}
        <div
          style={{
            background:   '#1e293b',
            border:       '1px solid #1e3a5f',
            borderRadius: 12,
            padding:      '22px 24px',
            flex:         '0 0 320px',
          }}
        >
          <div style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', marginBottom: 20, textTransform: 'uppercase' }}>
            Inputs
          </div>

          <SliderRow
            label="Hourly rate (USD)"
            value={inputs.hourlyRate}
            min={50} max={500} step={10}
            unit="$"
            onChange={set('hourlyRate')}
          />
          <SliderRow
            label="Searches per week"
            value={inputs.searchesPerWeek}
            min={1} max={100} step={1}
            unit=""
            onChange={set('searchesPerWeek')}
          />
          <SliderRow
            label="Avg hours saved per search"
            value={inputs.avgHoursSavedPerSearch}
            min={0.25} max={8} step={0.25}
            unit=" hrs"
            onChange={set('avgHoursSavedPerSearch')}
          />
          <SliderRow
            label="Projects per month"
            value={inputs.projectsPerMonth}
            min={1} max={30} step={1}
            unit=""
            onChange={set('projectsPerMonth')}
          />

          {/* Formula box */}
          <div
            style={{
              background:   '#0f172a',
              border:       '1px solid #1e293b',
              borderRadius: 8,
              padding:      '12px 14px',
              marginTop:    8,
              fontFamily:   'monospace',
              fontSize:     11,
              color:        '#475569',
              lineHeight:   1.7,
            }}
          >
            <div style={{ color: '#64748b', marginBottom: 4, fontWeight: 600 }}>FORMULA</div>
            <div>monthly_hours = searches/wk × 4.33 × hrs/search</div>
            <div>monthly_value = monthly_hours × hourly_rate</div>
            <div>annual_value  = monthly_value × 12</div>
            <div>roi_multiple  = monthly_value ÷ plan_price</div>
            <div>break_even    = plan_price ÷ hourly_rate</div>
            <div>value_gap     = monthly_value − plan_price</div>
          </div>
        </div>

        {/* ── Outputs panel ── */}
        <div style={{ flex: '1 1 400px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Key metrics */}
          <div
            style={{
              background:   '#1e293b',
              border:       '1px solid #1e3a5f',
              borderRadius: 12,
              padding:      '22px 24px',
            }}
          >
            <div style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', marginBottom: 16, textTransform: 'uppercase' }}>
              Output Metrics
            </div>
            <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap' }}>
              <Metric label="Monthly hours saved" value={fmtHrs(intermediates.monthlyHoursSaved)} />
              <Metric label="Monthly value"        value={fmt$$(intermediates.monthlyValue)} highlight />
              <Metric label="Annual value"         value={fmt$$(intermediates.annualValue)} />
            </div>
          </div>

          {/* Plan comparison */}
          <div
            style={{
              background:   '#1e293b',
              border:       '1px solid #1e3a5f',
              borderRadius: 12,
              padding:      '22px 24px',
            }}
          >
            <div style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', marginBottom: 16, textTransform: 'uppercase' }}>
              Plan Comparison
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {plans.map((plan) => (
                <PlanCard key={plan.id} plan={plan} monthlyValue={intermediates.monthlyValue} />
              ))}
            </div>
          </div>

          {/* Debug panel */}
          <div
            style={{
              background:   '#0f172a',
              border:       '1px solid #1e293b',
              borderRadius: 10,
              overflow:     'hidden',
            }}
          >
            <button
              onClick={() => setDebugOpen((o) => !o)}
              style={{
                width:      '100%',
                background: 'transparent',
                border:     'none',
                padding:    '10px 16px',
                textAlign:  'left',
                color:      '#475569',
                fontSize:   12,
                fontFamily: 'monospace',
                cursor:     'pointer',
                display:    'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>DEBUG PANEL</span>
              <span>{debugOpen ? '▲ collapse' : '▼ expand'}</span>
            </button>

            {debugOpen && (
              <pre
                style={{
                  margin:     0,
                  padding:    '0 16px 14px',
                  color:      '#22d3ee',
                  fontSize:   11,
                  fontFamily: 'monospace',
                  lineHeight: 1.6,
                  overflowX:  'auto',
                }}
              >
                {JSON.stringify(
                  {
                    inputs,
                    WEEKS_PER_MONTH,
                    intermediates: {
                      monthlyHoursSaved: intermediates.monthlyHoursSaved,
                      monthlyValue:      intermediates.monthlyValue,
                      annualValue:       intermediates.annualValue,
                    },
                    plans: plans.map((p) => ({
                      id:             p.id,
                      price:          p.price,
                      roiMultiple:    p.roiMultiple,
                      breakEvenHours: p.breakEvenHours,
                      valueGap:       p.valueGap,
                    })),
                  },
                  null,
                  2,
                )}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Metric tile ─────────────────────────────────────────────────────────────

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ flex: '1 1 120px', padding: '0 16px 0 0', minWidth: 120, marginBottom: 8 }}>
      <div style={{ color: '#64748b', fontSize: 11, marginBottom: 2 }}>{label}</div>
      <div
        style={{
          color:      highlight ? '#2563eb' : '#f8fafc',
          fontSize:   highlight ? 26 : 20,
          fontWeight: 800,
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
    </div>
  )
}
