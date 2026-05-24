// apps/frontend/src/components/TabNavigation.tsx
interface Tab {
  id: string;
  label: string;
  count?: number;
}

interface TabNavigationProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  className?: string;
}

export function TabNavigation({ tabs, activeTab, onTabChange, className = '' }: TabNavigationProps) {
  return (
    <div className={`inline-flex bg-[#170B33] border border-[#A78BFA]/10 rounded-2xl p-1.5 ${className}`}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={[
            'px-8 py-3 rounded-xl text-sm font-semibold transition-all',
            activeTab === tab.id
              ? 'bg-[#7C3AED] text-white shadow-lg shadow-[#7C3AED]/30'
              : 'text-[#A78BFA] hover:text-white hover:bg-white/5',
          ].join(' ')}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${activeTab === tab.id ? 'bg-white/20' : 'bg-white/10'}`}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
