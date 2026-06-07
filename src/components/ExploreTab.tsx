import { useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../config';
import { useAuth } from '../hooks/useAuth';
import { useClients, type Client } from '../hooks/useClients';
import { useCvGenerate } from '../hooks/useCvGenerate';

interface OfferSalary {
  min: number;
  max: number;
  currency: string;
  type: string;
  delta: number;
  delta_normalized?: number;
}

interface UserOffer {
  user_offer_id: string;
  offer_title: string;
  offer_company: string;
  offer_url?: string;
  claude_score?: number | null;
  claude_role_fit?: string;
  claude_missing_skills?: string[];
  salary?: OfferSalary[];
  source?: string;
}

function providerIcon(source?: string): string | null {
  if (!source) return null;
  if (typeof chrome === 'undefined' || !chrome.runtime?.getURL) return null;
  return chrome.runtime.getURL(`icons/${source}.png`);
}

function formatNum(n: number): string {
  const sign = n < 0 ? '-' : '';
  return (
    sign +
    Math.abs(Math.round(n))
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  );
}

function offerScoreBadgeClass(score: number): string {
  if (score >= 70) return 'bg-green-100 text-green-700 border border-green-200';
  if (score >= 50)
    return 'bg-yellow-100 text-yellow-700 border border-yellow-200';
  return 'bg-gray-100 text-gray-500 border border-gray-200';
}

function sortOffers(offers: UserOffer[], sortBy: string): UserOffer[] {
  if (sortBy === 'score') {
    return [...offers].sort(
      (a, b) => (b.claude_score ?? -1) - (a.claude_score ?? -1),
    );
  }
  if (sortBy === 'salary_delta') {
    const withSalary = offers.filter(o => o.salary && o.salary.length > 0);
    const noSalary = offers.filter(o => !o.salary || o.salary.length === 0);
    const maxDelta = (o: UserOffer) =>
      Math.max(...(o.salary ?? []).map(s => s.delta));
    withSalary.sort((a, b) => maxDelta(b) - maxDelta(a));
    return [...withSalary, ...noSalary];
  }
  return offers;
}

function getPageText(tabId: number): Promise<string> {
  return new Promise(resolve => {
    if (typeof chrome === 'undefined') {
      resolve('');
      return;
    }
    chrome.tabs.sendMessage(
      tabId,
      { type: 'GET_PAGE_DATA' },
      (response: { text?: string }) => {
        if (chrome.runtime.lastError) {
          resolve('');
          return;
        }
        resolve(response?.text ?? '');
      },
    );
  });
}

interface Props {
  onLogout: () => void;
  activeTabId?: number;
  currentUrl?: string;
}

interface ClientAccordionProps {
  client: Client;
  activeTabId?: number;
  currentUrl?: string;
  sortBy: string;
}

interface OfferCardProps {
  offer: UserOffer;
  clientId: string;
  clientFirstName: string;
  clientLastName: string;
  isOpen: boolean;
  onToggle: () => void;
  activeTabId?: number;
  onRemove: (offerId: string) => void;
}

function OfferCard({
  offer,
  clientId,
  clientFirstName,
  clientLastName,
  isOpen,
  onToggle,
  activeTabId,
  onRemove,
}: OfferCardProps) {
  const { getToken } = useAuth();
  const { generateCV } = useCvGenerate();
  const [isGenerating, setIsGenerating] = useState(false);
  const [cvLanguage, setCvLanguage] = useState('en');
  const [status, setStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState('');
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const icon = providerIcon(offer.source);

  async function handleGenerate() {
    if (activeTabId === undefined) {
      setStatus({ type: 'error', message: 'Could not read page content.' });
      return;
    }
    const offerText = await getPageText(activeTabId);
    if (!offerText.trim()) {
      setStatus({
        type: 'error',
        message:
          'Could not read page content. Make sure you are on the job offer page.',
      });
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setIsGenerating(true);
    setStatus(null);
    const result = await generateCV(
      clientId,
      offerText,
      cvLanguage,
      clientFirstName,
      clientLastName,
      offer.offer_company,
      offer.offer_title,
      controller.signal,
    );
    setIsGenerating(false);
    if (!result.success) {
      if (result.error) setStatus({ type: 'error', message: result.error });
    } else if (result.clipboardFailed) {
      setStatus({
        type: 'success',
        message: `CV ready — copy manually: ${result.filename}`,
      });
    } else {
      setStatus({
        type: 'success',
        message: 'CV ready — filename copied to clipboard',
      });
    }
  }

  function handleAbort() {
    abortRef.current?.abort();
    setIsGenerating(false);
    setStatus(null);
  }

  async function handleWithdrawSave() {
    if (!withdrawReason.trim()) return;
    const token = await getToken();
    if (!token) return;
    setIsWithdrawing(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/v1/user-offers/${offer.user_offer_id}/withdraw`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ reason: withdrawReason }),
        },
      );
      if (res.ok) {
        onRemove(offer.user_offer_id);
      } else {
        setStatus({
          type: 'error',
          message: `Withdraw failed (${res.status}).`,
        });
        setIsWithdrawing(false);
      }
    } catch {
      setStatus({ type: 'error', message: 'Network error during withdraw.' });
      setIsWithdrawing(false);
    }
  }

  async function handleApplied() {
    const token = await getToken();
    if (!token) return;
    setIsApplying(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/v1/user-offers/${offer.user_offer_id}/status`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'applied' }),
        },
      );
      if (res.ok) {
        onRemove(offer.user_offer_id);
      } else {
        setStatus({ type: 'error', message: `Applied failed (${res.status}).` });
        setIsApplying(false);
      }
    } catch {
      setStatus({ type: 'error', message: 'Network error.' });
      setIsApplying(false);
    }
  }

  return (
    <div className="border-b border-gray-100 last:border-0" data-user-offer-id={offer.user_offer_id}>
      {/* Header row — click to expand/collapse */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-3 py-2.5 text-left flex items-center gap-2 hover:bg-gray-50 transition-colors group"
      >
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {icon && (
            <img src={icon} width={16} height={16} className="shrink-0" />
          )}
          {offer.claude_score != null && (
            <span
              className={`text-xs font-medium px-1.5 py-0.5 rounded border shrink-0 ${offerScoreBadgeClass(offer.claude_score)}`}
            >
              {offer.claude_score}%
            </span>
          )}
          <span className="text-xs leading-snug">
            <span className="font-medium text-[#1a1a1a] group-hover:text-indigo-700">
              {offer.offer_title}
            </span>
            <span className="text-gray-600"> @ {offer.offer_company}</span>
          </span>
        </div>
        <svg
          className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Always visible: role fit + salary */}
      <div className="px-3 pb-2 flex flex-col gap-1">
        {offer.claude_role_fit && (
          <p className="text-xs text-gray-600 leading-relaxed">
            {offer.claude_role_fit}
          </p>
        )}
        {offer.salary && offer.salary.length > 0 ? (
          <div className="flex flex-col gap-0.5">
            {offer.salary.map((s, i) => {
              const deltaColor =
                s.delta >= 0 ? 'text-orange-500' : 'text-red-500';
              const deltaStr =
                s.delta >= 0 ? `+${formatNum(s.delta)}` : formatNum(s.delta);
              return (
                <span key={i} className="text-xs text-gray-500">
                  💰 {s.currency} {s.type} {formatNum(s.min)} –{' '}
                  {formatNum(s.max)}{' '}
                  <span className={deltaColor}>{deltaStr}</span>
                  {s.currency !== 'PLN' && s.delta_normalized != null && (
                    <span className={deltaColor}>
                      {' '}
                      ({formatNum(s.delta_normalized)} PLN)
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        ) : (
          <span className="text-gray-400 text-sm italic">
            Salary not disclosed
          </span>
        )}
      </div>

      {/* Expanded: CV generation + Withdraw */}
      {isOpen && (
        <div className="px-3 pb-3 flex flex-col gap-2 border-t border-gray-100 pt-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">
              CV Language
            </label>
            <select
              value={cvLanguage}
              onChange={e => setCvLanguage(e.target.value)}
              disabled={isGenerating}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
            >
              <option value="en">English</option>
              <option value="pl">Polish</option>
            </select>
          </div>

          {isGenerating ? (
            <div className="flex gap-2">
              <button
                type="button"
                disabled
                className="flex-1 bg-indigo-400 cursor-not-allowed text-white font-medium py-2 px-3 rounded-md text-sm flex items-center justify-center gap-2"
              >
                <svg
                  className="animate-spin h-3.5 w-3.5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Generating…
              </button>
              <button
                type="button"
                onClick={handleAbort}
                className="flex-1 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-medium py-2 px-3 rounded-md text-sm transition-colors"
              >
                Abort
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleGenerate}
              className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-medium py-2 px-3 rounded-md text-sm transition-colors"
            >
              Generate CV
            </button>
          )}

          {status && (
            <div
              className={`text-xs px-2.5 py-2 rounded-md border ${
                status.type === 'success'
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : 'bg-red-50 text-red-700 border-red-200'
              }`}
            >
              {status.message}
            </div>
          )}

          {!showWithdraw ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleApplied}
                disabled={isApplying}
                className="flex-1 bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:bg-green-300 disabled:cursor-not-allowed text-white font-medium py-2 px-3 rounded-md text-sm transition-colors"
              >
                {isApplying ? 'Saving…' : 'Applied'}
              </button>
              <button
                type="button"
                onClick={() => setShowWithdraw(true)}
                className="flex-1 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-medium py-2 px-3 rounded-md text-sm transition-colors"
              >
                Withdraw
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <textarea
                value={withdrawReason}
                onChange={e => setWithdrawReason(e.target.value)}
                placeholder="Withdraw reason (required)"
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent resize-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowWithdraw(false);
                    setWithdrawReason('');
                  }}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-3 rounded-md text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleWithdrawSave}
                  disabled={!withdrawReason.trim() || isWithdrawing}
                  className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed text-white font-medium py-2 px-3 rounded-md text-sm transition-colors"
                >
                  {isWithdrawing ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ClientAccordion({
  client,
  activeTabId,
  currentUrl,
  sortBy,
}: ClientAccordionProps) {
  const { getToken } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [applyOffers, setApplyOffers] = useState<UserOffer[]>([]);
  const [levelUpOffers, setLevelUpOffers] = useState<UserOffer[]>([]);
  const [applyOpen, setApplyOpen] = useState(true);
  const [levelUpOpen, setLevelUpOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [expandedOfferId, setExpandedOfferId] = useState<string | null>(null);

  function handleCardToggle(offerId: string, offerUrl?: string) {
    if (expandedOfferId === offerId) {
      setExpandedOfferId(null);
      return;
    }
    setExpandedOfferId(offerId);
    if (offerUrl && typeof chrome !== 'undefined') {
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        if (tabs[0]?.id !== undefined)
          chrome.tabs.update(tabs[0].id, { url: offerUrl });
      });
    }
  }

  useEffect(() => {
    if (!expandedOfferId || !currentUrl) return;
    const expandedOffer =
      applyOffers.find(o => o.user_offer_id === expandedOfferId) ??
      levelUpOffers.find(o => o.user_offer_id === expandedOfferId);
    if (expandedOffer?.offer_url) {
      const offerBaseUrl = expandedOffer.offer_url.split('?')[0];
      if (!currentUrl.startsWith(offerBaseUrl)) {
        setExpandedOfferId(null);
      }
    }
  }, [currentUrl]);

  useEffect(() => {
    if (!currentUrl || !hasLoaded) return;
    const allOffers = [...applyOffers, ...levelUpOffers];
    const match = allOffers.find(
      o => o.offer_url && currentUrl.startsWith(o.offer_url.split('?')[0]),
    );
    if (match) {
      setExpandedOfferId(match.user_offer_id);
      setTimeout(() => {
        document
          .querySelector(`[data-user-offer-id="${match.user_offer_id}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
    }
  }, [currentUrl, applyOffers, levelUpOffers]);

  const [levelUpCount, setLevelUpCount] = useState<number | null>(null);

  useEffect(() => {
    async function loadCount() {
      const token = await getToken();
      if (!token) return;
      try {
        const applyParams = new URLSearchParams({
          client_id: client.id,
          status: 'pending_apply',
          count_only: 'true',
        });
        const levelUpParams = new URLSearchParams({
          client_id: client.id,
          status: 'ai_rejected',
          has_learning_goals: 'true',
          count_only: 'true',
        });
        const [applyRes, levelUpRes] = await Promise.all([
          fetch(`${API_BASE_URL}/v1/user-offers?${applyParams}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_BASE_URL}/v1/user-offers?${levelUpParams}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        if (applyRes.ok) {
          const data = (await applyRes.json()) as {
            count?: number;
            total?: number;
          };
          setPendingCount(data.count ?? data.total ?? null);
        }
        if (levelUpRes.ok) {
          const data = (await levelUpRes.json()) as {
            count?: number;
            total?: number;
          };
          const n = data.count ?? data.total ?? 0;
          if (n > 0) setLevelUpCount(n);
        }
      } catch {
        // badges are optional — silent fail
      }
    }
    loadCount();
  }, [client.id]);

  async function fetchOffers(
    status: string,
    hasLearningGoals = false,
  ): Promise<UserOffer[]> {
    const token = await getToken();
    if (!token) return [];
    const params = new URLSearchParams({ client_id: client.id, status });
    if (hasLearningGoals) params.append('has_learning_goals', 'true');
    try {
      const res = await fetch(`${API_BASE_URL}/v1/user-offers?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { offers?: UserOffer[] } | UserOffer[];
      return (Array.isArray(data) ? data : data.offers) ?? [];
    } catch {
      return [];
    }
  }

  async function handleToggle() {
    const opening = !isOpen;
    setIsOpen(opening);
    if (opening && !hasLoaded) {
      setIsLoading(true);
      const [pending, levelUp] = await Promise.all([
        fetchOffers('pending_apply'),
        fetchOffers('ai_rejected', true),
      ]);
      setApplyOffers(pending);
      setLevelUpOffers(levelUp);
      setIsLoading(false);
      setHasLoaded(true);
    }
  }

  const [isRefreshing, setIsRefreshing] = useState(false);

  async function handleRefresh() {
    setIsRefreshing(true);
    setIsLoading(true);
    const [pending, levelUp] = await Promise.all([
      fetchOffers('pending_apply'),
      fetchOffers('ai_rejected', true),
    ]);
    setApplyOffers(pending);
    setLevelUpOffers(levelUp);
    setIsLoading(false);
    setHasLoaded(true);
    setIsRefreshing(false);
  }

  return (
    <div className="border border-gray-200 rounded-md overflow-hidden">
      <div
        role="button"
        tabIndex={0}
        onClick={handleToggle}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') handleToggle();
        }}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-white hover:bg-gray-50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900">
            {client.first_name} {client.last_name}
          </span>
          {pendingCount !== null && pendingCount > 0 && (
            <span className="text-xs font-medium bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">
              {pendingCount}
            </span>
          )}
          {levelUpCount !== null && (
            <span className="text-xs font-medium bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded">
              {levelUpCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              handleRefresh();
            }}
            disabled={isRefreshing}
            title="Refresh"
            className="text-gray-400 hover:text-gray-600 disabled:opacity-40 p-0.5 leading-none"
          >
            {isRefreshing ? (
              <svg
                className="animate-spin h-3.5 w-3.5"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            ) : (
              <span className="text-sm">🔄</span>
            )}
          </button>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </div>

      {isOpen && (
        <div className="border-t border-gray-200">
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <svg
                className="animate-spin h-4 w-4 text-indigo-600"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            </div>
          ) : (
            <>
              {/* Apply now sub-section */}
              {applyOffers.length > 0 && (
                <div className="border-b border-gray-100">
                  <button
                    type="button"
                    onClick={() => setApplyOpen(v => !v)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                        Apply now
                      </span>
                      <span className="text-xs font-medium bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
                        {applyOffers.length}
                      </span>
                    </div>
                    <svg
                      className={`w-3.5 h-3.5 text-gray-400 transition-transform ${applyOpen ? 'rotate-180' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>
                  {applyOpen && (
                    <div>
                      {sortOffers(applyOffers, sortBy).map(offer => (
                        <OfferCard
                          key={offer.user_offer_id}
                          offer={offer}
                          clientId={client.id}
                          clientFirstName={client.first_name}
                          clientLastName={client.last_name}
                          isOpen={expandedOfferId === offer.user_offer_id}
                          onToggle={() =>
                            handleCardToggle(
                              offer.user_offer_id,
                              offer.offer_url,
                            )
                          }
                          activeTabId={activeTabId}
                          onRemove={id =>
                            setApplyOffers(prev =>
                              prev.filter(o => o.user_offer_id !== id),
                            )
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Level up sub-section */}
              {levelUpOffers.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setLevelUpOpen(v => !v)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                        Level up & earn more
                      </span>
                      <span className="text-xs font-medium bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded">
                        {levelUpOffers.length}
                      </span>
                    </div>
                    <svg
                      className={`w-3.5 h-3.5 text-gray-400 transition-transform ${levelUpOpen ? 'rotate-180' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>
                  {levelUpOpen && (
                    <div>
                      {sortOffers(levelUpOffers, sortBy).map(offer => (
                        <OfferCard
                          key={offer.user_offer_id}
                          offer={offer}
                          clientId={client.id}
                          clientFirstName={client.first_name}
                          clientLastName={client.last_name}
                          isOpen={expandedOfferId === offer.user_offer_id}
                          onToggle={() =>
                            handleCardToggle(
                              offer.user_offer_id,
                              offer.offer_url,
                            )
                          }
                          activeTabId={activeTabId}
                          onRemove={id =>
                            setLevelUpOffers(prev =>
                              prev.filter(o => o.user_offer_id !== id),
                            )
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
              {applyOffers.length === 0 && levelUpOffers.length === 0 && (
                <p className="px-3 py-3 text-gray-400">No offers found</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function ExploreTab({
  onLogout,
  activeTabId,
  currentUrl,
}: Props) {
  const { fetchClients } = useClients();
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState('score');

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    chrome.storage.local.get('hd_sort_by', result => {
      if (chrome.runtime.lastError) return;
      if (result.hd_sort_by) setSortBy(result.hd_sort_by as string);
    });
  }, []);

  function handleSortChange(value: string) {
    setSortBy(value);
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ hd_sort_by: value });
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const result = await fetchClients();
      if (cancelled) return;
      setIsLoading(false);
      if ('error' in result) {
        setError(result.error);
        if (result.error.includes('Session expired')) onLogout();
      } else {
        setClients(result.clients);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <svg
          className="animate-spin h-5 w-5 text-indigo-600"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      </div>
    );
  }

  if (error) {
    return <p className="px-4 py-5 text-sm text-red-600">{error}</p>;
  }

  return (
    <div className="px-4 py-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Sort by:</span>
        <select
          value={sortBy}
          onChange={e => handleSortChange(e.target.value)}
          className="text-xs border border-gray-300 rounded px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="score">Score</option>
          <option value="salary_delta">Salary delta</option>
        </select>
      </div>
      {clients.length === 0 ? (
        <p className="text-sm text-gray-500">No clients found.</p>
      ) : (
        clients.map(client => (
          <ClientAccordion
            key={client.id}
            client={client}
            activeTabId={activeTabId}
            currentUrl={currentUrl}
            sortBy={sortBy}
          />
        ))
      )}
    </div>
  );
}
