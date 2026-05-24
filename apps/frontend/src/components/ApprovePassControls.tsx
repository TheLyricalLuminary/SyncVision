// apps/frontend/src/components/ApprovePassControls.tsx
import { useState } from 'react';

interface ApprovePassControlsProps {
  onApprove: (comment?: string) => void;
  onPass: (comment?: string) => void;
  trackTitle: string;
  initialComment?: string;
  className?: string;
}

export function ApprovePassControls({
  onApprove,
  onPass,
  trackTitle,
  initialComment = '',
  className = '',
}: ApprovePassControlsProps) {
  const [comment, setComment] = useState(initialComment);
  const [showCommentField, setShowCommentField] = useState(false);
  const [selectedAction, setSelectedAction] = useState<'approve' | 'pass' | null>(null);

  const handleAction = (action: 'approve' | 'pass') => {
    setSelectedAction(action);
    if (comment.trim() || !showCommentField) {
      if (action === 'approve') onApprove(comment.trim() || undefined);
      else onPass(comment.trim() || undefined);
      setTimeout(() => {
        setComment('');
        setSelectedAction(null);
        setShowCommentField(false);
      }, 800);
    } else {
      setShowCommentField(true);
    }
  };

  return (
    <div className={`bg-[#170B33] border border-[#A78BFA]/20 rounded-3xl p-6 ${className}`}>
      <div className="text-sm text-[#A78BFA]/70 mb-4">Your Decision — {trackTitle}</div>

      {/* Collapsible comment field */}
      {(showCommentField || comment) && (
        <div className="mb-6">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[#A78BFA]/70 mb-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            NOTE FOR DIRECTOR
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add context or feedback for the director..."
            className="w-full h-24 bg-black/40 border border-[#A78BFA]/20 rounded-2xl p-4 text-sm text-white/90 placeholder:text-white/40 focus:border-[#DB2777] resize-none"
          />
        </div>
      )}

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => handleAction('pass')}
          className={[
            'h-16 rounded-2xl border font-semibold text-lg flex items-center justify-center gap-3 transition-all',
            selectedAction === 'pass'
              ? 'bg-red-500/10 border-red-500 text-red-400'
              : 'border-[#A78BFA]/30 hover:bg-white/5 hover:border-white/30 text-white/80',
          ].join(' ')}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
          PASS
        </button>

        <button
          onClick={() => handleAction('approve')}
          className={[
            'h-16 rounded-2xl font-semibold text-lg flex items-center justify-center gap-3 transition-all active:scale-[0.985]',
            selectedAction === 'approve' ? 'scale-105' : 'hover:brightness-110',
          ].join(' ')}
          style={{ background: 'linear-gradient(90deg, #7C3AED, #DB2777)', boxShadow: '0 8px 24px rgba(124,58,237,0.4)' }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          APPROVE
        </button>
      </div>

      {!showCommentField && (
        <button
          onClick={() => setShowCommentField(true)}
          className="w-full mt-4 text-xs text-[#A78BFA]/70 hover:text-white flex items-center justify-center gap-2 py-2 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          ADD COMMENT
        </button>
      )}
    </div>
  );
}
