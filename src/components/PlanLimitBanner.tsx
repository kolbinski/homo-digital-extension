import { Lock } from '@phosphor-icons/react';
import Spinner from './Spinner';

interface Props {
  children: React.ReactNode;
  onUpgradeClick: () => void;
  buttonLabel?: string;
  isLoading?: boolean;
  errorMessage?: string | null;
}

export default function PlanLimitBanner({
  children,
  onUpgradeClick,
  buttonLabel = 'Upgrade to Pro',
  isLoading = false,
  errorMessage,
}: Props) {
  return (
    <div className="mx-3 my-2 px-4 py-4 rounded-md border border-gray-200 bg-gray-50 flex flex-col items-center gap-2 text-center">
      <Lock size={18} className="text-gray-400" />
      {children}
      <button
        type="button"
        onClick={onUpgradeClick}
        disabled={isLoading}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading && <Spinner size={11} className="text-white" />}
        {buttonLabel}
      </button>
      {errorMessage && (
        <p className="text-xs text-red-500">{errorMessage}</p>
      )}
    </div>
  );
}
