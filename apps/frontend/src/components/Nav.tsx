type NavProps = {
  creditBalance: number;
  loading?: boolean;
  onHome?: () => void;
};

export function Nav({ creditBalance, loading, onHome }: NavProps) {
  return (
    <nav className="topbar no-print">
      <div className="topbar-inner">
        <button onClick={onHome} className="brand" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }} aria-label="SyncVision home">
          <span className="pulse" />
          <img className="logo" src="/logo.png" alt="SyncVision" style={{ height: 28, width: 'auto', mixBlendMode: 'screen' }} />
        </button>
        <div className="flex items-center gap-3">
          <span className="uppercase-label text-xs">Credits</span>
          <span className="text-silver font-bold text-base tabular-nums">
            {loading ? '…' : creditBalance}
          </span>
        </div>
      </div>
    </nav>
  );
}
