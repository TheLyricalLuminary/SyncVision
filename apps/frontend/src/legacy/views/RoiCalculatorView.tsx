import React, { useState } from 'react'
import type { CSSProperties } from 'react'

type PlacementType = 'tv' | 'film' | 'ads' | 'social'

interface RoiInputs {
  licensingFee: string
  placementType: PlacementType
  expectedReach: string
  territory: string
  durationSeconds: string
}

interface RoiBreakdown {
  roiScore: number
  licensingEfficiency: number
  reachAmplification: number
  rightsConfidenceContribution: number
  confidenceScore: number
}

const PLACEMENT_MULTIPLIERS: Record<PlacementType, number> = {
  tv: 1.4,
  film: 1.6,
  ads: 1.8,
  social: 1.2,
}

const PLACEMENT_LABELS: Record<PlacementType, string> = {
  tv: 'Television',
  film: 'Film',
  ads: 'Advertising',
  social: 'Social Media',
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function computeRoi(
  licensingFee: number,
  placementType: PlacementType,
  expectedReach: number,
  confidenceScore: number,
): RoiBreakdown {
  const multiplier = PLACEMENT_MULTIPLIERS[placementType]
  const raw = (expectedReach * multiplier * confidenceScore) / licensingFee
  const roiScore = clamp(Math.round(raw), 0, 100)

  const licensingEfficiency = clamp(Math.round((confidenceScore / licensingFee) * 1000), 0, 100)
  const reachAmplification = clamp(Math.round((expectedReach * multiplier) / 10000), 0, 100)
  const rightsConfidenceContribution = clamp(Math.round(confidenceScore * multiplier), 0, 100)

  return {
    roiScore,
    licensingEfficiency,
    reachAmplification,
    rightsConfidenceContribution,
    confidenceScore,
  }
}

function ScoreGauge({ score, label }: { score: number; label: string }) {
  const color = score >= 70 ? '#16a34a' : score >= 40 ? '#ca8a04' : '#dc2626'
  return (
    <div style={{ textAlign: 'center' }}>
      <div
        style={{
          width: 120,
          height: 120,
          borderRadius: '50%',
          background: `conic-gradient(${color} ${score * 3.6}deg, #1e293b ${score * 3.6}deg)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 12px',
          position: 'relative',
        }}
      >
        <div
          style={{
            width: 92,
            height: 92,
            borderRadius: '50%',
            background: '#0f172a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
          }}
        >
          <span style={{ fontSize: 28, fontWeight: 900, color: '#f8fafc', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {score}
          </span>
          <span style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>/ 100</span>
        </div>
      </div>
      <div style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>{label}</div>
    </div>
  )
}

function BreakdownBar({ label, value, sublabel }: { label: string; value: number; sublabel?: string }) {
  const color = value >= 70 ? '#16a34a' : value >= 40 ? '#ca8a04' : '#dc2626'
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <div>
          <span style={{ color: '#cbd5e1', fontSize: 13 }}>{label}</span>
          {sublabel && <span style={{ color: '#475569', fontSize: 11, marginLeft: 8 }}>{sublabel}</span>}
        </div>
        <span style={{ color: '#f8fafc', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      </div>
      <div style={{ background: '#0f172a', borderRadius: 4, height: 8, overflow: 'hidden' }}>
        <div style={{ background: color, width: `${value}%`, height: '100%', borderRadius: 4, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  )
}

const inputStyle: CSSProperties = {
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: 6,
  padding: '9px 12px',
  color: '#f8fafc',
  fontSize: 14,
  width: '100%',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}

const labelStyle: CSSProperties = {
  color: '#94a3b8',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  display: 'block',
  marginBottom: 6,
}

const card: CSSProperties = {
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 12,
  padding: 24,
  marginBottom: 20,
}

export default function RoiCalculatorView({ onBack }: { onBack: () => void }) {
  const [inputs, setInputs] = useState<RoiInputs>({
    licensingFee: '',
    placementType: 'tv',
    expectedReach: '',
    territory: '',
    durationSeconds: '',
  })
  const [breakdown, setBreakdown] = useState<RoiBreakdown | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function patch(field: keyof RoiInputs, value: string) {
    setInputs((prev) => ({ ...prev, [field]: value }))
  }

  function validate(): string | null {
    const fee = parseFloat(inputs.licensingFee)
    const reach = parseFloat(inputs.expectedReach)
    if (!inputs.licensingFee || isNaN(fee) || fee <= 0) return 'Licensing fee must be a positive number.'
    if (!inputs.expectedReach || isNaN(reach) || reach <= 0) return 'Expected reach must be a positive number.'
    return null
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const validationError = validate()
    if (validationError) { setError(validationError); return }

    const fee = parseFloat(inputs.licensingFee)
    const reach = parseFloat(inputs.expectedReach)

    setError(null)
    setLoading(true)

    fetch('/api/scores')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<{ rankedTracks: Array<{ score: number }> }>
      })
      .then((data) => {
        const tracks = data.rankedTracks
        const avgConfidence = tracks.length > 0
          ? Math.round(tracks.reduce((sum, t) => sum + t.score, 0) / tracks.length)
          : 50
        setBreakdown(computeRoi(fee, inputs.placementType, reach, avgConfidence))
      })
      .catch((err: Error) => {
        // Backend unavailable — compute with neutral confidence
        setBreakdown(computeRoi(fee, inputs.placementType, reach, 50))
        setError(`Backend offline — used neutral confidence (50). Error: ${err.message}`)
      })
      .finally(() => setLoading(false))
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <button
          onClick={onBack}
          style={{ background: 'transparent', border: 'none', color: '#2563eb', fontSize: 20, cursor: 'pointer', padding: 0 }}
          aria-label="Back"
        >
          ←
        </button>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#f8fafc' }}>ROI Calculator</h2>
      </div>

      <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 28, marginTop: 0 }}>
        Estimate licensing ROI using placement type, reach, and catalog rights confidence.
      </p>

      <form onSubmit={handleSubmit}>
        <div style={card}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Licensing Fee ($) *</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="e.g. 5000"
                value={inputs.licensingFee}
                onChange={(e) => patch('licensingFee', e.target.value)}
                style={inputStyle}
                required
              />
            </div>

            <div>
              <label style={labelStyle}>Placement Type *</label>
              <select
                value={inputs.placementType}
                onChange={(e) => patch('placementType', e.target.value as PlacementType)}
                style={{ ...inputStyle, appearance: 'none' }}
              >
                {(Object.keys(PLACEMENT_MULTIPLIERS) as PlacementType[]).map((p) => (
                  <option key={p} value={p}>{PLACEMENT_LABELS[p]} (×{PLACEMENT_MULTIPLIERS[p]})</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Expected Reach *</label>
              <input
                type="number"
                min="1"
                step="1"
                placeholder="e.g. 1000000"
                value={inputs.expectedReach}
                onChange={(e) => patch('expectedReach', e.target.value)}
                style={inputStyle}
                required
              />
            </div>

            <div>
              <label style={labelStyle}>Territory</label>
              <input
                type="text"
                placeholder="e.g. US, EU, Worldwide"
                value={inputs.territory}
                onChange={(e) => patch('territory', e.target.value)}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Duration (seconds)</label>
              <input
                type="number"
                min="1"
                step="1"
                placeholder="e.g. 30"
                value={inputs.durationSeconds}
                onChange={(e) => patch('durationSeconds', e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          {error && (
            <div style={{ marginTop: 16, background: '#450a0a', border: '1px solid #7f1d1d', borderRadius: 8, padding: '10px 14px', color: '#fca5a5', fontSize: 13 }}>
              {error}
            </div>
          )}

          <div style={{ marginTop: 20 }}>
            <button
              type="submit"
              disabled={loading}
              style={{
                background: loading ? '#1e3a8a' : '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '10px 24px',
                fontWeight: 600,
                fontSize: 14,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? 'Calculating…' : 'Calculate ROI'}
            </button>
          </div>
        </div>
      </form>

      {breakdown && (
        <>
          <div style={{ ...card, textAlign: 'center' }}>
            <ScoreGauge score={breakdown.roiScore} label="ROI Score" />
            <p style={{ color: '#64748b', fontSize: 12, margin: '16px 0 0' }}>
              Composite of reach amplification, placement multiplier (×{PLACEMENT_MULTIPLIERS[inputs.placementType as PlacementType]}), and catalog rights confidence
            </p>
          </div>

          <div style={card}>
            <h3 style={{ margin: '0 0 20px', fontSize: 15, fontWeight: 700, color: '#f8fafc' }}>Breakdown</h3>
            <BreakdownBar
              label="Licensing Efficiency"
              value={breakdown.licensingEfficiency}
              sublabel="confidence relative to fee"
            />
            <BreakdownBar
              label="Reach Amplification"
              value={breakdown.reachAmplification}
              sublabel={`reach × ${PLACEMENT_MULTIPLIERS[inputs.placementType as PlacementType]} multiplier`}
            />
            <BreakdownBar
              label="Rights Confidence Contribution"
              value={breakdown.rightsConfidenceContribution}
              sublabel="clearance confidence × placement multiplier"
            />

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #334155' }}>
              <div style={{ color: '#64748b', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
                Raw Backend Signal
              </div>
              <div style={{ display: 'flex', gap: 24 }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#f8fafc', fontVariantNumeric: 'tabular-nums' }}>
                    {breakdown.confidenceScore}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Catalog confidence avg</div>
                </div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#f8fafc', fontVariantNumeric: 'tabular-nums' }}>
                    ×{PLACEMENT_MULTIPLIERS[inputs.placementType as PlacementType]}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Placement multiplier</div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
