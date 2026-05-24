// apps/frontend/src/components/AIReasoningCard.tsx
interface AIReasoningCardProps {
  reason: string;
  keyStrengths?: string[];
  fitScore: number;
}

export function AIReasoningCard({ reason, keyStrengths = [], fitScore }: AIReasoningCardProps) {
  return (
    <div
      className="relative rounded-3xl p-6 overflow-hidden border border-[#A78BFA]/30"
      style={{ background: 'linear-gradient(135deg, #170B33, #0F0823)' }}
    >
      {/* Decorative sparkle */}
      <div className="absolute top-5 right-5 text-[#DB2777]/30" aria-hidden>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2l1.8 5.4L19 9l-5.4 1.8L12 16l-1.8-5.4L5 9l5.4-1.8L12 2z"/>
          <path d="M19 14l.9 2.7L22 18l-2.7.9L19 22l-.9-2.7L16 18l2.7-.9L19 14z" opacity=".6"/>
          <path d="M5 14l.9 2.7L8 18l-2.7.9L5 22l-.9-2.7L2 18l2.7-.9L5 14z" opacity=".4"/>
        </svg>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <span
          className="px-3 py-1 text-xs font-semibold tracking-widest rounded-full border border-[#7C3AED]/30 text-[#A78BFA]"
          style={{ background: 'rgba(124,58,237,0.10)' }}
        >
          AI MATCH ANALYSIS
        </span>
        <span className="text-xs text-white/50">Why this track fits</span>
      </div>

      <blockquote className="font-serif italic text-lg leading-snug text-white/90 border-l-2 border-[#DB2777] pl-5">
        "{reason}"
      </blockquote>

      {keyStrengths.length > 0 && (
        <div className="mt-6">
          <div className="text-xs uppercase tracking-widest text-[#A78BFA]/70 mb-3">Key Strengths</div>
          <div className="flex flex-wrap gap-2">
            {keyStrengths.map((strength, i) => (
              <span
                key={i}
                className="text-sm px-4 py-2 rounded-2xl text-white/80 border border-white/10"
                style={{ background: 'rgba(255,255,255,0.05)' }}
              >
                {strength}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 pt-5 border-t border-white/10 flex justify-end">
        <div className="text-right">
          <div className="text-xs text-white/50 mb-1">OVERALL FIT</div>
          <div className="text-4xl font-light font-mono text-[#34D399]">{fitScore}</div>
        </div>
      </div>
    </div>
  );
}
