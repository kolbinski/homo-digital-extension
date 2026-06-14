import { Lock } from '@phosphor-icons/react';

interface Props {
  children: React.ReactNode;
  onUpgradeClick: () => void;
}

export default function PlanLimitBanner({ children, onUpgradeClick }: Props) {
  return (
    <div className="mx-3 my-2 px-4 py-4 rounded-md border border-gray-200 bg-gray-50 flex flex-col items-center gap-2 text-center">
      <Lock size={18} className="text-gray-400" />
      {children}
      <button
        type="button"
        onClick={onUpgradeClick}
        className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded transition-colors"
      >
        Upgrade to Pro
      </button>
    </div>
  );
}
