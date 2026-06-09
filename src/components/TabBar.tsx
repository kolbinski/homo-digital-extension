export type Tab = 'explore' | 'sync'

const TABS: { id: Tab; label: string }[] = [
  { id: 'explore', label: 'Explore & Apply' },
  { id: 'sync', label: 'Sync' },
]

interface Props {
  activeTab: Tab
  onChange: (tab: Tab) => void
  isSyncing?: boolean
  showSync?: boolean
}

export default function TabBar({ activeTab, onChange, isSyncing, showSync = true }: Props) {
  const visibleTabs = TABS.filter(tab => tab.id !== 'sync' || showSync)
  return (
    <div className="flex border-b border-gray-200 bg-white shrink-0">
      {visibleTabs.map((tab) => {
        const disabled = isSyncing && tab.id !== 'sync'
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => !disabled && onChange(tab.id)}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-gray-500 hover:text-gray-700'
            } ${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
