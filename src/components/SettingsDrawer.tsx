import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowSquareOut,
  CheckCircle,
  CloudCheck,
  X,
} from '@phosphor-icons/react';
import Spinner from './Spinner';
import { useAuth } from '../hooks/useAuth';
import type { OAuthData } from '../hooks/useAuth';
import { API_BASE_URL } from '../config';
import { useGeneralSettings } from '../store/generalSettingsStore';
import PlanDrawer from './PlanDrawer';
import PlanLimitBanner from './PlanLimitBanner';

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
  profile_relevant_change_counter?: number;
  profile_relevant_change_counter_max?: number;
  review_by_ai_counter?: number;
  review_by_ai_counter_max?: number;
  is_admin?: boolean;
}

interface AiUsageResponse {
  total_cost_all_time: number;
  total_cost_this_month: number;
  by_type: { type: string; count: number; cost: number }[];
  by_model: { model: string; count: number; cost: number }[];
  top_users: {
    email: string;
    total_cost: number;
    by_model: { model: string; count: number; cost: number }[];
  }[];
}

interface BillingData {
  name: string | null;
  email: string | null;
  address: {
    line1: string | null;
    line2: string | null;
    city: string | null;
    postal_code: string | null;
    country: string | null;
  } | null;
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
  return d.toLocaleDateString(navigator.language);
}

export default function SettingsDrawer({ onClose, onLogout }: Props) {
  const { getToken, getOAuthData } = useAuth();
  const { settings: generalSettings } = useGeneralSettings();
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
  const [checkedReasons, setCheckedReasons] = useState<string[]>([]);
  const [deleteFeedback, setDeleteFeedback] = useState('');
  const [feedbackRequired, setFeedbackRequired] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [deleteCompleted, setDeleteCompleted] = useState(false);
  const confirmationBoxRef = useRef<HTMLDivElement>(null);

  const [oauthData, setOauthData] = useState<OAuthData | null>(null);

  const [billingData, setBillingData] = useState<BillingData | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const [billingHistory, setBillingHistory] = useState<BillingHistoryItem[]>(
    [],
  );
  const [billingHistoryLoading, setBillingHistoryLoading] = useState(true);

  const [accountSettings, setAccountSettings] = useState<{
    timezone: string | null;
    preferred_currency: string | null;
  } | null>(null);
  const [currencySaved, setCurrencySaved] = useState(false);
  const [currencyLoading, setCurrencyLoading] = useState(false);
  const [timezoneSaved, setTimezoneSaved] = useState(false);
  const [tzQuery, setTzQuery] = useState('');
  const [tzDropdownOpen, setTzDropdownOpen] = useState(false);
  const tzWrapperRef = useRef<HTMLDivElement>(null);
  const currencySavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const timezoneSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const prevCurrencyRef = useRef<string>('USD');
  const [pendingCurrency, setPendingCurrency] = useState<string | null>(null);
  const pendingCurrencyRef = useRef<string | null>(null);
  pendingCurrencyRef.current = pendingCurrency;
  const [showCurrencyLimitBanner, setShowCurrencyLimitBanner] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const checkoutTabIdRef = useRef<number | null>(null);
  const [aiUsage, setAiUsage] = useState<AiUsageResponse | null>(null);
  const [aiUsageLoading, setAiUsageLoading] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  useEffect(() => {
    if (showConfirm) {
      requestAnimationFrame(() =>
        confirmationBoxRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        }),
      );
    }
  }, [showConfirm]);

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
      if (data.is_admin) {
        setAiUsageLoading(true);
        try {
          const usageRes = await fetch(`${API_BASE_URL}/v1/admin/ai-usage`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (usageRes.ok) {
            const usageData = (await usageRes.json()) as AiUsageResponse;
            setAiUsage(usageData);
          }
        } catch {
          // ignore
        } finally {
          setAiUsageLoading(false);
        }
      }
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

  const fetchBillingHistory = useCallback(async () => {
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
  }, [getToken]);

  useEffect(() => {
    void fetchBillingHistory();
  }, [fetchBillingHistory]);

  useEffect(() => {
    void (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API_BASE_URL}/v1/account/settings`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          timezone: string | null;
          preferred_currency: string | null;
        };
        setAccountSettings(data);
        setTzQuery(
          data.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
        );
        prevCurrencyRef.current = data.preferred_currency ?? 'USD';
      } catch {
        // ignore
      }
    })();
  }, [getToken]);

  useEffect(() => {
    if (!tzDropdownOpen) return;
    function handler(e: MouseEvent) {
      if (
        tzWrapperRef.current &&
        !tzWrapperRef.current.contains(e.target as Node)
      ) {
        setTzDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [tzDropdownOpen]);

  useEffect(() => {
    function listener(changes: Record<string, chrome.storage.StorageChange>) {
      if (
        'upgrade_cancelled' in changes &&
        changes.upgrade_cancelled.newValue !== undefined
      ) {
        setCheckoutLoading(false);
        setShowCurrencyLimitBanner(false);
        setPendingCurrency(null);
      }

      const anyPurchase = (
        [
          'upgrade_success',
          'scan_package_purchased',
          'cv_package_purchased',
          'cl_package_purchased',
          'profile_rematch_purchased',
        ] as const
      ).some(key => key in changes && changes[key].newValue !== undefined);
      if (!anyPurchase) return;

      void fetchSubscription();
      void fetchBillingHistory();

      if (
        !('profile_rematch_purchased' in changes) ||
        changes.profile_rematch_purchased.newValue === undefined
      )
        return;
      const pending = pendingCurrencyRef.current;
      if (pending === null) return;
      setPendingCurrency(null);
      setShowCurrencyLimitBanner(false);
      void (async () => {
        try {
          const token = await getToken();
          const patchRes = await fetch(`${API_BASE_URL}/v1/account/settings`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ preferred_currency: pending }),
          });
          if (!patchRes.ok) return;
          setAccountSettings(s =>
            s ? { ...s, preferred_currency: pending } : s,
          );
          await fetch(`${API_BASE_URL}/v1/profile/trigger-sync`, {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          prevCurrencyRef.current = pending;
        } catch {
          // ignore
        }
      })();
    }
    chrome.storage.local.onChanged.addListener(listener);
    return () => chrome.storage.local.onChanged.removeListener(listener);
  }, [getToken, fetchSubscription, fetchBillingHistory]);

  useEffect(() => {
    function onUpdated(tabId: number, changeInfo: { url?: string }) {
      if (tabId !== checkoutTabIdRef.current) return;
      if (changeInfo.url?.includes('upgrade=profile_rematch_package')) {
        setCheckoutLoading(false);
        checkoutTabIdRef.current = null;
      }
    }
    function onRemoved(tabId: number) {
      if (tabId !== checkoutTabIdRef.current) return;
      setCheckoutLoading(false);
      checkoutTabIdRef.current = null;
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

  async function handleBuyRematchFromSettings() {
    setCheckoutLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(
        `${API_BASE_URL}/v1/subscription/profile-rematch-checkout`,
        {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = (await res.json()) as { url: string };
      const tab = await chrome.tabs.create({ url: data.url });
      checkoutTabIdRef.current = tab.id ?? null;
    } catch {
      // ignore
    } finally {
      if (checkoutTabIdRef.current === null) setCheckoutLoading(false);
    }
  }

  async function handleCurrencyChange(value: string) {
    setShowCurrencyLimitBanner(false);
    setPendingCurrency(null);
    setAccountSettings(prev =>
      prev ? { ...prev, preferred_currency: value } : prev,
    );
    setCurrencyLoading(true);
    try {
      const token = await getToken();
      const patchRes = await fetch(`${API_BASE_URL}/v1/account/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ preferred_currency: value }),
      });
      if (!patchRes.ok) return;
      const syncRes = await fetch(`${API_BASE_URL}/v1/profile/trigger-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ force_relevant_change: true }),
      });
      if (syncRes.status === 402) {
        const prev = prevCurrencyRef.current;
        setAccountSettings(s => (s ? { ...s, preferred_currency: prev } : s));
        await fetch(`${API_BASE_URL}/v1/account/settings`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ preferred_currency: prev }),
        });
        setPendingCurrency(value);
        setShowCurrencyLimitBanner(true);
      } else if (syncRes.ok) {
        prevCurrencyRef.current = value;
        setPendingCurrency(null);
        setShowCurrencyLimitBanner(false);
        chrome.storage.local.set({ offers_cleared: Date.now() });
        void (async () => {
          try {
            const profileRes = await fetch(`${API_BASE_URL}/v1/profile`, {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (!profileRes.ok) return;
            const profileData = (await profileRes.json()) as {
              preferences?: {
                salary?: { type: string; min: number; currency: string }[];
              };
            };
            const salary = profileData.preferences?.salary;
            if (!salary || salary.length === 0) return;
            await fetch(`${API_BASE_URL}/v1/profile`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({
                preferences: {
                  ...profileData.preferences,
                  salary: salary.map(s => ({ ...s, currency: value })),
                },
              }),
            });
          } catch {
            /* ignore */
          }
        })();
        if (currencySavedTimerRef.current)
          clearTimeout(currencySavedTimerRef.current);
        setCurrencySaved(true);
        currencySavedTimerRef.current = setTimeout(
          () => setCurrencySaved(false),
          5000,
        );
      }
    } catch {
      // ignore
    } finally {
      setCurrencyLoading(false);
    }
  }

  async function handleTimezoneChange(value: string) {
    setAccountSettings(prev => (prev ? { ...prev, timezone: value } : prev));
    setTzQuery(value);
    setTzDropdownOpen(false);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/v1/account/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ timezone: value }),
      });
      if (!res.ok) return;
      if (timezoneSavedTimerRef.current)
        clearTimeout(timezoneSavedTimerRef.current);
      setTimezoneSaved(true);
      timezoneSavedTimerRef.current = setTimeout(
        () => setTimezoneSaved(false),
        1000,
      );
    } catch {
      // ignore
    }
  }

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

  async function handleLogout() {
    await chrome.storage.local.clear();
    await chrome.storage.session?.clear?.();
    onLogout();
  }

  const deleteTokenRef = useRef<string | null>(null);

  async function handleDeleteAccount() {
    setDeleteError('');
    const token = await getToken();
    deleteTokenRef.current = token;
    await chrome.storage.local.clear();
    await chrome.storage.session?.clear?.();
    setIsDeleting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/account`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setDeleteCompleted(true);
    } catch {
      setIsDeleting(false);
      setShowConfirm(false);
      setDeleteError('Something went wrong. Please try again.');
    }
  }

  function postDeleteReasons(reasons: string[]) {
    const token = deleteTokenRef.current;
    void fetch(`${API_BASE_URL}/v1/account/delete-reasons`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ reasons }),
    });
  }

  function toggleDeleteReason(reason: string) {
    setCheckedReasons(prev => {
      const next = prev.includes(reason)
        ? prev.filter(r => r !== reason)
        : [...prev, reason];
      const required =
        next.includes('Other') || next.includes('Technical issues');
      setFeedbackRequired(required);
      if (!required) setDeleteFeedback('');
      postDeleteReasons(next);
      return next;
    });
  }

  function handleSubmitDeleteFeedback() {
    const token = deleteTokenRef.current;
    void fetch(`${API_BASE_URL}/v1/account/delete-feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ feedback: deleteFeedback }),
    });
    setFeedbackSubmitted(true);
  }

  function handleCancelDeleteFeedback() {
    setCheckedReasons(prev => {
      const next = prev.filter(r => r !== 'Other' && r !== 'Technical issues');
      postDeleteReasons(next);
      return next;
    });
    setFeedbackRequired(false);
    setDeleteFeedback('');
  }

  const isPro =
    subscription != null && subscription.plan_name.toLowerCase() !== 'free';
  const isAdmin = subscription?.is_admin === true;

  const firstName = oauthData?.oauth_first_name ?? '';
  const lastName = oauthData?.oauth_last_name ?? '';
  const initials =
    ((firstName[0] ?? '') + (lastName[0] ?? '')).toUpperCase() || '?';

  const billingViewRows: { label: string; value: string | null | undefined }[] =
    [
      { label: 'Name', value: billingData?.name },
      {
        label: 'Address',
        value:
          `${billingData?.address?.line1 ?? ''} ${billingData?.address?.line2 ?? ''}`.trim(),
      },
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
          <div className="flex-1 overflow-y-auto px-6 py-8 flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <p className="text-base font-semibold text-gray-900">
                We&apos;re sorry to see you go
              </p>
              <p className="text-sm text-gray-500">
                Help us improve by sharing why you&apos;re leaving.
              </p>
            </div>

            {(generalSettings?.delete_reasons?.length ?? 0) > 0 && (
              <div className="flex flex-col gap-2">
                {generalSettings!.delete_reasons!.map(reason => (
                  <label
                    key={reason}
                    className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checkedReasons.includes(reason)}
                      onChange={() => toggleDeleteReason(reason)}
                      className="rounded border-gray-300"
                    />
                    {reason}
                  </label>
                ))}
              </div>
            )}

            {feedbackRequired && !feedbackSubmitted && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">
                  Please tell us more:
                </label>
                <textarea
                  value={deleteFeedback}
                  onChange={e => setDeleteFeedback(e.target.value)}
                  placeholder="Tell us more..."
                  rows={3}
                  className="w-full border border-gray-200 rounded p-2 text-sm resize-none"
                />
                <div className="flex items-center gap-2 mt-1">
                  <button
                    type="button"
                    onClick={handleSubmitDeleteFeedback}
                    className="py-1.5 px-3 rounded-md text-xs font-medium text-white bg-green-600 hover:bg-green-700 transition-colors"
                  >
                    Submit
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelDeleteFeedback}
                    className="py-1.5 px-3 rounded-md text-xs font-medium border border-gray-300 bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {feedbackSubmitted && (
              <p className="text-xs font-medium text-green-600">
                Thank you for your feedback!
              </p>
            )}

            {deleteCompleted ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <CheckCircle size={24} color="green" weight="fill" />
                  Your account was deleted
                </div>
                <button
                  type="button"
                  onClick={onLogout}
                  className="self-start py-2 px-4 rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-700 transition-colors"
                >
                  Go to login screen
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Spinner size={24} className="text-gray-400" />
                Deleting your account…
              </div>
            )}
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
                  {/* Avatar + name/email + Log out */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
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
                    <button
                      type="button"
                      onClick={() => void handleLogout()}
                      className="shrink-0 font-medium px-3 py-1 rounded-md text-xs transition-colors bg-gray-800 hover:bg-gray-900 text-white"
                    >
                      Log out
                    </button>
                  </div>

                  <div className="border-t border-gray-200" />

                  {/* General settings */}
                  <div className="flex flex-col gap-3">
                    <span className="text-xs font-semibold text-gray-700">
                      General settings
                    </span>

                    {/* Currency */}
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <label className="text-xs text-gray-500">
                          Show offer salaries in currency
                        </label>
                        {currencySaved && (
                          <CloudCheck
                            size={20}
                            weight="fill"
                            className="text-green-500 shrink-0"
                          />
                        )}
                      </div>
                      <div className="relative">
                        <select
                          value={accountSettings?.preferred_currency ?? 'USD'}
                          onChange={e =>
                            void handleCurrencyChange(e.target.value)
                          }
                          disabled={currencyLoading || checkoutLoading}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {(generalSettings?.currencies ?? ['USD']).map(c => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                        {currencyLoading && (
                          <div className="absolute inset-y-0 right-6 flex items-center pointer-events-none">
                            <Spinner size={12} className="text-gray-400" />
                          </div>
                        )}
                      </div>
                      {showCurrencyLimitBanner && (
                        <PlanLimitBanner
                          onButtonClick={() =>
                            void handleBuyRematchFromSettings()
                          }
                          buttonText={`Buy ${generalSettings?.profile_relevant_change_package_amount ?? '...'} edits for ${generalSettings?.profile_rematch_package_price?.formatted ?? '...'}`}
                          isLoading={checkoutLoading}
                          withMX={false}
                          closable
                          onClose={() => setShowCurrencyLimitBanner(false)}
                        >
                          <p className="text-xs text-gray-500">
                            You've reached your limit for re-matching offers
                            based on profile changes. Buy more edits to keep
                            matching offers.
                          </p>
                        </PlanLimitBanner>
                      )}
                    </div>

                    {/* Timezone */}
                    <div className="flex flex-col gap-1" ref={tzWrapperRef}>
                      <div className="flex items-center justify-between">
                        <label className="text-xs text-gray-500">
                          My timezone
                        </label>
                        {timezoneSaved && (
                          <CheckCircle
                            size={13}
                            weight="fill"
                            className="text-green-500 shrink-0"
                          />
                        )}
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          value={tzQuery}
                          onChange={e => {
                            setTzQuery(e.target.value);
                            setTzDropdownOpen(true);
                          }}
                          onFocus={() => setTzDropdownOpen(true)}
                          placeholder="Search timezone…"
                          className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                        />
                        {tzDropdownOpen &&
                          (() => {
                            const all = Intl.supportedValuesOf('timeZone');
                            const q = tzQuery.toLowerCase();
                            const starts = q
                              ? all.filter(z => z.toLowerCase().startsWith(q))
                              : all;
                            const contains = q
                              ? all.filter(
                                  z =>
                                    !z.toLowerCase().startsWith(q) &&
                                    z.toLowerCase().includes(q),
                                )
                              : [];
                            const options = [...starts, ...contains].slice(
                              0,
                              60,
                            );
                            return options.length > 0 ? (
                              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-44 overflow-y-auto z-10">
                                {options.map(tz => (
                                  <button
                                    key={tz}
                                    type="button"
                                    onMouseDown={() =>
                                      void handleTimezoneChange(tz)
                                    }
                                    className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-blue-50 transition-colors"
                                  >
                                    {tz}
                                  </button>
                                ))}
                              </div>
                            ) : null;
                          })()}
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-gray-200" />

                  {/* Your billing data */}
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-semibold text-gray-700">
                      Your billing data
                    </span>
                    {billingLoading ? (
                      <div className="flex justify-center py-1">
                        <Spinner size={14} className="text-gray-400" />
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
                </div>
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
                        {subscription.plan_name.toLowerCase() === 'free' ? (
                          <button
                            type="button"
                            onClick={() => setManagePlanOpen(true)}
                            className="px-3 py-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded transition-colors"
                          >
                            Upgrade
                          </button>
                        ) : (
                          subscription.current_period_end && (
                            <span className="text-xs text-gray-500">
                              Ends at{' '}
                              {new Date(
                                subscription.current_period_end,
                              ).toLocaleDateString(navigator.language)}
                            </span>
                          )
                        )}
                      </div>
                      {subscription.plan_name.toLowerCase() !== 'free' && (
                        <button
                          type="button"
                          onClick={() => setManagePlanOpen(true)}
                          className="text-sm text-gray-500 hover:text-gray-700 transition-colors self-start"
                        >
                          Manage your plan
                        </button>
                      )}
                    </>
                  ) : null}
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
                        label: 'Cover letter generations',
                        counter: subscription.cl_counter ?? 0,
                        max: subscription.cl_counter_max ?? 0,
                      },
                      {
                        label: 'Profile-based offer re-matching',
                        counter:
                          subscription.profile_relevant_change_counter ?? 0,
                        max:
                          subscription.profile_relevant_change_counter_max ?? 0,
                      },
                      {
                        label: 'AI Profile Reviews',
                        counter: subscription.review_by_ai_counter ?? 0,
                        max: subscription.review_by_ai_counter_max ?? 0,
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
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-gray-400">
                                {counter}/{max}
                              </span>
                              <span className="text-gray-500 font-medium">
                                {pct}%
                              </span>
                            </div>
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
              {!isAdmin && (
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
              )}

              {/* AI Usage — admin only */}
              {isAdmin && (
                <section className="flex flex-col gap-3">
                  <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    AI Usage
                  </h2>
                  <div
                    className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 flex flex-col"
                    style={{ gap: 6 }}
                  >
                    {aiUsageLoading ? (
                      <div className="flex justify-center">
                        <Spinner size={16} className="text-gray-400" />
                      </div>
                    ) : !aiUsage ? (
                      <p className="text-xs text-gray-400">No data yet.</p>
                    ) : (
                      <>
                        <div className="flex items-center justify-between text-xs font-medium">
                          <span className="text-gray-700">
                            Total (all time)
                          </span>
                          <span className="text-gray-900">
                            ${aiUsage.total_cost_all_time.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-500">This month</span>
                          <span className="text-gray-700">
                            ${aiUsage.total_cost_this_month.toFixed(2)}
                          </span>
                        </div>

                        {aiUsage.by_model.length > 0 && (
                          <>
                            <div className="border-t border-gray-200" />
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                              By model
                            </p>
                            {aiUsage.by_model.map(item => (
                              <div
                                key={item.model}
                                className="flex items-center justify-between text-xs"
                              >
                                <span className="text-gray-600 truncate">
                                  {item.model}
                                </span>
                                <span className="text-gray-700 shrink-0 ml-2">
                                  ${item.cost.toFixed(2)}
                                </span>
                              </div>
                            ))}
                          </>
                        )}

                        {aiUsage.by_type.length > 0 && (
                          <>
                            <div className="border-t border-gray-200" />
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                              By type
                            </p>
                            {aiUsage.by_type.map(item => (
                              <div
                                key={item.type}
                                className="flex items-center justify-between text-xs"
                              >
                                <span className="text-gray-600 truncate">
                                  {item.type}
                                </span>
                                <span className="text-gray-700 shrink-0 ml-2">
                                  ${item.cost.toFixed(2)}
                                </span>
                              </div>
                            ))}
                          </>
                        )}

                        {aiUsage.top_users.length > 0 && (
                          <>
                            <div className="border-t border-gray-200" />
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                              Top users
                            </p>
                            {aiUsage.top_users.map((u, i, arr) => (
                              <div
                                key={u.email}
                                className="flex flex-col gap-0.5"
                              >
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-gray-900 font-medium truncate">
                                    {u.email}
                                  </span>
                                  <span className="text-gray-700 shrink-0 ml-2">
                                    ${u.total_cost.toFixed(2)}
                                  </span>
                                </div>
                                {u.by_model.map(m => (
                                  <div
                                    key={m.model}
                                    className="flex items-center justify-between text-xs text-gray-500 pl-2"
                                  >
                                    <span className="truncate">
                                      {m.model} ({m.count}×)
                                    </span>
                                    <span className="shrink-0 ml-2">
                                      ${m.cost.toFixed(2)}
                                    </span>
                                  </div>
                                ))}
                                {i < arr.length - 1 && (
                                  <div className="border-t border-gray-200 mt-1" />
                                )}
                              </div>
                            ))}
                          </>
                        )}
                      </>
                    )}
                  </div>
                </section>
              )}

              {/* Delete account — always at drawer bottom */}
              <section className="flex flex-col gap-2 pb-1">
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
                  <div
                    ref={confirmationBoxRef}
                    className="flex flex-col gap-3 p-3 border border-red-200 rounded-md bg-red-50"
                  >
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
