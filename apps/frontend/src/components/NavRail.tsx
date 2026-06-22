type NavView = 'workspace' | 'brief' | 'shortlists' | 'rights' | 'library' | 'director';

type NavRailProps = {
  active: NavView;
  onNav: (v: NavView) => void;
};

const ITEMS: { id: NavView; label: string; icon: React.ReactNode; bottom?: boolean }[] = [
  {
    id: 'workspace',
    label: 'Workspace',
    icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
        <path d="M4 14h6M4 14v6M4 14V4h16v16H4m6 0h10V10h-6m0 0V4m0 6h6" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: 'brief',
    label: 'New Brief',
    icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
        <path d="M4 5h16M4 10h16M4 15h10M4 20h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: 'shortlists',
    label: 'Shortlists',
    icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
        <path d="M12 4l2.2 4.8L19 9.3l-3.5 3.4.9 5L12 15.6 7.6 17.7l.9-5L5 9.3l4.8-.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: 'rights',
    label: 'Rights',
    icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
        <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: 'library',
    label: 'Library',
    icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
        <path d="M5 4v16M9 4v16M13 5l5 15M19 19l-5-15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: 'director',
    label: 'Director Review',
    bottom: true,
    icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
        <path d="M3 7l4-3 5 3 5-3 4 3v10l-4 3-5-3-5 3-4-3V7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

export function NavRail({ active, onNav }: NavRailProps) {
  const top = ITEMS.filter(i => !i.bottom);
  const bottom = ITEMS.filter(i => i.bottom);

  return (
    <aside className="sv-rail no-print">
      <div className="sv-rail-logo" title="SyncVision">
        <span className="mark" />
      </div>

      {top.map(item => (
        <button
          key={item.id}
          className={`sv-nav-item${active === item.id ? ' active' : ''}`}
          onClick={() => onNav(item.id)}
          title={item.label}
          aria-label={item.label}
        >
          {item.icon}
          <span className="sv-nav-tip">{item.label}</span>
        </button>
      ))}

      <span className="sv-rail-spacer" />

      {bottom.map(item => (
        <button
          key={item.id}
          className={`sv-nav-item${active === item.id ? ' active' : ''}`}
          onClick={() => onNav(item.id)}
          title={item.label}
          aria-label={item.label}
        >
          {item.icon}
          <span className="sv-nav-tip">{item.label}</span>
        </button>
      ))}
    </aside>
  );
}
