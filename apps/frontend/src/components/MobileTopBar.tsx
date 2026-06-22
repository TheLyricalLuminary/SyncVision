type Props = {
  briefText?: string;
  isActive?: boolean;
};

export function MobileTopBar({ briefText, isActive }: Props) {
  return (
    <header className="m-top no-print">
      <div className="m-scene-btn">
        <span className={`m-pulse${isActive ? ' live' : ''}`} />
        <span className="m-scene-info">
          <span className="m-scene-k">
            {isActive ? 'Story Match · Active' : 'SyncVision'}
          </span>
          {briefText && (
            <span className="m-scene-t">
              {briefText.length > 36 ? briefText.slice(0, 36) + '…' : briefText}
            </span>
          )}
        </span>
      </div>
      <button className="m-menu-btn" aria-label="Menu">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="5" r="1.6" fill="currentColor" />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" />
          <circle cx="12" cy="19" r="1.6" fill="currentColor" />
        </svg>
      </button>
    </header>
  );
}
