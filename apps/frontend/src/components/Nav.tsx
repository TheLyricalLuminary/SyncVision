type NavProps = {
  creditBalance: number;
  loading?: boolean;
  onHome?: () => void;
};

export function Nav({ creditBalance, loading, onHome }: NavProps) {
  return (
    <nav className="flex items-center justify-between px-8 py-4 border-b border-mg-border no-print">
      <button onClick={onHome} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
        <img src="/logo.png" alt="SyncVision" style={{ height: '40px', width: 'auto' }} />
      </button>
      <div className="flex items-center gap-3">
        <span className="uppercase-label text-xs">Credits</span>
        <span className="text-mg-silver font-bold text-base tabular-nums">
          {loading ? '…' : creditBalance}
        </span>
      </div>
    </nav>
  );
}
