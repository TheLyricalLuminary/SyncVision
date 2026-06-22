export type MobileTab = 'match' | 'stack' | 'short';

type Props = {
  active: MobileTab;
  onTab: (t: MobileTab) => void;
  hasResults?: boolean;
};

export function MobileTabBar({ active, onTab, hasResults }: Props) {
  return (
    <nav className="m-nav no-print">
      <button
        className={`m-tab${active === 'match' ? ' on' : ''}`}
        onClick={() => onTab('match')}
      >
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M3 13h3l2-7 4 14 2-7h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Match
      </button>

      <button
        className={`m-tab${active === 'stack' ? ' on' : ''}${!hasResults ? ' dim' : ''}`}
        onClick={() => onTab('stack')}
      >
        <svg viewBox="0 0 24 24" fill="none">
          <rect x="4" y="5" width="16" height="4" rx="1.4" stroke="currentColor" strokeWidth="1.7" />
          <rect x="4" y="14" width="16" height="4" rx="1.4" stroke="currentColor" strokeWidth="1.7" />
        </svg>
        Stack
      </button>

      <button
        className={`m-tab${active === 'short' ? ' on' : ''}`}
        onClick={() => onTab('short')}
      >
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M12 4l2.5 5.5L20 10l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
        Shortlist
      </button>
    </nav>
  );
}
