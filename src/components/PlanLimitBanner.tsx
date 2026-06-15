import type { CSSProperties } from 'react';
import { Lock, XCircle } from '@phosphor-icons/react';
import Spinner from './Spinner';

interface Props {
  children: React.ReactNode;
  onButtonClick: () => void;
  buttonText: string;
  isLoading?: boolean;
  errorMessage?: string | null;
  withMX?: boolean;
  closable?: boolean;
  onClose?: () => void;
  styles?: CSSProperties;
}

export default function PlanLimitBanner({
  children,
  onButtonClick,
  buttonText,
  isLoading = false,
  errorMessage,
  withMX = true,
  closable = false,
  onClose,
  styles = {},
}: Props) {
  return (
    <div
      className={`${withMX ? 'mx-3' : ''} my-2 px-4 py-4 rounded-md border border-gray-200 bg-white flex flex-col items-center gap-2 text-center relative`}
      style={styles}
    >
      {closable && onClose && (
        <button
          type="button"
          onClick={onClose}
          className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Dismiss"
        >
          <XCircle size={16} />
        </button>
      )}
      <Lock size={18} className="text-gray-400" />
      {children}
      <button
        type="button"
        onClick={onButtonClick}
        disabled={isLoading}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading && <Spinner size={11} className="text-white" />}
        {buttonText}
      </button>
      {errorMessage && <p className="text-xs text-red-500">{errorMessage}</p>}
    </div>
  );
}
