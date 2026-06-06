export type Tab = 'apply' | 'explore' | 'sync'

const TABS: { id: Tab; label: string }[] = [
  { id: 'apply', label: 'Apply' },
  { id: 'explore', label: 'Explore' },
  { id: 'sync', label: 'Sync' },
]

interface Props {
  activeTab: Tab
  onChange: (tab: Tab) => void
}

export default function TabBar({ activeTab, onChange }: Props) {
  return (
    <div className="flex border-b border-gray-200 bg-white shrink-0">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
            activeTab === tab.id
              ? 'text-indigo-600 border-b-2 border-indigo-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
