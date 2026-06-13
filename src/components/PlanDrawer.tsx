import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@phosphor-icons/react';
import Spinner from './Spinner';
import { useAuth } from '../hooks/useAuth';
import { useGeneralSettings } from '../store/generalSettingsStore';
import { API_BASE_URL } from '../config';

interface Props {
  isPro: boolean;
  onClose: () => void;
  zIndex?: number;
  currentPeriodEnd?: string | null;
  onCancelSuccess?: () => void;
  status?: 'active' | 'cancelling' | 'free';
}

export default function PlanDrawer({
  isPro,
  onClose,
  zIndex = 50,
  currentPeriodEnd,
  onCancelSuccess,
  status = 'free',
}: Props) {
  const { getToken } = useAuth();
  const { settings: generalSettings } = useGeneralSettings();
  const [visible, setVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stripeTabIdRef = useRef<number | null>(null);

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const [isRenewing, setIsRenewing] = useState(false);
  const [renewError, setRenewError] = useState<string | null>(null);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  useEffect(() => {
    function onUpdated(tabId: number, changeInfo: { url?: string }) {
      if (tabId !== stripeTabIdRef.current) return;
      if (changeInfo.url?.includes('upgrade=success')) {
        setIsLoading(false);
        stripeTabIdRef.current = null;
      }
    }

    function onRemoved(tabId: number) {
      if (tabId !== stripeTabIdRef.current) return;
      setIsLoading(false);
      stripeTabIdRef.current = null;
    }

    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.onUpdated.addListener(onUpdated);
      chrome.tabs.onRemoved.addListener(onRemoved);
    }
    return () => {
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        chrome.tabs.onRemoved.removeListener(onRemoved);
      }
    };
  }, []);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 200);
  }

  async function handleUpgrade() {
    setIsLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/v1/subscription/checkout`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = (await res.json()) as { url: string };
      const tab = await chrome.tabs.create({ url: data.url });
      stripeTabIdRef.current = tab.id ?? null;
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      if (stripeTabIdRef.current === null) setIsLoading(false);
    }
  }

  async function handleCancelSubscription() {
    setIsCancelling(true);
    setCancelError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/v1/subscription/cancel`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      handleClose();
      onCancelSuccess?.();
    } catch {
      setCancelError('Something went wrong. Please try again.');
    } finally {
      setIsCancelling(false);
    }
  }

  async function handleRenewSubscription() {
    setIsRenewing(true);
    setRenewError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/v1/subscription/renew`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      handleClose();
      onCancelSuccess?.();
    } catch {
      setRenewError('Something went wrong. Please try again.');
    } finally {
      setIsRenewing(false);
    }
  }

  const endDate = currentPeriodEnd ? currentPeriodEnd.slice(0, 10) : null;

  return createPortal(
    <div className="fixed inset-0" style={{ zIndex }}>
      <div
        className={`absolute inset-0 bg-black/20 transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleClose}
      />
      <div
        className={`absolute inset-y-0 right-0 w-full bg-white flex flex-col shadow-xl transition-transform duration-200 ${visible ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 shrink-0">
          <span className="text-sm font-semibold text-gray-900">
            Manage your plan
          </span>
          <button
            type="button"
            onClick={handleClose}
            disabled={isLoading || isCancelling || isRenewing}
            aria-label="Close"
            className="text-gray-800 hover:text-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
          {/* Free */}
          <div className="rounded-lg border-2 border-gray-200 bg-gray-50 px-4 py-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">Free</span>
              {!isPro && (
                <span className="text-xs font-medium bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                  Current plan
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500">
              Limited matches per sync cycle
            </p>
          </div>

          {/* Pro */}
          <div className="rounded-lg border-2 border-green-500 bg-white px-4 py-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-gray-900">Pro</span>
              </div>
              <div className="flex gap-1.5 items-center">
                <span className="text-xs font-medium text-green-700">
                  {generalSettings?.pro_price?.formatted ?? '$100,01'}/month
                </span>
                {isPro && (
                  <span className="text-xs font-medium bg-green-600 text-white px-2 py-0.5 rounded-full self-center">
                    Current plan
                  </span>
                )}
              </div>
            </div>
            {isPro && status !== 'cancelling' && endDate && (
              <span className="text-xs text-gray-500">Ends at {endDate}</span>
            )}
            <ul className="flex flex-col gap-1.5">
              {[
                'Unlimited matches',
                'Push notifications via mobile app',
                'Priority sync',
              ].map(f => (
                <li
                  key={f}
                  className="flex items-start gap-1.5 text-xs text-gray-700"
                >
                  <span className="text-green-500 shrink-0 mt-px">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            {!isPro && (
              <>
                <button
                  type="button"
                  onClick={handleUpgrade}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading && <Spinner size={14} className="text-white" />}
                  {isLoading ? 'Checkout in progress' : 'Upgrade to Pro'}
                </button>
                {error && (
                  <p className="text-xs text-red-600 text-center">{error}</p>
                )}
              </>
            )}
            {/* Cancel subscription (active) */}
            {isPro && status === 'active' && (
              <div className="mt-1">
                {!showCancelConfirm ? (
                  <button
                    type="button"
                    onClick={() => setShowCancelConfirm(true)}
                    disabled={isCancelling}
                    className="w-full py-2 px-4 rounded-md text-sm font-medium text-red-600 border border-red-300 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel subscription
                  </button>
                ) : (
                  <div className="flex flex-col gap-3 p-3 border border-red-200 rounded-md bg-red-50">
                    <p className="text-sm text-gray-700">
                      Are you sure? You'll keep Pro plan
                      {endDate ? ` until ${endDate}` : ''}. After that, your
                      account will revert to Free.
                    </p>
                    {cancelError && (
                      <p className="text-xs text-red-600">{cancelError}</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowCancelConfirm(false);
                          setCancelError(null);
                        }}
                        disabled={isCancelling}
                        className="flex-1 py-2 px-3 rounded-md text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Keep Pro
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelSubscription}
                        disabled={isCancelling}
                        className="flex-1 py-2 px-3 rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700 flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isCancelling && (
                          <Spinner size={14} className="text-white" />
                        )}
                        Yes, cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* Renew subscription (cancelling) */}
            {isPro && status === 'cancelling' && (
              <div className="mt-1 flex flex-col gap-2">
                {endDate && (
                  <p className="text-xs text-gray-500">
                    Your Pro plan ends on {endDate}.
                  </p>
                )}
                {renewError && (
                  <p className="text-xs text-red-600">{renewError}</p>
                )}
                <button
                  type="button"
                  onClick={handleRenewSubscription}
                  disabled={isRenewing}
                  className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRenewing && <Spinner size={14} className="text-white" />}
                  {isRenewing ? 'Renewing…' : 'Renew subscription'}
                </button>
              </div>
            )}
          </div>

          {/* Premium */}
          <div className="rounded-lg border-2 border-gray-200 bg-gray-50 px-4 py-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">
                Premium
              </span>
              <span className="text-xs font-medium bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                Coming soon
              </span>
            </div>
            <p className="text-xs text-gray-500">
              Advanced features coming soon
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
