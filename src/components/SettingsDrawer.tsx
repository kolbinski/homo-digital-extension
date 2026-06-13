import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@phosphor-icons/react';
import Spinner from './Spinner';
import { useAuth } from '../hooks/useAuth';
import { API_BASE_URL } from '../config';
import PlanDrawer from './PlanDrawer';

interface SubscriptionStatus {
  plan_name: string;
  current_period_end: string | null;
  status: 'active' | 'cancelling' | 'free';
}

interface Props {
  onClose: () => void;
  onLogout: () => void;
}

export default function SettingsDrawer({ onClose, onLogout }: Props) {
  const { getToken } = useAuth();
  const [visible, setVisible] = useState(false);

  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(
    null,
  );
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [subscriptionError, setSubscriptionError] = useState(false);
  const [managePlanOpen, setManagePlanOpen] = useState(false);

  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');

  const [showConfirm, setShowConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const fetchSubscription = useCallback(async () => {
    setSubscriptionLoading(true);
    setSubscriptionError(false);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/v1/subscription/status`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        setSubscriptionError(true);
        return;
      }
      const data = (await res.json()) as SubscriptionStatus;
      setSubscription(data);
    } catch {
      setSubscriptionError(true);
    } finally {
      setSubscriptionLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void fetchSubscription();
  }, [fetchSubscription]);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 200);
  }

  async function handleSend() {
    if (!message.trim()) return;
    setFeedbackError('');
    setIsSending(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/v1/feedback`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token ?? ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: message.trim(), source: 'extension' }),
      });
      if (!res.ok) {
        setFeedbackError('Something went wrong. Please try again.');
        return;
      }
      setMessage('');
      setFeedbackSent(true);
    } catch {
      setFeedbackError('Network error. Please try again.');
    } finally {
      setIsSending(false);
    }
  }

  async function handleDeleteAccount() {
    setIsDeleting(true);
    setDeleteError('');
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/v1/account`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      onLogout();
    } catch {
      setDeleteError('Failed to delete account. Please try again.');
      setIsDeleting(false);
    }
  }

  const isPro =
    subscription != null &&
    subscription.plan_name.toLowerCase() !== 'free';

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        className={`absolute inset-0 bg-black/20 transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleClose}
      />
      <div
        className={`absolute inset-y-0 right-0 w-full bg-white flex flex-col shadow-xl transition-transform duration-200 ${visible ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {isDeleting ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4">
            <Spinner size={28} className="text-red-500" />
            <p className="text-base font-semibold text-gray-900">
              Your account is being deleted.
            </p>
            <p className="text-sm text-gray-500">
              Please wait while we securely remove your data. This may take a
              moment.
            </p>
          </div>
        ) : (
          <>
            <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 shrink-0">
              <span className="text-sm font-semibold text-gray-900">
                Settings
              </span>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close"
                className="text-gray-800 hover:text-gray-700 transition-colors"
              >
                <X size={16} />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-6">
              {/* Your plan */}
              <section className="flex flex-col gap-3">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Your plan
                </h2>
                <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 flex flex-col gap-2">
                  {subscriptionLoading ? (
                    <div className="flex justify-center">
                      <Spinner size={16} className="text-gray-400" />
                    </div>
                  ) : subscriptionError ? (
                    <p className="text-sm text-gray-500">
                      Could not load plan info
                    </p>
                  ) : subscription ? (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">
                          {subscription.plan_name
                            ? subscription.plan_name.charAt(0).toUpperCase() +
                              subscription.plan_name.slice(1)
                            : 'Free'}
                        </span>
                        {subscription.current_period_end && (
                          <span className="text-xs text-gray-500">
                            Ends at{' '}
                            {subscription.current_period_end.slice(0, 10)}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setManagePlanOpen(true)}
                        className="text-sm text-gray-500 hover:text-gray-700 transition-colors self-start"
                      >
                        Manage your plan
                      </button>
                    </>
                  ) : null}
                </div>
              </section>

              {/* Feedback */}
              <section className="flex flex-col gap-3">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Feedback
                </h2>
                {feedbackSent ? (
                  <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2.5">
                    Thank you! We'll get back to you soon.
                  </p>
                ) : (
                  <>
                    <textarea
                      value={message}
                      onChange={e => {
                        setMessage(e.target.value);
                        setFeedbackError('');
                      }}
                      placeholder="Write your feedback or anything we should improve..."
                      rows={4}
                      disabled={isSending}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent resize-none disabled:bg-gray-50 disabled:text-gray-400"
                    />
                    {feedbackError && (
                      <p className="text-xs text-red-600">{feedbackError}</p>
                    )}
                    <button
                      type="button"
                      onClick={handleSend}
                      disabled={isSending || !message.trim()}
                      className="w-full text-white font-medium py-2 px-4 rounded-md text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed bg-green-600 hover:bg-green-700"
                    >
                      {isSending && <Spinner className="text-white" />}
                      {isSending ? 'Sending…' : 'Send'}
                    </button>
                  </>
                )}
              </section>

              {/* Account */}
              <section className="flex flex-col gap-3">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Account
                </h2>
                <button
                  type="button"
                  onClick={onLogout}
                  className="w-full font-medium py-2 px-4 rounded-md text-sm transition-colors bg-gray-700 hover:bg-gray-800 text-gray-100"
                >
                  Log out
                </button>
                {deleteError && (
                  <p className="text-xs text-red-600">{deleteError}</p>
                )}
                {!showConfirm ? (
                  <button
                    type="button"
                    onClick={() => setShowConfirm(true)}
                    className="w-full text-white font-medium py-2 px-4 rounded-md text-sm transition-colors bg-red-600 hover:bg-red-700"
                  >
                    Delete account
                  </button>
                ) : (
                  <div className="flex flex-col gap-3 p-3 border border-red-200 rounded-md bg-red-50">
                    <p className="text-sm text-gray-700">
                      Are you sure? This action cannot be undone.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setShowConfirm(false)}
                        className="flex-1 py-2 px-3 rounded-md text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteAccount}
                        className="flex-1 py-2 px-3 rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700 flex items-center justify-center gap-1.5"
                      >
                        Delete account
                      </button>
                    </div>
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </div>
      {managePlanOpen && (
        <PlanDrawer
          isPro={isPro}
          onClose={() => setManagePlanOpen(false)}
          zIndex={60}
          currentPeriodEnd={subscription?.current_period_end}
          onCancelSuccess={() => void fetchSubscription()}
          status={subscription?.status ?? 'free'}
        />
      )}
    </div>,
    document.body,
  );
}
