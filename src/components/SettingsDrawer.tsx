import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowSquareOut, X } from '@phosphor-icons/react';
import Spinner from './Spinner';
import { useAuth } from '../hooks/useAuth';
import type { OAuthData } from '../hooks/useAuth';
import { API_BASE_URL } from '../config';
import PlanDrawer from './PlanDrawer';

interface SubscriptionStatus {
  plan_name: string;
  current_period_end: string | null;
  status: 'active' | 'cancelling' | 'free';
  scan_page_counter?: number;
  scan_page_counter_max?: number;
  cv_counter?: number;
  cv_counter_max?: number;
  cl_counter?: number;
  cl_counter_max?: number;
}

interface BillingData {
  name: string | null;
  email: string | null;
  address: {
    line1: string | null;
    city: string | null;
    postal_code: string | null;
    country: string | null;
  } | null;
}

interface BillingForm {
  name: string;
  line1: string;
  city: string;
  postal_code: string;
  country: string;
}

interface BillingHistoryItem {
  date: string | number;
  description: string | null;
  amount: number;
  currency: string;
  status: string;
  invoice_pdf?: string | null;
  receipt_url?: string | null;
  hosted_invoice_url?: string | null;
}

interface Props {
  onClose: () => void;
  onLogout: () => void;
}

const BILLING_FORM_FIELDS: { key: keyof BillingForm; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'line1', label: 'Address' },
  { key: 'city', label: 'City' },
  { key: 'postal_code', label: 'Postal code' },
  { key: 'country', label: 'Country' },
];

const EMPTY_BILLING_FORM: BillingForm = {
  name: '',
  line1: '',
  city: '',
  postal_code: '',
  country: '',
};

function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function formatDate(date: string | number): string {
  const d = typeof date === 'number' ? new Date(date * 1000) : new Date(date);
  return d.toISOString().slice(0, 10);
}

export default function SettingsDrawer({ onClose, onLogout }: Props) {
  const { getToken, getOAuthData } = useAuth();
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

  const [oauthData, setOauthData] = useState<OAuthData | null>(null);

  const [billingData, setBillingData] = useState<BillingData | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const [billingEditMode, setBillingEditMode] = useState(false);
  const [billingForm, setBillingForm] =
    useState<BillingForm>(EMPTY_BILLING_FORM);
  const [billingSaving, setBillingSaving] = useState(false);
  const [billingSaveError, setBillingSaveError] = useState<string | null>(null);

  const [billingHistory, setBillingHistory] = useState<BillingHistoryItem[]>(
    [],
  );
  const [billingHistoryLoading, setBillingHistoryLoading] = useState(true);

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

  useEffect(() => {
    void (async () => {
      const data = await getOAuthData();
      setOauthData(data);
    })();
  }, [getOAuthData]);

  useEffect(() => {
    void (async () => {
      setBillingLoading(true);
      try {
        const token = await getToken();
        const res = await fetch(`${API_BASE_URL}/v1/account/billing`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          setBillingData(null);
          return;
        }
        const data = (await res.json()) as { billing_data: BillingData };
        setBillingData(data.billing_data ?? null);
      } catch {
        setBillingData(null);
      } finally {
        setBillingLoading(false);
      }
    })();
  }, [getToken]);

  useEffect(() => {
    void (async () => {
      setBillingHistoryLoading(true);
      try {
        const token = await getToken();
        const res = await fetch(`${API_BASE_URL}/v1/billing/history`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          setBillingHistory([]);
          return;
        }
        const data = (await res.json()) as
          | { history: BillingHistoryItem[] }
          | BillingHistoryItem[];
        setBillingHistory(Array.isArray(data) ? data : (data.history ?? []));
      } catch {
        setBillingHistory([]);
      } finally {
        setBillingHistoryLoading(false);
      }
    })();
  }, [getToken]);

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

  function handleEditBilling() {
    setBillingForm({
      name: billingData?.name ?? '',
      line1: billingData?.address?.line1 ?? '',
      city: billingData?.address?.city ?? '',
      postal_code: billingData?.address?.postal_code ?? '',
      country: billingData?.address?.country ?? '',
    });
    setBillingSaveError(null);
    setBillingEditMode(true);
  }

  function handleCancelBilling() {
    setBillingEditMode(false);
    setBillingSaveError(null);
  }

  function updateBillingField(field: keyof BillingForm, value: string) {
    setBillingForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSaveBilling() {
    setBillingSaving(true);
    setBillingSaveError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/v1/account/billing`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token ?? ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: billingForm.name || null,
          address: {
            line1: billingForm.line1 || null,
            city: billingForm.city || null,
            postal_code: billingForm.postal_code || null,
            country: billingForm.country || null,
          },
        }),
      });
      if (!res.ok) {
        setBillingSaveError('Failed to save. Please try again.');
        return;
      }
      setBillingData(prev => ({
        name: billingForm.name || null,
        email: prev?.email ?? null,
        address: {
          line1: billingForm.line1 || null,
          city: billingForm.city || null,
          postal_code: billingForm.postal_code || null,
          country: billingForm.country || null,
        },
      }));
      setBillingEditMode(false);
    } catch {
      setBillingSaveError('Network error. Please try again.');
    } finally {
      setBillingSaving(false);
    }
  }

  const isPro =
    subscription != null && subscription.plan_name.toLowerCase() !== 'free';

  const firstName = oauthData?.oauth_first_name ?? '';
  const lastName = oauthData?.oauth_last_name ?? '';
  const initials =
    ((firstName[0] ?? '') + (lastName[0] ?? '')).toUpperCase() || '?';

  const billingViewRows: { label: string; value: string | null | undefined }[] =
    [
      { label: 'Name', value: billingData?.name },
      { label: 'Email', value: billingData?.email },
      { label: 'Address', value: billingData?.address?.line1 },
      { label: 'City', value: billingData?.address?.city },
      { label: 'Postal code', value: billingData?.address?.postal_code },
      { label: 'Country', value: billingData?.address?.country },
    ];

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
              {/* Account */}
              <section className="flex flex-col gap-3">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Account
                </h2>
                <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-3 flex flex-col gap-3">
                  {/* Avatar + name/email */}
                  <div className="flex items-center gap-3">
                    {oauthData?.oauth_photo_url ? (
                      <img
                        src={oauthData.oauth_photo_url}
                        alt=""
                        className="w-9 h-9 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-gray-700 text-white text-sm font-medium shrink-0 leading-none">
                        {initials}
                      </span>
                    )}
                    <div className="min-w-0">
                      {(firstName || lastName) && (
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {[firstName, lastName].filter(Boolean).join(' ')}
                        </p>
                      )}
                      {oauthData?.oauth_email && (
                        <p className="text-xs text-gray-500 truncate">
                          {oauthData.oauth_email}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-gray-200" />

                  {/* Your billing data */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-700">
                        Your billing data
                      </span>
                      {!billingEditMode &&
                        !billingLoading &&
                        billingData !== null && (
                          <button
                            type="button"
                            onClick={handleEditBilling}
                            className="text-xs text-blue-600 hover:text-blue-700 transition-colors"
                          >
                            Change
                          </button>
                        )}
                    </div>
                    {billingLoading ? (
                      <div className="flex justify-center py-1">
                        <Spinner size={14} className="text-gray-400" />
                      </div>
                    ) : billingEditMode ? (
                      <div className="flex flex-col gap-2">
                        {BILLING_FORM_FIELDS.map(({ key, label }) => (
                          <div key={key} className="flex flex-col gap-0.5">
                            <label className="text-xs text-gray-500">
                              {label}
                            </label>
                            <input
                              type="text"
                              value={billingForm[key]}
                              onChange={e =>
                                updateBillingField(key, e.target.value)
                              }
                              className="w-full px-2 py-1 border border-gray-300 rounded text-xs text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                        ))}
                        {billingSaveError && (
                          <p className="text-xs text-red-600">
                            {billingSaveError}
                          </p>
                        )}
                        <div className="flex gap-2 mt-1">
                          <button
                            type="button"
                            onClick={handleCancelBilling}
                            disabled={billingSaving}
                            className="flex-1 py-1.5 text-xs font-medium border border-gray-300 rounded bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveBilling}
                            disabled={billingSaving}
                            className="flex-1 py-1.5 text-xs font-medium rounded bg-green-600 hover:bg-green-700 text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
                          >
                            {billingSaving && (
                              <Spinner size={11} className="text-white" />
                            )}
                            Save
                          </button>
                        </div>
                      </div>
                    ) : billingData === null ? (
                      <p className="text-xs text-gray-400">
                        You haven't made any purchases yet. Your billing data
                        will appear here after your first purchase.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {billingViewRows.map(({ label, value }) => (
                          <div
                            key={label}
                            className="flex justify-between gap-2 text-xs"
                          >
                            <span className="text-gray-500 shrink-0">
                              {label}
                            </span>
                            <span
                              className={`text-right ${value ? 'text-gray-900' : 'text-gray-400'}`}
                            >
                              {value ?? 'Not set'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="border-t border-gray-200" />

                  {/* Log out + Delete account */}
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
                </div>
              </section>

              {/* Usage */}
              <section className="flex flex-col gap-3">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Usage
                </h2>
                <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 flex flex-col gap-3">
                  {subscriptionLoading ? (
                    <div className="flex justify-center">
                      <Spinner size={16} className="text-gray-400" />
                    </div>
                  ) : subscription ? (
                    [
                      {
                        label: 'Page scans',
                        counter: subscription.scan_page_counter ?? 0,
                        max: subscription.scan_page_counter_max ?? 0,
                      },
                      {
                        label: 'CV generations',
                        counter: subscription.cv_counter ?? 0,
                        max: subscription.cv_counter_max ?? 0,
                      },
                      {
                        label: 'Cover letters',
                        counter: subscription.cl_counter ?? 0,
                        max: subscription.cl_counter_max ?? 0,
                      },
                    ].map(({ label, counter, max }) => {
                      const pct =
                        max === 0 ? 0 : Math.round((100 * counter) / max);
                      const barColor =
                        pct >= 100
                          ? 'bg-red-500'
                          : pct >= 80
                            ? 'bg-orange-400'
                            : 'bg-green-500';
                      return (
                        <div key={label} className="flex flex-col gap-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-600">{label}</span>
                            <span className="text-gray-500 font-medium">
                              {pct}%
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${barColor} transition-all`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })
                  ) : null}
                </div>
              </section>

              {/* Billing history */}
              <section className="flex flex-col gap-3">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Billing history
                </h2>
                <div className="rounded-md border border-gray-200 bg-gray-50 overflow-hidden">
                  {billingHistoryLoading ? (
                    <div className="flex justify-center py-4">
                      <Spinner size={16} className="text-gray-400" />
                    </div>
                  ) : billingHistory.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-gray-400">
                      No billing history yet.
                    </p>
                  ) : (
                    billingHistory.map((item, i) => {
                      const link =
                        item.invoice_pdf ??
                        item.receipt_url ??
                        item.hosted_invoice_url ??
                        null;
                      return (
                        <div
                          key={i}
                          className={`flex items-center gap-2 px-3 py-2.5 text-xs ${i < billingHistory.length - 1 ? 'border-b border-gray-100' : ''}`}
                        >
                          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                            <span className="text-gray-900 font-medium truncate">
                              {item.description
                                ?.replace('Homo Digital', '')
                                .trim() ?? '—'}
                            </span>
                            <span className="text-gray-400">
                              {formatDate(item.date)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-gray-900 font-medium">
                              {formatAmount(item.amount, item.currency)}
                            </span>
                            {link && (
                              <button
                                type="button"
                                onClick={() =>
                                  chrome.tabs.create({ url: link })
                                }
                                className="text-gray-400 hover:text-gray-600 transition-colors"
                                aria-label="Open invoice"
                              >
                                <ArrowSquareOut size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
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
