import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowsClockwise,
  ArrowUp,
  CurrencyCircleDollar,
} from '@phosphor-icons/react';
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
  cv_language?: string | null;
  city?: string;
  work_model?: string;
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

const STATUS_LABELS: Record<string, string> = {
  pending_apply: 'Pending apply',
  applied: 'Applied',
  agent_withdrawn: 'Agent withdrawn',
  recruiter_rejected: 'Recruiter rejected',
  offer_received: 'Offer received',
  accepted: 'Accepted',
  client_withdrawn: 'Client withdrawn',
};

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

const STATUS_OPTIONS = [
  { value: 'applied', label: 'Applied' },
  { value: 'agent_withdrawn', label: 'Agent withdrawn' },
  { value: 'client_withdrawn', label: 'Client withdrawn' },
  { value: 'offer_received', label: 'Offer received' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'recruiter_rejected', label: 'Recruiter rejected' },
];

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
  statusFilter: string;
  sourceFilter: string;
  minScore: number;
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
  onRollback: (offer: UserOffer) => void;
  onError: (message: string) => void;
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
  onRollback,
  onError,
}: OfferCardProps) {
  const { getToken } = useAuth();
  const { generateCV } = useCvGenerate();
  const [isGenerating, setIsGenerating] = useState(false);
  const [cvLanguage, setCvLanguage] = useState(
    offer.cv_language === 'pl' ? 'pl' : 'en',
  );
  const [status, setStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [statusLoading, setStatusLoading] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) setCvLanguage(offer.cv_language === 'pl' ? 'pl' : 'en');
  }, [isOpen]);

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

  useEffect(() => {
    if (!isDropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDropdownOpen]);

  async function handleStatusChange(newStatus: string) {
    setIsDropdownOpen(false);
    onRemove(offer.user_offer_id);
    setStatusLoading(offer.user_offer_id);
    try {
      const token = await getToken();
      if (!token) {
        onRollback(offer);
        return;
      }
      const res = await fetch(
        `${API_BASE_URL}/v1/user-offers/${offer.user_offer_id}/status`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: newStatus }),
        },
      );
      if (!res.ok) {
        onRollback(offer);
        onError('Failed to update status. Please try again.');
      }
    } catch {
      onRollback(offer);
      onError('Failed to update status. Please try again.');
    } finally {
      setStatusLoading(null);
    }
  }

  return (
    <div
      className="border-b border-gray-100 last:border-0"
      data-user-offer-id={offer.user_offer_id}
    >
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
            <span className="text-gray-600"> @&nbsp;{offer.offer_company}</span>
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
        {(offer.city || offer.work_model) && (
          <div
            style={{
              display: 'flex',
              gap: '4px',
              flexWrap: 'wrap',
              marginBottom: '2px',
            }}
          >
            {offer.city && (
              <span
                style={{
                  background: '#f3f4f6',
                  border: '0.5px solid #e5e7eb',
                  borderRadius: '3px',
                  padding: '1px 6px',
                  fontSize: '11px',
                  color: '#6b7280',
                }}
              >
                {offer.city}
              </span>
            )}
            {offer.work_model && (
              <span
                style={{
                  background: '#f3f4f6',
                  border: '0.5px solid #e5e7eb',
                  borderRadius: '3px',
                  padding: '1px 6px',
                  fontSize: '11px',
                  color: '#6b7280',
                }}
              >
                {offer.work_model}
              </span>
            )}
          </div>
        )}
        {offer.claude_role_fit && (
          <p className="text-xs text-gray-600 leading-relaxed">
            {offer.claude_role_fit}
          </p>
        )}
        {offer.claude_missing_skills &&
          offer.claude_missing_skills.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <span className="text-xs text-gray-500">Missing:</span>
              {offer.claude_missing_skills.map(skill => (
                <span
                  key={skill}
                  className="text-xs px-1.5 py-px rounded"
                  style={{
                    background: '#fef2f2',
                    border: '0.5px solid #fecaca',
                    borderRadius: '3px',
                    color: '#dc2626',
                  }}
                >
                  {skill}
                </span>
              ))}
            </div>
          )}
        {offer.salary && offer.salary.length > 0 ? (
          <div className="flex flex-col gap-0.5">
            {offer.salary.map((s, i) => {
              const deltaColor =
                s.delta >= 0 ? 'text-orange-500' : 'text-red-500';
              const deltaStr =
                s.delta >= 0 ? `+${formatNum(s.delta)}` : formatNum(s.delta);
              return (
                <span
                  key={i}
                  className="text-xs text-gray-500 flex items-center gap-0.5"
                >
                  <CurrencyCircleDollar size={13} className="shrink-0" />{' '}
                  {s.currency} {s.type} {formatNum(s.min)} – {formatNum(s.max)}{' '}
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
            statusLoading !== offer.user_offer_id && (
              <div className="flex gap-2 items-center">
                <select
                  value={cvLanguage}
                  onChange={e => setCvLanguage(e.target.value)}
                  className="shrink-0 px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="en">English</option>
                  <option value="pl">Polish</option>
                </select>
                <button
                  type="button"
                  onClick={handleGenerate}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-medium py-2 px-3 rounded-md text-sm transition-colors"
                >
                  Generate CV
                </button>
              </div>
            )
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

          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setIsDropdownOpen(v => !v)}
              className="w-full flex items-center justify-between gap-2 bg-green-600 hover:bg-green-500 text-white font-medium py-2 px-3 rounded-md text-sm transition-colors"
            >
              <span>Change status</span>
              <svg
                className={`w-4 h-4 text-white transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
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
            {isDropdownOpen && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg overflow-hidden">
                {STATUS_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleStatusChange(opt.value)}
                    className="w-full text-left text-sm px-4 py-2 hover:bg-gray-100 transition-colors text-gray-700"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

async function openOfferUrl(url: string) {
  const JOB_BOARD_DOMAINS = ['https://justjoin.it', 'https://nofluffjobs.com'];
  const tabs = await chrome.tabs.query({});

  const activeTab = tabs.find(tab => tab.active && tab.windowId !== undefined);
  if (
    activeTab?.url &&
    JOB_BOARD_DOMAINS.some(d => activeTab.url!.startsWith(d))
  ) {
    await chrome.tabs.update(activeTab.id!, { url });
    return;
  }

  const jobBoardTab = tabs.find(tab =>
    JOB_BOARD_DOMAINS.some(domain => tab.url?.startsWith(domain)),
  );
  if (jobBoardTab?.id !== undefined) {
    await chrome.tabs.update(jobBoardTab.id, { url, active: true });
    await chrome.windows.update(jobBoardTab.windowId!, { focused: true });
    return;
  }

  await chrome.tabs.create({ url });
}

function ClientAccordion({
  client,
  activeTabId,
  currentUrl,
  sortBy,
  statusFilter,
  sourceFilter,
  minScore,
}: ClientAccordionProps) {
  const { getToken } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [applyOffers, setApplyOffers] = useState<UserOffer[]>([]);
  const [levelUpOffers, setLevelUpOffers] = useState<UserOffer[]>([]);
  const [applyOpen, setApplyOpen] = useState(true);
  const [levelUpOpen, setLevelUpOpen] = useState(false);
  const [expandedOfferId, setExpandedOfferId] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  async function handleCardToggle(offerId: string, offerUrl?: string) {
    if (expandedOfferId === offerId) {
      setExpandedOfferId(null);
      return;
    }
    setExpandedOfferId(offerId);
    if (offerUrl && typeof chrome !== 'undefined') {
      await openOfferUrl(offerUrl);
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
    if (!currentUrl) return;
    const allOffers = [...applyOffers, ...levelUpOffers];
    const match = allOffers.find(
      o => o.offer_url && currentUrl.startsWith(o.offer_url.split('?')[0]),
    );
    if (match) {
      setExpandedOfferId(match.user_offer_id);
      setTimeout(() => {
        document
          .querySelector(`[data-user-offer-id="${match.user_offer_id}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    }
  }, [currentUrl, applyOffers, levelUpOffers]);

  useEffect(() => {
    if (!currentUrl || hasLoaded) return;
    const url = currentUrl;
    let cancelled = false;
    async function eagerLoad() {
      const [pending, levelUp] = await Promise.all([
        fetchOffers(statusFilter),
        statusFilter === 'pending_apply'
          ? fetchOffers('ai_rejected', true)
          : Promise.resolve([]),
      ]);
      if (cancelled) return;
      setApplyOffers(pending);
      setLevelUpOffers(levelUp);
      setHasLoaded(true);
      const allOffers = [...pending, ...levelUp];
      const match = allOffers.find(
        o => o.offer_url && url.startsWith(o.offer_url.split('?')[0]),
      );
      if (match) {
        setIsOpen(true);
        setExpandedOfferId(match.user_offer_id);
        setTimeout(() => {
          document
            .querySelector(`[data-user-offer-id="${match.user_offer_id}"]`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
    }
    eagerLoad();
    return () => {
      cancelled = true;
    };
  }, [currentUrl]);

  useEffect(() => {
    setHasLoaded(false);
    if (!isOpen) return;
    let cancelled = false;
    async function refetchOffers() {
      setIsLoading(true);
      const [pending, levelUp] = await Promise.all([
        fetchOffers(statusFilter),
        statusFilter === 'pending_apply'
          ? fetchOffers('ai_rejected', true)
          : Promise.resolve([]),
      ]);
      if (cancelled) return;
      setApplyOffers(pending);
      setLevelUpOffers(levelUp);
      setIsLoading(false);
      setHasLoaded(true);
    }
    refetchOffers();
    return () => {
      cancelled = true;
    };
  }, [statusFilter, sourceFilter]);

  async function fetchOffers(
    status: string,
    hasLearningGoals = false,
  ): Promise<UserOffer[]> {
    const token = await getToken();
    if (!token) return [];
    const params = new URLSearchParams({ client_id: client.id, status });
    if (hasLearningGoals) params.append('has_learning_goals', 'true');
    if (sourceFilter !== 'all') params.append('source', sourceFilter);
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
        fetchOffers(statusFilter),
        statusFilter === 'pending_apply'
          ? fetchOffers('ai_rejected', true)
          : Promise.resolve([]),
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
      fetchOffers(statusFilter),
      statusFilter === 'pending_apply'
        ? fetchOffers('ai_rejected', true)
        : Promise.resolve([]),
    ]);
    setApplyOffers(pending);
    setLevelUpOffers(levelUp);
    setIsLoading(false);
    setHasLoaded(true);
    setIsRefreshing(false);
  }

  const filteredApplyOffers = useMemo(
    () => applyOffers.filter(o => (o.claude_score ?? 0) >= minScore),
    [applyOffers, minScore],
  );
  const filteredLevelUpOffers = useMemo(
    () => levelUpOffers.filter(o => (o.claude_score ?? 0) >= minScore),
    [levelUpOffers, minScore],
  );

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
          {filteredApplyOffers.length > 0 && (
            <span
              className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                statusFilter === 'pending_apply'
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {filteredApplyOffers.length}
            </span>
          )}
          {statusFilter === 'pending_apply' &&
            filteredLevelUpOffers.length > 0 && (
              <span className="text-xs font-medium bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded">
                {filteredLevelUpOffers.length}
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
              <ArrowsClockwise size={14} />
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
          {statusError && (
            <div className="mx-3 mt-2 px-3 py-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md flex items-center justify-between gap-2">
              <span>{statusError}</span>
              <button
                type="button"
                onClick={() => setStatusError(null)}
                className="shrink-0 text-red-400 hover:text-red-600"
              >
                ✕
              </button>
            </div>
          )}
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
              {statusFilter === 'pending_apply' ? (
                <>
                  {/* Apply now sub-section */}
                  {filteredApplyOffers.length > 0 && (
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
                            {filteredApplyOffers.length}
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
                          {sortOffers(filteredApplyOffers, sortBy).map(
                            offer => (
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
                                onRollback={o =>
                                  setApplyOffers(prev => [...prev, o])
                                }
                                onError={setStatusError}
                              />
                            ),
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Level up sub-section */}
                  {filteredLevelUpOffers.length > 0 && (
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
                            {filteredLevelUpOffers.length}
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
                          {sortOffers(filteredLevelUpOffers, sortBy).map(
                            offer => (
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
                                onRollback={o =>
                                  setLevelUpOffers(prev => [...prev, o])
                                }
                                onError={setStatusError}
                              />
                            ),
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {filteredApplyOffers.length === 0 &&
                    filteredLevelUpOffers.length === 0 && (
                      <p className="px-3 py-3 text-gray-400">No offers found</p>
                    )}
                </>
              ) : (
                <>
                  {/* Single section for non-pending_apply statuses */}
                  {filteredApplyOffers.length > 0 ? (
                    <div>
                      <button
                        type="button"
                        onClick={() => setApplyOpen(v => !v)}
                        className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                            {STATUS_LABELS[statusFilter] ?? statusFilter}
                          </span>
                          <span className="text-xs font-medium bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                            {filteredApplyOffers.length}
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
                          {sortOffers(filteredApplyOffers, sortBy).map(
                            offer => (
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
                                onRollback={o =>
                                  setApplyOffers(prev => [...prev, o])
                                }
                                onError={setStatusError}
                              />
                            ),
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="px-3 py-3 text-gray-400">No offers found</p>
                  )}
                </>
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
  const [statusFilter, setStatusFilter] = useState('pending_apply');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [minScore, setMinScore] = useState(75);
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    chrome.storage.local.get('hd_sort_by', result => {
      if (chrome.runtime.lastError) return;
      if (result.hd_sort_by) setSortBy(result.hd_sort_by as string);
    });
  }, []);

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    chrome.storage.local.get('hd_status_filter', result => {
      if (chrome.runtime.lastError) return;
      if (result.hd_status_filter)
        setStatusFilter(result.hd_status_filter as string);
    });
  }, []);

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    chrome.storage.local.get('hd_source_filter', result => {
      if (chrome.runtime.lastError) return;
      if (result.hd_source_filter)
        setSourceFilter(result.hd_source_filter as string);
    });
  }, []);

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    chrome.storage.local.get('hd_min_score', result => {
      if (chrome.runtime.lastError) return;
      if (result.hd_min_score !== undefined)
        setMinScore(result.hd_min_score as number);
    });
  }, []);

  useEffect(() => {
    const el = document.getElementById('main-scroll');
    if (!el) return;
    function handleScroll() {
      setShowScrollTop(el!.scrollTop > 200);
    }
    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  function handleSortChange(value: string) {
    setSortBy(value);
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ hd_sort_by: value });
    }
  }

  function handleStatusFilterChange(value: string) {
    setStatusFilter(value);
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ hd_status_filter: value });
    }
  }

  function handleSourceFilterChange(value: string) {
    setSourceFilter(value);
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ hd_source_filter: value });
    }
  }

  function handleMinScoreChange(value: number) {
    setMinScore(value);
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ hd_min_score: value });
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
    <>
      <div className="px-4 py-5 flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 shrink-0">Min score:</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={minScore}
              onChange={e => handleMinScoreChange(Number(e.target.value))}
              className="flex-1"
            />
            <span className="text-xs font-medium text-gray-700 w-7 text-right">
              {minScore}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">Status:</span>
            <select
              value={statusFilter}
              onChange={e => handleStatusFilterChange(e.target.value)}
              className="text-xs border border-gray-300 rounded px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="pending_apply">Pending apply</option>
              <option value="applied">Applied</option>
              <option value="agent_withdrawn">Agent withdrawn</option>
              <option value="client_withdrawn">Client withdrawn</option>
              <option value="recruiter_rejected">Recruiter rejected</option>
              <option value="offer_received">Offer received</option>
              <option value="accepted">Accepted</option>
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">Source:</span>
            <select
              value={sourceFilter}
              onChange={e => handleSourceFilterChange(e.target.value)}
              className="text-xs border border-gray-300 rounded px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="all">All</option>
              <option value="justjoin">JustJoin</option>
              <option value="nofluffjobs">NoFluffJobs</option>
            </select>
          </div>
          <div className="flex items-center gap-1.5">
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
              statusFilter={statusFilter}
              sourceFilter={sourceFilter}
              minScore={minScore}
            />
          ))
        )}
      </div>
      {showScrollTop && (
        <button
          type="button"
          onClick={() =>
            document
              .getElementById('main-scroll')
              ?.scrollTo({ top: 0, behavior: 'smooth' })
          }
          className="fixed bottom-4 right-4 w-9 h-9 bg-white rounded-full shadow-lg flex items-center justify-center hover:shadow-xl transition-shadow z-50"
        >
          <ArrowUp size={18} className="text-gray-600" />
        </button>
      )}
    </>
  );
}
