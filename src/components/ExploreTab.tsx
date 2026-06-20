import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AddressBook,
  ArrowsClockwise,
  ArrowUp,
  CaretDown,
  CheckFatIcon,
  CurrencyCircleDollar,
  FilePlusIcon,
  PencilSimple,
  WarningIcon,
  X,
} from '@phosphor-icons/react';
import WizardShell from './onboarding/WizardShell';
import { emptyProfile } from './onboarding/emptyProfile';
import type { OfferSkill, Profile, WizardTabId } from './onboarding/types';
import { API_BASE_URL } from '../config';
import { useAuth } from '../hooks/useAuth';
import { useClients, type Client } from '../hooks/useClients';
import { useCvGenerate } from '../hooks/useCvGenerate';
import { useGeneralSettings } from '../store/generalSettingsStore';
import Spinner from './Spinner';
import PlanDrawer from './PlanDrawer';
import PlanLimitBanner from './PlanLimitBanner';

interface OfferSalary {
  min: number;
  max: number;
  currency: string;
  type: string;
  delta: number;
  unit?: string;
}

interface UserOffer {
  user_offer_id: string;
  offer_id?: string;
  offer_title: string;
  offer_company: string;
  offer_url?: string;
  claude_score?: number | null;
  claude_role_fit?: string;
  claude_missing_skills?: string[];
  claude_matched_reasons?: { pros: string[]; cons: string[] };
  required_skills?: string[];
  nice_to_have_skills?: string[];
  salary?: OfferSalary[];
  raw_salaries?: {
    from: number;
    to: number;
    currency: string;
    unit: string;
    type: string;
  }[];
  source?: string;
  cv_language?: string | null;
  cv_status?: string | null;
  cv_url?: string | null;
  cl_status?: string | null;
  cl_url?: string | null;
  status?: string;
  city?: string;
  work_model?: string;
  claude_recommended?: boolean | null;
}

function formatNum(n: number): string {
  const sign = n < 0 ? '-' : '';
  return (
    sign +
    Math.abs(Math.round(n))
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  );
}

function formatSalaryType(type: string): string {
  if (type === 'contract') return 'contr.';
  if (type === 'permanent') return 'perm.';
  return '';
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

function clientToProfile(raw: Record<string, unknown> | undefined): Profile {
  const profile = {
    ...emptyProfile,
    ...((raw as Partial<Profile>) ?? {}),
  } as Profile;
  // employment_type was removed from preferences; drop any value the backend
  // still returns so it is never echoed back in the save payload.
  if (profile.preferences) {
    delete (profile.preferences as unknown as Record<string, unknown>)
      .employment_type;
  }
  if (profile.preferences?.salary?.length) {
    profile.preferences = {
      ...profile.preferences,
      salary: profile.preferences.salary.map(s => ({
        ...s,
        unit: s.unit ?? 'month',
      })),
    };
  }
  return profile;
}

interface Props {
  onLogout: () => void;
  activeTabId?: number;
  currentUrl?: string;
  selfMode?: boolean;
  wizardPortalTarget?: HTMLDivElement | null;
}

interface ClientAccordionProps {
  client: Client;
  activeTabId?: number;
  currentUrl?: string;
  sortBy: string;
  statusFilter: string;
  sourceFilter: string;
  minScore: number;
  cvGenerated: boolean;
  clGenerated: boolean;
  onClientUpdate?: (id: string, firstName: string, lastName: string) => void;
  onSortByOverride?: (value: string) => void;
  defaultExpanded?: boolean;
  selfMode?: boolean;
  iconsPortalTarget?: HTMLDivElement | null;
  wizardPortalTarget?: HTMLDivElement | null;
}

interface OfferCardProps {
  offer: UserOffer;
  clientId: string;
  clientFirstName: string;
  clientLastName: string;
  candidateSkills: string[];
  isOpen: boolean;
  onToggle: () => void;
  onShowOffer?: () => void;
  activeTabId?: number;
  onRemove: (offerId: string) => void;
  onRollback: (offer: UserOffer) => void;
  onError: (message: string) => void;
  onCvUpdate: (offerId: string, cvUrl: string, cvStatus: string) => void;
  onClUpdate: (offerId: string, clUrl: string, clStatus: string) => void;
  onSalaryUpdate?: (userOfferId: string, salary: OfferSalary) => void;
  isOfferLoading: boolean;
  isPageOffer?: boolean;
  isCurrentPageOffer?: boolean;
  onScrollToPageOffer?: () => void;
  hideActions?: boolean;
  selfMode?: boolean;
  onCvLimitReached?: () => void;
  onClLimitReached?: () => void;
  onCvGenerated?: () => void;
  onClGenerated?: () => void;
  cvPackageBuyLoading?: boolean;
  cvPackageBuyError?: string | null;
  clPackageBuyLoading?: boolean;
  clPackageBuyError?: string | null;
  cvPackageAmount?: number;
  cvPackagePrice?: string;
  clPackageAmount?: number;
  clPackagePrice?: string;
  preferenceSalaries?: {
    type: string;
    min: number;
    currency: string;
    unit?: string;
  }[];
}

function OfferCard({
  offer,
  clientId,
  clientFirstName,
  clientLastName,
  candidateSkills,
  isOpen,
  onToggle,
  onShowOffer,
  activeTabId,
  onRemove,
  onRollback,
  onError,
  onCvUpdate,
  onClUpdate,
  onSalaryUpdate,
  isOfferLoading,
  isPageOffer = false,
  isCurrentPageOffer = false,
  onScrollToPageOffer,
  hideActions = false,
  selfMode = false,
  onCvLimitReached,
  onClLimitReached,
  onCvGenerated,
  onClGenerated,
  cvPackageBuyLoading = false,
  cvPackageBuyError,
  clPackageBuyLoading = false,
  clPackageBuyError,
  cvPackageAmount,
  cvPackagePrice,
  clPackageAmount,
  clPackagePrice,
  preferenceSalaries,
}: OfferCardProps) {
  const { getToken } = useAuth();
  const { generateCV } = useCvGenerate();
  const { settings: generalSettings } = useGeneralSettings();
  const unitOptions = ['month', 'day', 'hour', 'year'];
  const currencyOptions = generalSettings?.currencies ?? [];

  const browserLang = navigator.language.split('-')[0];
  const sortedLanguages = (() => {
    const langs = generalSettings?.languages ?? [];
    const browser = langs.find(l => l.code === browserLang);
    const english = langs.find(l => l.code === 'en');
    const rest = langs
      .filter(l => l.code !== browserLang && l.code !== 'en')
      .sort((a, b) => a.name.localeCompare(b.name));
    const top: typeof langs = [];
    if (browser) top.push(browser);
    if (english && english.code !== browserLang) top.push(english);
    return [...top, ...rest];
  })();

  const [editSalaryOpen, setEditSalaryOpen] = useState(false);
  const [salaryFrom, setSalaryFrom] = useState('');
  const [salaryTo, setSalaryTo] = useState('');
  const [salaryCurrency, setSalaryCurrency] = useState('');
  const [salaryUnit, setSalaryUnit] = useState('');
  const [salaryType, setSalaryType] = useState<'contract' | 'permanent'>(
    'contract',
  );
  const [salaryLoading, setSalaryLoading] = useState(false);
  const [salaryError, setSalaryError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isClGenerating, setIsClGenerating] = useState(false);
  const [cvLimitHit, setCvLimitHit] = useState(false);
  const [showAllRaw, setShowAllRaw] = useState(false);
  const effectiveShowAllRaw = showAllRaw && !isCurrentPageOffer;
  const [editingRoleFit, setEditingRoleFit] = useState(false);
  const [roleFitSaved, setRoleFitSaved] = useState(offer.claude_role_fit ?? '');
  const [roleFitValue, setRoleFitValue] = useState(offer.claude_role_fit ?? '');
  const [roleFitSaving, setRoleFitSaving] = useState(false);
  const [roleFitError, setRoleFitError] = useState<string | null>(null);
  const [clLimitHit, setClLimitHit] = useState(false);
  const [cvLimitBannerClosed, setCvLimitBannerClosed] = useState(false);
  const [clLimitBannerClosed, setClLimitBannerClosed] = useState(false);
  const [status, setStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isCvDropdownOpen, setIsCvDropdownOpen] = useState(false);
  const [isClDropdownOpen, setIsClDropdownOpen] = useState(false);
  const [statusLoading, setStatusLoading] = useState<string | null>(null);
  const [portalStyle, setPortalStyle] = useState<React.CSSProperties>({});
  const [cvPortalStyle, setCvPortalStyle] = useState<React.CSSProperties>({});
  const [clPortalStyle, setClPortalStyle] = useState<React.CSSProperties>({});
  const dropdownRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const cvDropdownRef = useRef<HTMLDivElement>(null);
  const cvPortalRef = useRef<HTMLDivElement>(null);
  const clDropdownRef = useRef<HTMLDivElement>(null);
  const clPortalRef = useRef<HTMLDivElement>(null);

  async function handleGenerate(language: string) {
    setCvLimitBannerClosed(false);
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
    setIsGenerating(true);
    setStatus(null);
    const result = await generateCV(
      clientId,
      offerText,
      language,
      clientFirstName,
      clientLastName,
      offer.offer_company,
      offer.offer_title,
      offer.user_offer_id,
    );
    setIsGenerating(false);
    if (!result.success) {
      if ('limitReached' in result) {
        setCvLimitHit(true);
      } else if (result.error) {
        setStatus({ type: 'error', message: result.error });
      }
    } else {
      onCvUpdate(offer.user_offer_id, result.cvUrl, result.cvStatus);
      onCvGenerated?.();
      chrome.tabs.create({ url: `${result.cvUrl}?r=${Date.now()}` });
    }
  }

  async function handleCvSelect(language: string) {
    setIsCvDropdownOpen(false);
    await handleGenerate(language);
  }

  async function handleGenerateCl(language: string) {
    setClLimitBannerClosed(false);
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
    setIsClGenerating(true);
    setStatus(null);
    try {
      const token = await getToken();
      if (!token) {
        setStatus({ type: 'error', message: 'Not authenticated.' });
        return;
      }
      const res = await fetch(`${API_BASE_URL}/v1/cl/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          client_id: clientId,
          offer_text: offerText,
          cl_language: language,
          job_title: offer.offer_title,
          company_name: offer.offer_company,
          user_offer_id: offer.user_offer_id,
        }),
      });
      if (res.status === 401) {
        setStatus({
          type: 'error',
          message: 'Session expired. Please log in again.',
        });
      } else if (res.status === 402) {
        setClLimitHit(true);
      } else if (!res.ok) {
        setStatus({
          type: 'error',
          message: `CL generation failed (${res.status}). Please try again.`,
        });
      } else {
        const data = (await res.json()) as {
          cl_url: string;
          cl_status: string;
        };
        onClUpdate(offer.user_offer_id, data.cl_url, data.cl_status);
        onClGenerated?.();
        chrome.tabs.create({ url: `${data.cl_url}?r=${Date.now()}` });
      }
    } catch {
      setStatus({
        type: 'error',
        message: 'Network error. Check your connection.',
      });
    } finally {
      setIsClGenerating(false);
    }
  }

  async function handleClSelect(language: string) {
    setIsClDropdownOpen(false);
    await handleGenerateCl(language);
  }

  useEffect(() => {
    if (!isDropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      const inTrigger = dropdownRef.current?.contains(e.target as Node);
      const inPortal = portalRef.current?.contains(e.target as Node);
      if (!inTrigger && !inPortal) setIsDropdownOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDropdownOpen]);

  useEffect(() => {
    if (!isCvDropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      const inTrigger = cvDropdownRef.current?.contains(e.target as Node);
      const inPortal = cvPortalRef.current?.contains(e.target as Node);
      if (!inTrigger && !inPortal) setIsCvDropdownOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isCvDropdownOpen]);

  useEffect(() => {
    if (!isClDropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      const inTrigger = clDropdownRef.current?.contains(e.target as Node);
      const inPortal = clPortalRef.current?.contains(e.target as Node);
      if (!inTrigger && !inPortal) setIsClDropdownOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isClDropdownOpen]);

  useEffect(() => {
    if (!isDropdownOpen && !isCvDropdownOpen && !isClDropdownOpen) return;
    const scrollEl =
      document.getElementById('main-scroll') ?? document.documentElement;
    let rafId: number;
    function reposition() {
      rafId = requestAnimationFrame(() => {
        if (isDropdownOpen && dropdownRef.current) {
          const r = dropdownRef.current.getBoundingClientRect();
          setPortalStyle(prev => ({
            ...prev,
            top: r.bottom + 4,
            left: r.left,
          }));
        }
        if (isCvDropdownOpen && cvDropdownRef.current) {
          const r = cvDropdownRef.current.getBoundingClientRect();
          setCvPortalStyle(prev => ({
            ...prev,
            top: r.bottom + 4,
            left: r.left,
          }));
        }
        if (isClDropdownOpen && clDropdownRef.current) {
          const r = clDropdownRef.current.getBoundingClientRect();
          setClPortalStyle(prev => ({
            ...prev,
            top: r.bottom + 4,
            left: r.left,
          }));
        }
      });
    }
    scrollEl.addEventListener('scroll', reposition, { passive: true });
    return () => {
      scrollEl.removeEventListener('scroll', reposition);
      cancelAnimationFrame(rafId);
    };
  }, [isDropdownOpen, isCvDropdownOpen, isClDropdownOpen]);

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

  async function handleSalarySubmit(e: React.FormEvent) {
    e.preventDefault();
    const from = Number(salaryFrom);
    const to = Number(salaryTo);
    if (from <= 0 || to <= 0) {
      setSalaryError('From and To must be greater than 0.');
      return;
    }
    if (!offer.offer_id) {
      setSalaryError('Cannot save: offer ID not found.');
      return;
    }
    setSalaryLoading(true);
    setSalaryError(null);
    try {
      const token = await getToken();
      const res = await fetch(
        `${API_BASE_URL}/v1/offers/${offer.offer_id}/employment-types/client`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token ?? ''}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            employment_types: [
              {
                from,
                to,
                currency: salaryCurrency,
                unit: salaryUnit,
                type: salaryType,
              },
            ],
          }),
        },
      );
      if (!res.ok) {
        setSalaryError('Failed to save salary. Please try again.');
        return;
      }
      const newSalary: OfferSalary = {
        min: from,
        max: to,
        currency: salaryCurrency,
        type: salaryType,
        delta: 0,
      };
      onSalaryUpdate?.(offer.user_offer_id, newSalary);
      setEditSalaryOpen(false);
    } catch {
      setSalaryError('Something went wrong. Please try again.');
    } finally {
      setSalaryLoading(false);
    }
  }

  return (
    <div
      className="rounded-md border border-gray-200 bg-white my-2 py-2.5"
      data-user-offer-id={offer.user_offer_id}
    >
      {/* Header row — click to toggle collapse */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-3 text-left flex items-center gap-2 group mb-1"
      >
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
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
        <CaretDown
          size={14}
          className={`text-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Always visible: tags + salary + skills */}
      <div className="px-3 flex flex-col gap-1">
        {(offer.city || offer.work_model || onShowOffer) && (
          <div className="flex items-center gap-1 flex-wrap">
            {offer.work_model && (
              <span
                className="bg-gray-100 text-gray-500"
                style={{
                  border: '0.5px solid #e5e7eb',
                  borderRadius: '3px',
                  padding: '1px 6px',
                  fontSize: '11px',
                }}
              >
                {offer.work_model}
              </span>
            )}
            {offer.city && (
              <span
                className="bg-gray-100 text-gray-500"
                style={{
                  border: '0.5px solid #e5e7eb',
                  borderRadius: '3px',
                  padding: '1px 6px',
                  fontSize: '11px',
                }}
              >
                {offer.city}
              </span>
            )}
            {onShowOffer && (
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  onShowOffer();
                }}
                className="ml-auto text-xs text-blue-600 hover:text-blue-700 transition-colors shrink-0"
              >
                Show offer
              </button>
            )}
          </div>
        )}
        {offer.salary && offer.salary.length > 0 ? (
          <div className="flex flex-col gap-0.5">
            {offer.salary.map((s, i) => {
              const deltaColor =
                s.delta >= 0 ? 'text-orange-500' : 'text-red-500';
              const deltaStr =
                s.delta >= 0 ? `+${formatNum(s.delta)}` : formatNum(s.delta);
              const matchingPref = preferenceSalaries?.find(
                p => p.type === s.type,
              );
              const salaryUnit = matchingPref?.unit ?? 'month';
              return (
                <span
                  key={i}
                  className="text-xs text-gray-500 flex items-center gap-0.5"
                >
                  <CurrencyCircleDollar
                    size={16}
                    weight="fill"
                    className="shrink-0"
                  />{' '}
                  {s.currency} {formatSalaryType(s.type)} {formatNum(s.min)} –{' '}
                  {formatNum(s.max)}{' '}
                  <span className={deltaColor}>{deltaStr}</span>
                  {' / '}
                  {salaryUnit}
                </span>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <span className="text-gray-500 text-xs flex items-center gap-0.5">
              <CurrencyCircleDollar size={16} className="shrink-0" /> Salary not
              disclosed
              {offer.source === 'manual' && (
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    setSalaryCurrency(currencyOptions[0] ?? '');
                    setSalaryUnit('month');
                    setEditSalaryOpen(v => !v);
                  }}
                  className="ml-1 text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label="Edit salary"
                >
                  <PencilSimple size={13} />
                </button>
              )}
            </span>
            {editSalaryOpen && (
              <form
                onSubmit={handleSalarySubmit}
                onClick={e => e.stopPropagation()}
                className="mt-1 p-2.5 rounded-md border border-gray-200 bg-gray-50 flex flex-col gap-2"
              >
                <span className="text-xs font-medium text-gray-700">
                  Edit offer salary
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-500">From</label>
                    <input
                      type="number"
                      min={0}
                      required
                      disabled={salaryLoading}
                      value={salaryFrom}
                      onChange={e => setSalaryFrom(e.target.value)}
                      className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-green-500 disabled:opacity-50"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-500">To</label>
                    <input
                      type="number"
                      min={0}
                      required
                      disabled={salaryLoading}
                      value={salaryTo}
                      onChange={e => setSalaryTo(e.target.value)}
                      className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-green-500 disabled:opacity-50"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-500">Currency</label>
                    <select
                      required
                      disabled={salaryLoading}
                      value={salaryCurrency}
                      onChange={e => setSalaryCurrency(e.target.value)}
                      className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-green-500 disabled:opacity-50"
                    >
                      {currencyOptions.map(c => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-500">Unit</label>
                    <select
                      required
                      disabled={salaryLoading}
                      value={salaryUnit}
                      onChange={e => setSalaryUnit(e.target.value)}
                      className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-green-500 disabled:opacity-50"
                    >
                      {unitOptions.map(u => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-500">Type</label>
                  <select
                    required
                    disabled={salaryLoading}
                    value={salaryType}
                    onChange={e =>
                      setSalaryType(e.target.value as 'contract' | 'permanent')
                    }
                    className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-green-500 disabled:opacity-50"
                  >
                    <option value="contract">Contract</option>
                    <option value="permanent">Permanent</option>
                  </select>
                </div>
                {salaryError && (
                  <p className="text-xs text-red-600">{salaryError}</p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditSalaryOpen(false)}
                    disabled={salaryLoading}
                    className="flex-1 py-1.5 text-xs font-medium border border-gray-300 rounded bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={salaryLoading}
                    className="flex-1 py-1.5 text-xs font-medium rounded bg-green-600 hover:bg-green-700 text-white flex items-center justify-center gap-1 disabled:opacity-50"
                  >
                    {salaryLoading && (
                      <Spinner size={11} className="text-white" />
                    )}
                    {salaryLoading ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
        {(() => {
          const rawSalaries = offer.raw_salaries ?? [];
          if (rawSalaries.length === 0) return null;

          const preferredType = preferenceSalaries?.some(
            p => p.type === 'contract',
          )
            ? 'contract'
            : preferenceSalaries?.some(p => p.type === 'permanent')
              ? 'permanent'
              : 'contract';

          const currencyOrder: Record<string, number> = {
            USD: 1,
            EUR: 2,
            GBP: 3,
            CHF: 4,
          };
          const sorted = [...rawSalaries].sort((a, b) => {
            const typeA = a.type === preferredType ? 0 : 1;
            const typeB = b.type === preferredType ? 0 : 1;
            if (typeA !== typeB) return typeA - typeB;
            return (
              (currencyOrder[a.currency] ?? 5) -
              (currencyOrder[b.currency] ?? 5)
            );
          });

          const renderRow = (s: (typeof sorted)[number], i: number) => (
            <span key={i} className="flex items-center gap-0.5">
              <CurrencyCircleDollar size={16} className="shrink-0" />
              {s.currency} {formatSalaryType(s.type)}{' '}
              {formatNum(Math.round(s.from))} – {formatNum(Math.round(s.to))}
              {' / '}
              {s.unit}
            </span>
          );

          if (isPageOffer) {
            const displayRawSalaries = sorted.filter(r => {
              if (!offer.salary?.[0]) return true;
              const s = offer.salary[0];
              const prefUnit =
                preferenceSalaries?.find(p => p.type === s.type)?.unit ??
                'month';
              return !(
                r.currency === s.currency &&
                r.type === s.type &&
                Math.round(r.from) === s.min &&
                Math.round(r.to) === s.max &&
                r.unit === prefUnit
              );
            });
            return (
              <div className="text-xs text-gray-400">
                {displayRawSalaries.map((s, i) => renderRow(s, i))}
              </div>
            );
          }

          const filteredRawSalaries = sorted.filter(r => {
            if (!offer.salary?.[0]) return true;
            const s = offer.salary[0];
            return !(
              Math.round(r.from) === s.min &&
              Math.round(r.to) === s.max &&
              r.currency === s.currency &&
              r.type === s.type &&
              r.unit === 'month'
            );
          });
          if (filteredRawSalaries.length === 0) return null;

          if (effectiveShowAllRaw) {
            return (
              <div className="text-xs text-gray-400">
                {filteredRawSalaries.map((s, i) => renderRow(s, i))}
              </div>
            );
          }

          const picked = filteredRawSalaries[0];
          const remaining = filteredRawSalaries.length - 1;
          return (
            <div className="text-xs text-gray-400">
              <span className="flex items-center gap-0.5">
                <CurrencyCircleDollar size={16} className="shrink-0" />
                {picked.currency} {formatSalaryType(picked.type)}{' '}
                {formatNum(Math.round(picked.from))} –{' '}
                {formatNum(Math.round(picked.to))}
                {' / '}
                {picked.unit}
                {remaining > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (isCurrentPageOffer) {
                        onScrollToPageOffer?.();
                      } else {
                        setShowAllRaw(true);
                      }
                    }}
                    className="text-gray-500 hover:text-gray-600 transition-colors"
                  >
                    show {remaining} more
                  </button>
                )}
              </span>
            </div>
          );
        })()}
        {offer.required_skills && offer.required_skills.length > 0 && (
          <div className="flex flex-wrap gap-1 items-center">
            <span className="text-xs text-gray-500">Required skills:</span>
            {[
              ...offer.required_skills.filter(s =>
                candidateSkills.includes(s.toLowerCase()),
              ),
              ...offer.required_skills.filter(
                s => !candidateSkills.includes(s.toLowerCase()),
              ),
            ].map(skill => {
              const has =
                candidateSkills.length === 0 ||
                candidateSkills.includes(skill.toLowerCase());
              return (
                <span
                  key={skill}
                  className="text-xs px-1.5 py-px"
                  style={{
                    backgroundColor: has ? '#f0fdf4' : '#fef2f2',
                    color: has ? '#15803d' : '#dc2626',
                    border: `0.5px solid ${has ? '#bbf7d0' : '#fecaca'}`,
                    borderRadius: '3px',
                  }}
                >
                  {skill}
                </span>
              );
            })}
          </div>
        )}
        {offer.nice_to_have_skills && offer.nice_to_have_skills.length > 0 && (
          <div className="flex flex-wrap gap-1 items-center">
            <span className="text-xs text-gray-500">Nice to have skills:</span>
            {[
              ...offer.nice_to_have_skills.filter(s =>
                candidateSkills.includes(s.toLowerCase()),
              ),
              ...offer.nice_to_have_skills.filter(
                s => !candidateSkills.includes(s.toLowerCase()),
              ),
            ].map(skill => {
              const has =
                candidateSkills.length === 0 ||
                candidateSkills.includes(skill.toLowerCase());
              return (
                <span
                  key={skill}
                  className="text-xs px-1.5 py-px"
                  style={{
                    backgroundColor: has ? '#f0fdf4' : '#fef2f2',
                    color: has ? '#15803d' : '#dc2626',
                    border: `0.5px solid ${has ? '#bbf7d0' : '#fecaca'}`,
                    borderRadius: '3px',
                  }}
                >
                  {skill}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Expanded: role fit + pros/cons + CV generation + Withdraw */}
      {isOpen && (
        <div className="px-3 flex flex-col gap-2">
          {(roleFitSaved || isPageOffer) && (
            <div>
              {editingRoleFit ? (
                <div className="flex flex-col gap-1.5">
                  <textarea
                    value={roleFitValue}
                    onChange={e => setRoleFitValue(e.target.value)}
                    className="w-full text-xs border border-gray-200 rounded p-2 resize-y focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    rows={3}
                  />
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setRoleFitValue(roleFitSaved);
                        setEditingRoleFit(false);
                      }}
                      className="flex-1 py-1 text-xs font-medium border border-gray-300 rounded bg-white text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={roleFitSaving}
                      onClick={async () => {
                        setRoleFitSaving(true);
                        setRoleFitError(null);
                        try {
                          const token = await getToken();
                          const res = await fetch(
                            `${API_BASE_URL}/v1/user-offers/${offer.user_offer_id}/role-fit`,
                            {
                              method: 'PATCH',
                              headers: {
                                'Content-Type': 'application/json',
                                ...(token
                                  ? { Authorization: `Bearer ${token}` }
                                  : {}),
                              },
                              body: JSON.stringify({
                                claude_role_fit: roleFitValue,
                              }),
                            },
                          );
                          if (!res.ok) throw new Error();
                          setRoleFitSaved(roleFitValue);
                          setRoleFitError(null);
                          setEditingRoleFit(false);
                        } catch {
                          setRoleFitError('Failed to save. Please try again.');
                        } finally {
                          setRoleFitSaving(false);
                        }
                      }}
                      className="flex-1 py-1 text-xs font-medium rounded bg-green-600 hover:bg-green-700 text-white flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      {roleFitSaving && (
                        <Spinner size={11} className="text-white" />
                      )}
                      {roleFitSaving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                  {roleFitError && (
                    <p className="text-xs text-red-500 mt-1">{roleFitError}</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-600 leading-relaxed">
                  {roleFitSaved}
                  {isPageOffer && (
                    <PencilSimple
                      size={13}
                      className="inline ml-1 cursor-pointer text-gray-400 hover:text-gray-600"
                      onClick={() => {
                        setRoleFitValue(roleFitSaved);
                        setEditingRoleFit(true);
                      }}
                      style={{
                        verticalAlign: 'text-top',
                      }}
                    />
                  )}
                </p>
              )}
            </div>
          )}
          {offer.claude_matched_reasons &&
            (offer.claude_matched_reasons.cons.length > 0 ||
              offer.claude_matched_reasons.pros.length > 0) && (
              <div className="flex flex-col gap-0.5">
                {offer.claude_matched_reasons.pros.map((item, i) => (
                  <span
                    key={i}
                    className="flex items-start gap-1 text-xs text-gray-700"
                  >
                    <CheckFatIcon
                      size={16}
                      weight="fill"
                      className="text-green-500 shrink-0 mt-px"
                    />
                    {item}
                  </span>
                ))}
                {offer.claude_matched_reasons.cons.map((item, i) => (
                  <span
                    key={i}
                    className="flex items-start gap-1 text-xs text-gray-700"
                  >
                    <WarningIcon
                      size={16}
                      weight="fill"
                      className="text-orange-500 shrink-0 mt-px"
                    />
                    {item}
                  </span>
                ))}
              </div>
            )}
          {isPageOffer &&
            !hideActions &&
            statusLoading !== offer.user_offer_id && (
              <div className="flex flex-col gap-1">
                <div className="flex gap-2">
                  {/* CV section */}
                  <div className="flex-1 flex gap-2 items-center">
                    <div ref={cvDropdownRef} className="flex-1">
                      {isGenerating ? (
                        <button
                          type="button"
                          disabled
                          className="w-full flex items-center justify-center gap-2 bg-blue-500 disabled:cursor-not-allowed text-white font-medium py-2 px-3 rounded-md text-sm"
                        >
                          <Spinner size={14} className="text-white" />
                          CV…
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isOfferLoading}
                          onClick={e => {
                            e.stopPropagation();
                            if (!isCvDropdownOpen && cvDropdownRef.current) {
                              const rect =
                                cvDropdownRef.current.getBoundingClientRect();
                              setCvPortalStyle({
                                position: 'fixed',
                                top: rect.bottom + 4,
                                left: rect.left,
                                zIndex: 9999,
                              });
                            }
                            setIsCvDropdownOpen(v => !v);
                          }}
                          className="w-full flex items-center justify-between gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-indigo-300 disabled:cursor-not-allowed text-white font-medium py-2 px-3 rounded-md text-sm transition-colors"
                        >
                          <span className="flex items-center gap-1.5">
                            {offer.cv_status === 'done' ? (
                              <ArrowsClockwise size={15} />
                            ) : (
                              <FilePlusIcon size={15} />
                            )}
                            CV
                          </span>
                          <CaretDown
                            size={16}
                            className={`text-white transition-transform ${isCvDropdownOpen ? 'rotate-180' : ''}`}
                          />
                        </button>
                      )}
                      {isCvDropdownOpen &&
                        createPortal(
                          <div
                            ref={cvPortalRef}
                            style={cvPortalStyle}
                            className="w-max max-w-[180px] max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-md shadow-lg"
                          >
                            {sortedLanguages.map(l => (
                              <button
                                key={l.code}
                                type="button"
                                onClick={e => {
                                  e.stopPropagation();
                                  handleCvSelect(l.code);
                                }}
                                className="w-full text-left text-sm px-4 py-2 hover:bg-gray-100 transition-colors text-gray-700"
                              >
                                {l.name}
                              </button>
                            ))}
                          </div>,
                          document.body,
                        )}
                    </div>
                    {!isGenerating &&
                      offer.cv_status === 'done' &&
                      offer.cv_url && (
                        <button
                          type="button"
                          onClick={() =>
                            chrome.tabs.create({
                              url: `${offer.cv_url}?r=${Date.now()}`,
                            })
                          }
                          className="shrink-0 flex items-center gap-1.5 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-medium py-2 px-3 rounded-md text-sm transition-colors"
                        >
                          CV
                        </button>
                      )}
                  </div>
                  {/* CL section */}
                  <div className="flex-1 flex gap-2 items-center">
                    <div ref={clDropdownRef} className="flex-1">
                      {isClGenerating ? (
                        <button
                          type="button"
                          disabled
                          className="w-full flex items-center justify-center gap-2 bg-blue-500 disabled:cursor-not-allowed text-white font-medium py-2 px-3 rounded-md text-sm"
                        >
                          <Spinner size={14} className="text-white" />
                          CL…
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isOfferLoading}
                          onClick={e => {
                            e.stopPropagation();
                            if (!isClDropdownOpen && clDropdownRef.current) {
                              const rect =
                                clDropdownRef.current.getBoundingClientRect();
                              setClPortalStyle({
                                position: 'fixed',
                                top: rect.bottom + 4,
                                left: rect.left,
                                zIndex: 9999,
                              });
                            }
                            setIsClDropdownOpen(v => !v);
                          }}
                          className="w-full flex items-center justify-between gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-indigo-300 disabled:cursor-not-allowed text-white font-medium py-2 px-3 rounded-md text-sm transition-colors"
                        >
                          <span className="flex items-center gap-1.5">
                            {offer.cl_status === 'done' ? (
                              <ArrowsClockwise size={15} />
                            ) : (
                              <FilePlusIcon size={15} />
                            )}
                            CL
                          </span>
                          <CaretDown
                            size={16}
                            className={`text-white transition-transform ${isClDropdownOpen ? 'rotate-180' : ''}`}
                          />
                        </button>
                      )}
                      {isClDropdownOpen &&
                        createPortal(
                          <div
                            ref={clPortalRef}
                            style={clPortalStyle}
                            className="w-max max-w-[180px] max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-md shadow-lg"
                          >
                            {sortedLanguages.map(l => (
                              <button
                                key={l.code}
                                type="button"
                                onClick={e => {
                                  e.stopPropagation();
                                  handleClSelect(l.code);
                                }}
                                className="w-full text-left text-sm px-4 py-2 hover:bg-gray-100 transition-colors text-gray-700"
                              >
                                {l.name}
                              </button>
                            ))}
                          </div>,
                          document.body,
                        )}
                    </div>
                    {!isClGenerating &&
                      offer.cl_status === 'done' &&
                      offer.cl_url && (
                        <button
                          type="button"
                          onClick={() =>
                            chrome.tabs.create({
                              url: `${offer.cl_url}?r=${Date.now()}`,
                            })
                          }
                          className="shrink-0 flex items-center gap-1.5 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-medium py-2 px-3 rounded-md text-sm transition-colors"
                        >
                          CL
                        </button>
                      )}
                  </div>
                </div>
                {cvLimitHit && !cvLimitBannerClosed && (
                  <PlanLimitBanner
                    onButtonClick={() => {
                      setCvLimitHit(false);
                      setCvLimitBannerClosed(false);
                      onCvLimitReached?.();
                    }}
                    buttonText={`Buy ${cvPackageAmount ?? generalSettings?.cv_package_amount ?? '...'} CVs${cvPackagePrice ? ` for ${cvPackagePrice}` : ''}`}
                    isLoading={cvPackageBuyLoading}
                    errorMessage={cvPackageBuyError}
                    withMX={false}
                    closable
                    onClose={() => setCvLimitBannerClosed(true)}
                  >
                    <p className="text-xs text-gray-500">
                      You've reached your CV generation limit.
                    </p>
                  </PlanLimitBanner>
                )}
                {clLimitHit && !clLimitBannerClosed && (
                  <PlanLimitBanner
                    onButtonClick={() => {
                      setClLimitHit(false);
                      setClLimitBannerClosed(false);
                      onClLimitReached?.();
                    }}
                    buttonText={`Buy ${clPackageAmount ?? generalSettings?.cl_package_amount ?? '...'} CLs${clPackagePrice ? ` for ${clPackagePrice}` : ''}`}
                    isLoading={clPackageBuyLoading}
                    errorMessage={clPackageBuyError}
                    withMX={false}
                    closable
                    onClose={() => setClLimitBannerClosed(true)}
                  >
                    <p className="text-xs text-gray-500">
                      You've reached your cover letter generation limit.
                    </p>
                  </PlanLimitBanner>
                )}
              </div>
            )}

          {isPageOffer && status && (
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

          {isPageOffer && !hideActions && !isGenerating && !isClGenerating && (
            <div ref={dropdownRef}>
              <button
                type="button"
                onClick={() => {
                  if (!isDropdownOpen && dropdownRef.current) {
                    const rect = dropdownRef.current.getBoundingClientRect();
                    setPortalStyle({
                      position: 'fixed',
                      top: rect.bottom + 4,
                      left: rect.left,
                      width: rect.width,
                      zIndex: 9999,
                    });
                  }
                  setIsDropdownOpen(v => !v);
                }}
                className="w-full flex items-center justify-between gap-2 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-medium py-2 px-3 rounded-md text-sm transition-colors"
              >
                <span>Set status</span>
                <span className="flex items-center gap-1">
                  {offer.status && (
                    <span className="text-xs opacity-70">
                      curr.{' '}
                      {(
                        STATUS_LABELS[offer.status] ?? offer.status
                      ).toLowerCase()}
                    </span>
                  )}
                  <CaretDown
                    size={12}
                    className={`transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
                  />
                </span>
              </button>
              {isDropdownOpen &&
                createPortal(
                  <div
                    ref={portalRef}
                    style={portalStyle}
                    className="bg-white border border-gray-200 rounded-md shadow-lg overflow-hidden"
                  >
                    {STATUS_OPTIONS.filter(
                      opt => !selfMode || opt.value !== 'agent_withdrawn',
                    ).map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleStatusChange(opt.value)}
                        className="w-full text-left text-sm px-4 py-2 hover:bg-gray-100 transition-colors text-gray-700"
                      >
                        {selfMode && opt.value === 'client_withdrawn'
                          ? 'Withdrawn'
                          : opt.label}
                      </button>
                    ))}
                  </div>,
                  document.body,
                )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

async function openOfferUrl(url: string) {
  const JOB_BOARD_DOMAINS = ['https://justjoin.it', 'https://nofluffjobs.com'];
  const tabs = await chrome.tabs.query({});

  const offerTab = tabs.find(
    tab => tab.url && url.startsWith(tab.url.split('?')[0]),
  );
  if (offerTab?.id !== undefined) {
    await chrome.tabs.update(offerTab.id, { url, active: true });
    await chrome.windows.update(offerTab.windowId!, { focused: true });
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
  cvGenerated,
  clGenerated,
  onClientUpdate,
  onSortByOverride,
  defaultExpanded = false,
  selfMode = false,
  iconsPortalTarget,
  wizardPortalTarget,
}: ClientAccordionProps) {
  const { getToken } = useAuth();
  const { settings: generalSettings } = useGeneralSettings();
  const pageSize = generalSettings?.listing_page_size ?? 10;

  const [isOpen, setIsOpen] = useState(defaultExpanded);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileVisible, setProfileVisible] = useState(false);
  const [wizardProfile, setWizardProfile] = useState<Profile | null>(null);
  const [wizardProfileLoading, setWizardProfileLoading] = useState(false);
  const [profileReady, setProfileReady] = useState(
    client.profile_ready ?? true,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [applyOffers, setApplyOffers] = useState<UserOffer[]>([]);
  const [levelUpOffers, setLevelUpOffers] = useState<UserOffer[]>([]);
  const [applyNowCount, setApplyNowCount] = useState<number | null>(null);
  const [levelUpCount, setLevelUpCount] = useState<number | null>(null);
  const applyNowCountRef = useRef(0);
  const levelUpCountRef = useRef(0);
  const [applyOpen, setApplyOpen] = useState(true);
  const [levelUpOpen, setLevelUpOpen] = useState(false);
  const [pageOfferOpen, setPageOfferOpen] = useState(true);
  const [expandedOfferId, setExpandedOfferId] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [upgradeDrawerOpen, setUpgradeDrawerOpen] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [profileRematchPending, setProfileRematchPending] = useState(false);
  const [autoTriggerReview, setAutoTriggerReview] = useState(false);
  const [byUrlLoading, setByUrlLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanLimitReached, setScanLimitReached] = useState(false);
  const [scanPackageLoading, setScanPackageLoading] = useState(false);
  const [scanPackageError, setScanPackageError] = useState<string | null>(null);
  const [showSalaryDeltaBanner, setShowSalaryDeltaBanner] = useState(false);
  const [cvPackageBuyLoading, setCvPackageBuyLoading] = useState(false);
  const [cvPackageBuyError, setCvPackageBuyError] = useState<string | null>(
    null,
  );
  const [clPackageBuyLoading, setClPackageBuyLoading] = useState(false);
  const [clPackageBuyError, setClPackageBuyError] = useState<string | null>(
    null,
  );
  const [pageOffer, setPageOffer] = useState<UserOffer | null>(null);
  const [applyPage, setApplyPage] = useState(1);
  const [levelUpPage, setLevelUpPage] = useState(1);
  const [statusPage, setStatusPage] = useState(1);
  const [applyHasMore, setApplyHasMore] = useState(false);
  const [levelUpHasMore, setLevelUpHasMore] = useState(false);
  const [statusHasMore, setStatusHasMore] = useState(false);
  const [applyLoadingMore, setApplyLoadingMore] = useState(false);
  const [levelUpLoadingMore, setLevelUpLoadingMore] = useState(false);
  const [statusLoadingMore, setStatusLoadingMore] = useState(false);
  const manualPageOfferRef = useRef(false);
  const manualPageOfferUrlRef = useRef<string | null>(null);
  const pageOfferIdRef = useRef<string | null>(null);
  pageOfferIdRef.current = pageOffer?.user_offer_id ?? null;
  const pageOfferSectionRef = useRef<HTMLButtonElement>(null);
  const pageOfferCardRef = useRef<HTMLDivElement>(null);
  const scanCheckoutTabIdRef = useRef<number | undefined>(undefined);
  const scanTabRemovedListenerRef = useRef<((tabId: number) => void) | null>(
    null,
  );
  const [hasNewSkills, setHasNewSkills] = useState(false);
  const [offerSkills, setOfferSkills] = useState<OfferSkill[]>([]);
  const [wizardInitialTab, setWizardInitialTab] =
    useState<WizardTabId>('basic_info');
  const knownNewSkillsCountRef = useRef<number | null>(null);

  useEffect(() => {
    async function checkSubscription() {
      const token = await getToken();
      if (!token) return;
      try {
        const res = await fetch(`${API_BASE_URL}/v1/subscription/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          subscribed_to: string | null;
          expires_at?: string | null;
          profile_relevant_change_pending?: boolean;
          new_skills_count?: number;
        };
        const active =
          data.subscribed_to !== null &&
          (!data.expires_at ||
            new Date(data.expires_at).getTime() > Date.now());
        setIsPro(active);
        setProfileRematchPending(data.profile_relevant_change_pending ?? false);
        if (data.new_skills_count !== undefined) {
          knownNewSkillsCountRef.current = data.new_skills_count;
        }
      } catch {
        // ignore
      }
    }

    void checkSubscription();

    function handleStorageChange(
      changes: Record<string, chrome.storage.StorageChange>,
    ) {
      if (
        'review_package_purchased' in changes &&
        changes.review_package_purchased.newValue !== undefined
      ) {
        setAutoTriggerReview(true);
      }
      if (
        'upgrade_success' in changes &&
        changes.upgrade_success.newValue !== undefined
      ) {
        void checkSubscription();
      }
      if (
        'upgrade_cancelled' in changes &&
        changes.upgrade_cancelled.newValue !== undefined
      ) {
        setUpgradeDrawerOpen(false);
        setScanPackageLoading(false);
      }
      if (
        'scan_package_purchased' in changes &&
        changes.scan_package_purchased.newValue !== undefined
      ) {
        setScanLimitReached(false);
        setScanPackageLoading(false);
        void handleScanPage();
      }
      if (
        'cv_package_purchased' in changes &&
        changes.cv_package_purchased.newValue !== undefined
      ) {
        void checkSubscription();
      }
      if (
        'cl_package_purchased' in changes &&
        changes.cl_package_purchased.newValue !== undefined
      ) {
        void checkSubscription();
      }
      if (
        'offers_cleared' in changes &&
        changes.offers_cleared.newValue !== undefined
      ) {
        setApplyOffers([]);
        setLevelUpOffers([]);
        setApplyNowCount(null);
        applyNowCountRef.current = 0;
        setLevelUpCount(null);
        levelUpCountRef.current = 0;
        setApplyPage(1);
        setLevelUpPage(1);
      }
      if (
        'profile_rematch_purchased' in changes &&
        changes.profile_rematch_purchased.newValue !== undefined
      ) {
        setProfileRematchPending(false);
        setProfileVisible(false);
        setTimeout(() => setProfileOpen(false), 200);
        void (async () => {
          try {
            const token = await getToken();
            const res = await fetch(`${API_BASE_URL}/v1/profile`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({
                profile_ready: true,
                client_id: client.id,
              }),
            });
            if (!res.ok) return;
            const patchData = (await res.json()) as {
              matching_relevant_change?: boolean;
            };
            if (patchData.matching_relevant_change === true) {
              await fetch(`${API_BASE_URL}/v1/profile/trigger-sync`, {
                method: 'POST',
                headers: token ? { Authorization: `Bearer ${token}` } : {},
              });
            }
            setApplyOffers([]);
            setLevelUpOffers([]);
            setApplyNowCount(null);
            applyNowCountRef.current = 0;
            setLevelUpCount(null);
            levelUpCountRef.current = 0;
            setApplyPage(1);
            setLevelUpPage(1);
          } catch {
            // ignore
          }
        })();
      }
    }

    if (typeof chrome !== 'undefined' && chrome.storage?.local?.onChanged) {
      chrome.storage.local.onChanged.addListener(handleStorageChange);
    }
    return () => {
      if (typeof chrome !== 'undefined' && chrome.storage?.local?.onChanged) {
        chrome.storage.local.onChanged.removeListener(handleStorageChange);
      }
    };
  }, []);

  const candidateSkills = useMemo(() => {
    const raw = (client.profile?.skills ?? {}) as Record<
      string,
      { name: string }[]
    >;
    return Object.values(raw)
      .flat()
      .map(s => s.name.toLowerCase());
  }, [client.profile]);

  const preferenceSalaries =
    (
      client.profile as
        | {
            preferences?: {
              salary?: {
                type: string;
                min: number;
                currency: string;
                unit?: string;
              }[];
            };
          }
        | undefined
    )?.preferences?.salary ?? [];

  async function handleCardToggle(offer: UserOffer, offerUrl?: string) {
    const offerId = offer.user_offer_id;
    if (expandedOfferId === offerId) {
      setExpandedOfferId(null);
      return;
    }
    manualPageOfferRef.current = true;
    manualPageOfferUrlRef.current = offerUrl ?? null;
    setPageOffer(offer);
    setExpandedOfferId(null);
    setPageOfferOpen(true);
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
    if (manualPageOfferRef.current) return;
    const allOffers = [...applyOffers, ...levelUpOffers];
    const match = allOffers.find(
      o => o.offer_url && currentUrl.startsWith(o.offer_url.split('?')[0]),
    );
    if (match && match.user_offer_id !== pageOfferIdRef.current) {
      setExpandedOfferId(match.user_offer_id);
    }
  }, [currentUrl, applyOffers, levelUpOffers]);

  useEffect(() => {
    if (!currentUrl || hasLoaded) return;
    const url = currentUrl;
    let cancelled = false;
    async function eagerLoad() {
      let pending: UserOffer[] = [];
      let levelUp: UserOffer[] = [];
      if (statusFilter === 'pending_apply') {
        const result = await fetchCombinedOffers(1);
        pending = result.apply_now.offers ?? [];
        levelUp = result.level_up.offers ?? [];
        setApplyNowCount(result.apply_now.count);
        applyNowCountRef.current = result.apply_now.count;
        setLevelUpCount(result.level_up.count);
        levelUpCountRef.current = result.level_up.count;
        setApplyHasMore(result.apply_now.has_more ?? false);
        setLevelUpHasMore(result.level_up.has_more ?? false);
      } else {
        const fetched = await fetchOffers(statusFilter, 1);
        pending = fetched.offers;
        setStatusHasMore(fetched.has_more);
      }
      if (cancelled) return;
      setApplyOffers(pending);
      setLevelUpOffers(levelUp);
      setHasLoaded(true);
      const allOffers = [...pending, ...levelUp];
      const match = url
        ? allOffers.find(
            o => o.offer_url && url.startsWith(o.offer_url.split('?')[0]),
          )
        : undefined;
      if (match) {
        setIsOpen(true);
        if (match.user_offer_id !== pageOfferIdRef.current) {
          setExpandedOfferId(match.user_offer_id);
        }
      }
    }
    eagerLoad();
    return () => {
      cancelled = true;
    };
  }, [currentUrl, client.id]);

  useEffect(() => {
    // If currentUrl is the URL of the manually clicked offer, keep it — skip fetch
    if (
      manualPageOfferRef.current &&
      manualPageOfferUrlRef.current &&
      currentUrl?.startsWith(manualPageOfferUrlRef.current.split('?')[0])
    ) {
      return;
    }
    manualPageOfferRef.current = false;
    manualPageOfferUrlRef.current = null;
    if (
      !currentUrl ||
      currentUrl.startsWith('chrome://') ||
      currentUrl.startsWith('chrome-extension://')
    ) {
      setPageOffer(null);
      return;
    }
    setPageOffer(null);
    let cancelled = false;
    async function fetchPageOffer() {
      const token = await getToken();
      if (!token || cancelled) return;
      const params = new URLSearchParams({ url: currentUrl! });
      if (!selfMode) params.append('client_id', client.id);
      setByUrlLoading(true);
      try {
        const res = await fetch(
          `${API_BASE_URL}/v1/user-offers/by-url?${params}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { user_offer: UserOffer | null };
        if (!cancelled) setPageOffer(data.user_offer ?? null);
      } catch {
        // silently ignore
      } finally {
        if (!cancelled) setByUrlLoading(false);
      }
    }
    fetchPageOffer();
    return () => {
      cancelled = true;
      setByUrlLoading(false);
    };
  }, [currentUrl]);

  useEffect(() => {
    setPageOfferOpen(true);
  }, [pageOffer]);

  useEffect(() => {
    if (!pageOffer) return;
    if (expandedOfferId === pageOffer.user_offer_id) {
      setExpandedOfferId(null);
    }
    setTimeout(() => {
      const el = pageOfferCardRef.current;
      if (!el) return;
      const scrollContainer = document.getElementById('main-scroll');
      if (!scrollContainer) return;
      const elTop = el.getBoundingClientRect().top;
      const containerTop = scrollContainer.getBoundingClientRect().top;
      const offset = elTop - containerTop - 40;
      scrollContainer.scrollBy({ top: offset, behavior: 'smooth' });
    }, 200);
  }, [pageOffer]);

  useEffect(() => {
    setHasLoaded(false);
    setExpandedOfferId(null);
    setApplyPage(1);
    setLevelUpPage(1);
    setStatusPage(1);
    setApplyHasMore(false);
    setLevelUpHasMore(false);
    setStatusHasMore(false);
    setApplyOffers([]);
    setLevelUpOffers([]);
    if (sortBy === 'salary_delta' && !isPro) return;
    let cancelled = false;
    async function refetchOffers() {
      if (isOpen) setIsLoading(true);
      if (statusFilter === 'pending_apply') {
        const result = await fetchCombinedOffers(1);
        if (cancelled) return;
        setApplyOffers(result.apply_now.offers ?? []);
        setApplyHasMore(result.apply_now.has_more ?? false);
        setLevelUpOffers(result.level_up.offers ?? []);
        setLevelUpHasMore(result.level_up.has_more ?? false);
        setApplyNowCount(result.apply_now.count);
        applyNowCountRef.current = result.apply_now.count;
        setLevelUpCount(result.level_up.count);
        levelUpCountRef.current = result.level_up.count;
      } else {
        const fetched = await fetchOffers(statusFilter, 1);
        if (cancelled) return;
        setApplyOffers(fetched.offers);
        setStatusHasMore(fetched.has_more);
        setLevelUpOffers([]);
      }
      if (cancelled) return;
      if (isOpen) setIsLoading(false);
      setHasLoaded(true);
    }
    refetchOffers();
    return () => {
      cancelled = true;
    };
  }, [statusFilter, sourceFilter, minScore, sortBy, cvGenerated, clGenerated]);

  interface CombinedBucket {
    offers: UserOffer[];
    count: number;
    has_more?: boolean;
  }
  interface CombinedOffersResponse {
    apply_now: CombinedBucket;
    level_up: CombinedBucket;
    count: number;
    new_skills_count?: number;
  }
  const EMPTY_COMBINED: CombinedOffersResponse = {
    apply_now: { offers: [], count: 0 },
    level_up: { offers: [], count: 0 },
    count: 0,
  };

  async function fetchCombinedOffers(
    page = 1,
    knownApplyCount?: number,
    knownLevelUpCount?: number,
    knownNewSkillsCount?: number,
  ): Promise<CombinedOffersResponse> {
    const token = await getToken();
    if (!token) return EMPTY_COMBINED;
    const params = new URLSearchParams({ status: 'pending_apply|ai_rejected' });
    if (!selfMode) params.append('client_id', client.id);
    if (sourceFilter !== 'all') params.append('source', sourceFilter);
    params.append('min_score', String(minScore));
    if (cvGenerated) params.append('generated_cv', 'true');
    if (clGenerated) params.append('generated_cl', 'true');
    if (!(sortBy === 'salary_delta' && !isPro))
      params.append('sort_by', sortBy);
    params.append('page', String(page));
    if (knownApplyCount !== undefined)
      params.append('known_apply_count', String(knownApplyCount));
    if (knownLevelUpCount !== undefined)
      params.append('known_level_up_count', String(knownLevelUpCount));
    if (knownNewSkillsCount !== undefined)
      params.append('known_new_skills_count', String(knownNewSkillsCount));
    params.append('page_size', String(pageSize));
    try {
      const res = await fetch(`${API_BASE_URL}/v1/user-offers?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return EMPTY_COMBINED;
      const raw = (await res.json()) as Partial<CombinedOffersResponse>;
      return {
        apply_now: raw.apply_now ?? EMPTY_COMBINED.apply_now,
        level_up: raw.level_up ?? EMPTY_COMBINED.level_up,
        count: raw.count ?? 0,
        new_skills_count: raw.new_skills_count,
      };
    } catch {
      return EMPTY_COMBINED;
    }
  }

  async function fetchOffers(
    status: string,
    page = 1,
  ): Promise<{ offers: UserOffer[]; has_more: boolean }> {
    const token = await getToken();
    if (!token) return { offers: [], has_more: false };
    const params = new URLSearchParams({ status });
    if (!selfMode) params.append('client_id', client.id);
    if (sourceFilter !== 'all') params.append('source', sourceFilter);
    params.append('min_score', String(minScore));
    if (cvGenerated) params.append('generated_cv', 'true');
    if (clGenerated) params.append('generated_cl', 'true');
    if (!(sortBy === 'salary_delta' && !isPro))
      params.append('sort_by', sortBy);
    params.append('page', String(page));
    params.append('page_size', String(pageSize));
    try {
      const res = await fetch(`${API_BASE_URL}/v1/user-offers?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { offers: [], has_more: false };
      const data = (await res.json()) as
        | { offers?: UserOffer[]; has_more?: boolean }
        | UserOffer[];
      const offers = Array.isArray(data) ? data : (data.offers ?? []);
      const has_more = Array.isArray(data) ? false : (data.has_more ?? false);
      return { offers, has_more };
    } catch {
      return { offers: [], has_more: false };
    }
  }

  async function handleToggle() {
    const opening = !isOpen;
    setIsOpen(opening);
    if (opening && !hasLoaded) {
      setIsLoading(true);
      if (statusFilter === 'pending_apply') {
        const result = await fetchCombinedOffers(1);
        setApplyOffers(result.apply_now.offers ?? []);
        setApplyHasMore(result.apply_now.has_more ?? false);
        setLevelUpOffers(result.level_up.offers ?? []);
        setLevelUpHasMore(result.level_up.has_more ?? false);
        setApplyNowCount(result.apply_now.count);
        applyNowCountRef.current = result.apply_now.count;
        setLevelUpCount(result.level_up.count);
        levelUpCountRef.current = result.level_up.count;
      } else {
        const fetched = await fetchOffers(statusFilter, 1);
        setApplyOffers(fetched.offers);
        setStatusHasMore(fetched.has_more);
        setLevelUpOffers([]);
      }
      setIsLoading(false);
      setHasLoaded(true);
    }
  }

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasNewOffers, setHasNewOffers] = useState(false);

  const hasOffersRef = useRef(false);
  useEffect(() => {
    hasOffersRef.current = applyOffers.length > 0 || levelUpOffers.length > 0;
  }, [applyOffers, levelUpOffers]);

  async function handleRefresh() {
    setIsRefreshing(true);
    setIsLoading(true);
    setHasNewOffers(false);
    setExpandedOfferId(null);
    setApplyPage(1);
    setLevelUpPage(1);
    setStatusPage(1);
    if (statusFilter === 'pending_apply') {
      const result = await fetchCombinedOffers(1);
      setApplyOffers(result.apply_now.offers ?? []);
      setApplyHasMore(result.apply_now.has_more ?? false);
      setLevelUpOffers(result.level_up.offers ?? []);
      setLevelUpHasMore(result.level_up.has_more ?? false);
      setApplyNowCount(result.apply_now.count);
      applyNowCountRef.current = result.apply_now.count;
      setLevelUpCount(result.level_up.count);
      levelUpCountRef.current = result.level_up.count;
    } else {
      const fetched = await fetchOffers(statusFilter, 1);
      setApplyOffers(fetched.offers);
      setStatusHasMore(fetched.has_more);
      setLevelUpOffers([]);
    }
    setIsLoading(false);
    setHasLoaded(true);
    setIsRefreshing(false);
  }

  const handleRefreshRef = useRef(handleRefresh);
  handleRefreshRef.current = handleRefresh;

  function handleScrollToPageOffer() {
    if (!pageOfferCardRef.current) return;
    pageOfferCardRef.current.scrollIntoView({
      behavior: 'instant',
      block: 'start',
    });
    const scrollContainer =
      pageOfferCardRef.current.closest('.overflow-y-auto') ??
      pageOfferCardRef.current.closest('[style*="overflow"]');
    if (scrollContainer) {
      scrollContainer.scrollBy({ top: -40, behavior: 'smooth' });
    } else {
      window.scrollBy({ top: -40, behavior: 'smooth' });
    }
  }

  async function handleLoadMoreApply() {
    setApplyLoadingMore(true);
    const nextPage = applyPage + 1;
    const result = await fetchCombinedOffers(nextPage);
    setApplyOffers(prev => [...prev, ...(result.apply_now.offers ?? [])]);
    setApplyHasMore(result.apply_now.has_more ?? false);
    setApplyPage(nextPage);
    setApplyLoadingMore(false);
  }

  async function handleLoadMoreLevelUp() {
    setLevelUpLoadingMore(true);
    const nextPage = levelUpPage + 1;
    const result = await fetchCombinedOffers(nextPage);
    setLevelUpOffers(prev => [...prev, ...(result.level_up.offers ?? [])]);
    setLevelUpHasMore(result.level_up.has_more ?? false);
    setLevelUpPage(nextPage);
    setLevelUpLoadingMore(false);
  }

  async function handleLoadMoreStatus() {
    setStatusLoadingMore(true);
    const nextPage = statusPage + 1;
    const fetched = await fetchOffers(statusFilter, nextPage);
    setApplyOffers(prev => [...prev, ...fetched.offers]);
    setStatusHasMore(fetched.has_more);
    setStatusPage(nextPage);
    setStatusLoadingMore(false);
  }

  function closeWizard() {
    setProfileVisible(false);
    setTimeout(() => setProfileOpen(false), 200);
    if (selfMode && typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.remove('wizard_was_open');
    }
  }

  async function dismissOfferSkill(skillName: string) {
    const removed = offerSkills.find(s => s.name === skillName);
    setOfferSkills(prev => prev.filter(s => s.name !== skillName));
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/v1/profile/dismiss-skill`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name: skillName }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
    } catch {
      if (removed) setOfferSkills(prev => [...prev, removed]);
      throw new Error('Failed to dismiss');
    }
  }

  async function openWizard(tab: WizardTabId = 'basic_info') {
    setWizardInitialTab(tab);
    if (tab === 'skills') setHasNewSkills(false);
    setWizardProfileLoading(true);
    setProfileOpen(true);
    requestAnimationFrame(() => setProfileVisible(true));
    if (selfMode && typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ wizard_was_open: true });
    }
    try {
      const token = await getToken();
      const params = new URLSearchParams({ client_id: client.id });
      const res = await fetch(`${API_BASE_URL}/v1/profile?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = res.ok
        ? ((await res.json()) as {
            profile: Record<string, unknown> | null;
            offer_skills?: OfferSkill[];
          })
        : null;
      const fetched = json?.profile ?? null;
      if (json?.offer_skills) setOfferSkills(json.offer_skills);
      setWizardProfile(clientToProfile(fetched ?? client.profile));
      await fetch(`${API_BASE_URL}/v1/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ profile_ready: false, client_id: client.id }),
      });
      setProfileReady(false);
    } catch {
      setWizardProfile(clientToProfile(client.profile));
    } finally {
      setWizardProfileLoading(false);
    }
  }

  // Re-open the wizard in edit mode if it was open before the panel closed.
  useEffect(() => {
    if (!selfMode || typeof chrome === 'undefined' || !chrome.storage) return;
    let cancelled = false;
    chrome.storage.local.get('wizard_was_open').then(r => {
      if (!cancelled && r.wizard_was_open) void openWizard();
    });
    return () => {
      cancelled = true;
    };
  }, [selfMode]);

  const knownCountRef = useRef<number | null>(null);
  const prevApplyCountRef = useRef<number>(0);
  const prevLevelUpCountRef = useRef<number>(0);

  useEffect(() => {
    if (!selfMode) return;
    let interval: ReturnType<typeof setInterval> | null = null;
    fetchCombinedOffers(1).then(result => {
      knownCountRef.current = result.count;
      prevApplyCountRef.current = result.apply_now.count;
      prevLevelUpCountRef.current = result.level_up.count;
      interval = setInterval(async () => {
        const polled = await fetchCombinedOffers(
          1,
          applyNowCountRef.current,
          levelUpCountRef.current,
          knownNewSkillsCountRef.current ?? undefined,
        );
        const newTotal = polled.count;
        const newApplyCount = polled.apply_now.count;
        const newLevelUpCount = polled.level_up.count;

        if (newTotal === 0) {
          setPageOffer(null);
        }
        if (newTotal > (knownCountRef.current ?? 0)) {
          setHasNewOffers(true);
        }
        knownCountRef.current = newTotal;

        if (
          polled.new_skills_count !== undefined &&
          polled.new_skills_count > (knownNewSkillsCountRef.current ?? 0)
        ) {
          setHasNewSkills(true);
        }
        if (polled.new_skills_count !== undefined) {
          knownNewSkillsCountRef.current = polled.new_skills_count;
        }

        if (prevApplyCountRef.current === 0 && newApplyCount > 0) {
          setApplyOffers(polled.apply_now.offers ?? []);
          setApplyHasMore(polled.apply_now.has_more ?? false);
          setApplyNowCount(newApplyCount);
          applyNowCountRef.current = newApplyCount;
          setApplyPage(1);
        }
        prevApplyCountRef.current = newApplyCount;

        if (prevLevelUpCountRef.current === 0 && newLevelUpCount > 0) {
          setLevelUpOffers(polled.level_up.offers ?? []);
          setLevelUpHasMore(polled.level_up.has_more ?? false);
          setLevelUpCount(newLevelUpCount);
          levelUpCountRef.current = newLevelUpCount;
          setLevelUpPage(1);
        }
        prevLevelUpCountRef.current = newLevelUpCount;
      }, 30000);
    });
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [selfMode]);

  useEffect(() => {
    if (selfMode && !isPro && sortBy === 'salary_delta') {
      setShowSalaryDeltaBanner(true);
      onSortByOverride?.('score');
    }
  }, [sortBy, isPro]);

  function handleCvUpdate(offerId: string, cvUrl: string, cvStatus: string) {
    const patch = (offers: UserOffer[]) =>
      offers.map(o =>
        o.user_offer_id === offerId
          ? { ...o, cv_url: cvUrl, cv_status: cvStatus }
          : o,
      );
    setApplyOffers(patch);
    setLevelUpOffers(patch);
  }

  function handleClUpdate(offerId: string, clUrl: string, clStatus: string) {
    const patch = (offers: UserOffer[]) =>
      offers.map(o =>
        o.user_offer_id === offerId
          ? { ...o, cl_url: clUrl, cl_status: clStatus }
          : o,
      );
    setApplyOffers(patch);
    setLevelUpOffers(patch);
  }

  function handleSalaryUpdate(userOfferId: string, salary: OfferSalary) {
    const patch = (offers: UserOffer[]) =>
      (offers ?? []).map(o =>
        o.user_offer_id === userOfferId ? { ...o, salary: [salary] } : o,
      );
    setApplyOffers(patch);
    setLevelUpOffers(patch);
  }

  async function handleScanPage() {
    setIsScanning(true);
    setScanMessage(null);
    setScanError(null);
    setScanLimitReached(false);
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      const pageUrl = tab.url ?? '';
      if (
        !tab?.url ||
        tab.url.startsWith('chrome://') ||
        tab.url.startsWith('chrome-extension://')
      ) {
        setScanMessage(
          'Please open a job posting page first, then click Scan.',
        );
        setTimeout(() => setScanMessage(null), 4000);
        return;
      }
      const [{ result: pageText }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        func: () => document.body.innerText,
      });
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/v1/scan-page`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token ?? ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ page_text: pageText, page_url: pageUrl }),
      });
      if (res.status === 402) {
        setScanLimitReached(true);
        return;
      }
      if (!res.ok) {
        setScanError('Something went wrong. Please try again.');
        setTimeout(() => setScanError(null), 4000);
        return;
      }
      const data = (await res.json()) as {
        is_job_offer: boolean;
        user_offer?: UserOffer;
      };
      if (!data.is_job_offer) {
        setScanMessage(
          "This page doesn't look like a job offer. Try opening a job posting first.",
        );
        setTimeout(() => setScanMessage(null), 4000);
        return;
      }
      setPageOffer(data.user_offer ?? null);
    } catch {
      setScanError('Something went wrong. Please try again.');
      setTimeout(() => setScanError(null), 4000);
    } finally {
      setIsScanning(false);
    }
  }

  async function handleBuyScanPackage() {
    if (scanTabRemovedListenerRef.current) {
      chrome.tabs.onRemoved.removeListener(scanTabRemovedListenerRef.current);
      scanTabRemovedListenerRef.current = null;
    }
    setScanPackageLoading(true);
    setScanPackageError(null);
    try {
      const token = await getToken();
      const res = await fetch(
        `${API_BASE_URL}/v1/subscription/scan-package-checkout`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token ?? ''}`,
            'Content-Type': 'application/json',
          },
        },
      );
      if (!res.ok) {
        setScanPackageError('Something went wrong. Please try again.');
        setScanPackageLoading(false);
        return;
      }
      const data = (await res.json()) as { url: string };
      const tab = await chrome.tabs.create({ url: data.url });
      scanCheckoutTabIdRef.current = tab.id;

      function onTabRemoved(tabId: number) {
        if (tabId === scanCheckoutTabIdRef.current) {
          scanCheckoutTabIdRef.current = undefined;
          setScanPackageLoading(false);
          if (scanTabRemovedListenerRef.current) {
            chrome.tabs.onRemoved.removeListener(
              scanTabRemovedListenerRef.current,
            );
            scanTabRemovedListenerRef.current = null;
          }
        }
      }

      scanTabRemovedListenerRef.current = onTabRemoved;
      chrome.tabs.onRemoved.addListener(onTabRemoved);
    } catch {
      setScanPackageError('Something went wrong. Please try again.');
      setScanPackageLoading(false);
    }
  }

  async function handleBuyCvPackage() {
    setCvPackageBuyLoading(true);
    setCvPackageBuyError(null);
    try {
      const token = await getToken();
      const res = await fetch(
        `${API_BASE_URL}/v1/subscription/cv-package-checkout`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token ?? ''}`,
            'Content-Type': 'application/json',
          },
        },
      );
      if (!res.ok) {
        setCvPackageBuyError('Something went wrong. Please try again.');
        return;
      }
      const data = (await res.json()) as { url: string };
      chrome.tabs.create({ url: data.url });
    } catch {
      setCvPackageBuyError('Something went wrong. Please try again.');
    } finally {
      setCvPackageBuyLoading(false);
    }
  }

  async function handleBuyClPackage() {
    setClPackageBuyLoading(true);
    setClPackageBuyError(null);
    try {
      const token = await getToken();
      const res = await fetch(
        `${API_BASE_URL}/v1/subscription/cl-package-checkout`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token ?? ''}`,
            'Content-Type': 'application/json',
          },
        },
      );
      if (!res.ok) {
        setClPackageBuyError('Something went wrong. Please try again.');
        return;
      }
      const data = (await res.json()) as { url: string };
      chrome.tabs.create({ url: data.url });
    } catch {
      setClPackageBuyError('Something went wrong. Please try again.');
    } finally {
      setClPackageBuyLoading(false);
    }
  }

  const filteredApplyOffers = useMemo(
    () =>
      (applyOffers ?? [])
        .filter(o => (o.claude_score ?? 0) >= minScore)
        .filter(o => !cvGenerated || o.cv_status === 'done')
        .filter(o => !clGenerated || o.cl_status === 'done'),
    [applyOffers, minScore, cvGenerated, clGenerated],
  );
  const filteredLevelUpOffers = useMemo(
    () =>
      (levelUpOffers ?? [])
        .filter(o => (o.claude_score ?? 0) >= minScore)
        .filter(o => !cvGenerated || o.cv_status === 'done')
        .filter(o => !clGenerated || o.cl_status === 'done'),
    [levelUpOffers, minScore, cvGenerated, clGenerated],
  );

  return (
    <div
      className={
        selfMode ? '' : 'border border-gray-200 rounded-md overflow-clip'
      }
    >
      {selfMode &&
        wizardPortalTarget &&
        createPortal(
          <button
            type="button"
            onClick={() =>
              void openWizard(hasNewSkills ? 'skills' : 'basic_info')
            }
            title="Edit profile"
            className="relative text-gray-800 hover:text-gray-700 transition-colors"
          >
            <AddressBook size={16} />
            {hasNewSkills && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-blue-500" />
            )}
          </button>,
          wizardPortalTarget,
        )}
      {selfMode &&
        iconsPortalTarget &&
        createPortal(
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing || !hasLoaded}
            title="Refresh"
            className="relative border border-gray-200 rounded p-1.5 
            bg-white transition-colors text-gray-600 disabled:opacity-40"
          >
            {isRefreshing || !hasLoaded ? (
              <Spinner size={14} />
            ) : (
              <ArrowsClockwise size={14} />
            )}
            {hasNewOffers && hasLoaded && !isRefreshing && (
              <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-blue-500" />
            )}
          </button>,
          iconsPortalTarget,
        )}
      {!selfMode && (
        <div
          role="button"
          tabIndex={0}
          onClick={handleToggle}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') handleToggle();
          }}
          className="w-full flex items-center justify-between px-3 py-2.5 bg-white transition-colors hover:bg-gray-50 cursor-pointer"
        >
          <div className="flex items-center gap-2">
            {client.photo_url ? (
              <img
                src={client.photo_url}
                alt=""
                className="w-6 h-6 rounded-full object-cover shrink-0"
              />
            ) : (
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-700 text-white text-[10px] font-medium shrink-0 leading-none">
                {(client.first_name?.[0] ?? '').toUpperCase()}
                {(client.last_name?.[0] ?? '').toUpperCase()}
              </span>
            )}
            <span className="text-sm font-medium text-gray-900">
              {client.first_name} {client.last_name}
            </span>
            {!selfMode &&
              (!hasLoaded || isLoading ? (
                <Spinner size={12} className="text-gray-400" />
              ) : (
                <>
                  {filteredApplyOffers.length > 0 && (
                    <span
                      className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                        statusFilter === 'pending_apply'
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {applyNowCount ?? filteredApplyOffers.length}
                    </span>
                  )}
                  {statusFilter === 'pending_apply' &&
                    filteredLevelUpOffers.length > 0 && (
                      <span className="text-xs font-medium bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded">
                        {levelUpCount ?? filteredLevelUpOffers.length}
                      </span>
                    )}
                </>
              ))}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={async e => {
                e.stopPropagation();
                void openWizard(hasNewSkills ? 'skills' : 'basic_info');
              }}
              title="Edit profile"
              className="relative text-gray-800 hover:text-gray-600 p-0.5 leading-none"
            >
              <AddressBook size={14} />
              {hasNewSkills && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-blue-500" />
              )}
            </button>
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                handleRefresh();
              }}
              disabled={isRefreshing || !hasLoaded}
              title="Refresh"
              className="relative text-gray-800 hover:text-gray-600 disabled:opacity-40 p-0.5 leading-none"
            >
              {isRefreshing || !hasLoaded ? (
                <Spinner size={14} />
              ) : (
                <ArrowsClockwise size={14} />
              )}
              {hasNewOffers && hasLoaded && !isRefreshing && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-blue-500" />
              )}
            </button>
            {!selfMode && (
              <CaretDown
                size={16}
                className={`text-gray-800 transition-transform ${isOpen ? 'rotate-180' : ''}`}
              />
            )}
          </div>
        </div>
      )}

      {(isOpen || selfMode) && (
        <div className={selfMode ? '' : 'border-t border-gray-200'}>
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
          {statusFilter === 'pending_apply' && (
            <>
              {/* Salary delta upsell — pending_apply only */}
              {showSalaryDeltaBanner && !isPro && (
                <PlanLimitBanner
                  onButtonClick={() => setUpgradeDrawerOpen(true)}
                  buttonText="Upgrade to Pro"
                  closable
                  onClose={() => setShowSalaryDeltaBanner(false)}
                >
                  <p className="text-xs text-gray-500">
                    Sorting by biggest pay raise is not available in Free plan.
                  </p>
                </PlanLimitBanner>
              )}
              {/* Scan box */}
              {scanLimitReached ? (
                <PlanLimitBanner
                  onButtonClick={() => void handleBuyScanPackage()}
                  buttonText={`Buy ${generalSettings?.package_page_scans_amount ?? '...'} scans for ${generalSettings?.scan_package_price?.formatted ?? '...'}`}
                  isLoading={scanPackageLoading}
                  errorMessage={scanPackageError}
                >
                  <p className="text-xs text-gray-500">
                    You've reached your scan limit.
                  </p>
                </PlanLimitBanner>
              ) : (
                !pageOffer && (
                  <div className="my-2 px-4 py-4 rounded-md border border-gray-200 bg-white flex flex-col items-center gap-2 text-center">
                    {byUrlLoading ? (
                      <Spinner size={16} className="text-gray-400" />
                    ) : (
                      <>
                        <p className="text-xs font-medium text-gray-700">
                          Scan this page for a job offer
                        </p>
                        <p className="text-xs text-gray-500">
                          Open any job posting and click Scan to instantly match
                          it with your profile.
                        </p>
                        <button
                          type="button"
                          onClick={() => void handleScanPage()}
                          disabled={isScanning}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isScanning && (
                            <Spinner size={12} className="text-white" />
                          )}
                          {isScanning ? 'Scanning...' : 'Scan this page'}
                        </button>
                        {scanMessage && (
                          <p className="text-xs text-gray-500">{scanMessage}</p>
                        )}
                        {scanError && (
                          <p className="text-xs text-red-500">{scanError}</p>
                        )}
                      </>
                    )}
                  </div>
                )
              )}
            </>
          )}
          {/* Offer on this page sub-section — shown for all status filters */}
          {pageOffer && (
            <div className="border-b border-gray-100">
              <button
                ref={pageOfferSectionRef}
                id="offer-on-this-page-section"
                type="button"
                onClick={() => setPageOfferOpen(v => !v)}
                className="w-full flex items-center justify-between py-2 transition-colors text-left sticky top-0 z-10 bg-gray-50 border-b border-gray-200"
              >
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                  Offer on this page
                </span>
                <CaretDown
                  size={14}
                  className={`text-gray-400 transition-transform ${pageOfferOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {pageOfferOpen && (
                <div ref={pageOfferCardRef}>
                  <OfferCard
                    key={pageOffer.user_offer_id}
                    offer={pageOffer}
                    clientId={client.id}
                    clientFirstName={client.first_name}
                    clientLastName={client.last_name}
                    isOpen={true}
                    onToggle={() => {}}
                    activeTabId={activeTabId}
                    onRemove={() => setPageOffer(null)}
                    onRollback={() => {}}
                    onError={setStatusError}
                    onCvUpdate={handleCvUpdate}
                    onClUpdate={handleClUpdate}
                    onSalaryUpdate={handleSalaryUpdate}
                    candidateSkills={candidateSkills}
                    isOfferLoading={false}
                    selfMode={selfMode}
                    onCvLimitReached={() => void handleBuyCvPackage()}
                    onClLimitReached={() => void handleBuyClPackage()}
                    cvPackageBuyLoading={cvPackageBuyLoading}
                    cvPackageBuyError={cvPackageBuyError}
                    clPackageBuyLoading={clPackageBuyLoading}
                    clPackageBuyError={clPackageBuyError}
                    cvPackageAmount={generalSettings?.cv_package_amount}
                    cvPackagePrice={
                      generalSettings?.cv_package_price?.formatted
                    }
                    clPackageAmount={generalSettings?.cl_package_amount}
                    clPackagePrice={
                      generalSettings?.cl_package_price?.formatted
                    }
                    preferenceSalaries={preferenceSalaries}
                    isPageOffer={true}
                  />
                </div>
              )}
            </div>
          )}
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Spinner className="text-indigo-600" />
            </div>
          ) : selfMode && !profileReady ? (
            <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
              <p className="text-sm text-gray-600">
                You left your profile mid-edit.
                <br />
                Complete it to start receiving matches.
              </p>
              <button
                type="button"
                onClick={() => void openWizard()}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
              >
                Continue editing
              </button>
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
                        className="w-full flex items-center justify-between py-2 transition-colors text-left sticky top-0 z-10 bg-gray-50 border-b border-gray-200"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                            Apply now
                          </span>
                          <span className="text-xs font-medium bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
                            {applyNowCount ?? filteredApplyOffers.length}
                          </span>
                        </div>
                        <CaretDown
                          size={14}
                          className={`text-gray-400 transition-transform ${applyOpen ? 'rotate-180' : ''}`}
                        />
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
                                  setExpandedOfferId(prev =>
                                    prev === offer.user_offer_id
                                      ? null
                                      : offer.user_offer_id,
                                  )
                                }
                                onShowOffer={
                                  offer.offer_url
                                    ? () =>
                                        void handleCardToggle(
                                          offer,
                                          offer.offer_url,
                                        )
                                    : undefined
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
                                onCvUpdate={handleCvUpdate}
                                onClUpdate={handleClUpdate}
                                onSalaryUpdate={handleSalaryUpdate}
                                candidateSkills={candidateSkills}
                                isOfferLoading={isLoading}
                                isCurrentPageOffer={
                                  offer.user_offer_id ===
                                  pageOffer?.user_offer_id
                                }
                                onScrollToPageOffer={handleScrollToPageOffer}
                                hideActions={true}
                                preferenceSalaries={preferenceSalaries}
                              />
                            ),
                          )}
                          {applyHasMore &&
                            (isPro ||
                              applyOffers.length <
                                (generalSettings?.plans?.free?.max_apply_now ??
                                  Infinity)) && (
                              <div className="flex justify-center py-2">
                                <button
                                  type="button"
                                  onClick={() => void handleLoadMoreApply()}
                                  disabled={applyLoadingMore}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white text-gray-600 hover:text-gray-800 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
                                >
                                  {applyLoadingMore && (
                                    <Spinner
                                      size={11}
                                      className="text-gray-500"
                                    />
                                  )}
                                  {applyLoadingMore ? 'Loading…' : 'Show more'}
                                </button>
                              </div>
                            )}
                          {!isPro &&
                            generalSettings?.plans?.free?.max_apply_now !=
                              null &&
                            applyOffers.length >=
                              generalSettings.plans.free.max_apply_now &&
                            (applyNowCount ?? 0) >
                              generalSettings.plans.free.max_apply_now && (
                              <PlanLimitBanner
                                onButtonClick={() => setUpgradeDrawerOpen(true)}
                                buttonText="Upgrade to Pro"
                                withMX={false}
                              >
                                <p className="text-xs text-gray-500">
                                  You've reached your free plan limit. Upgrade
                                  to unlock{' '}
                                  <span className="font-medium text-gray-700">
                                    {(applyNowCount ?? 0) -
                                      generalSettings.plans.free
                                        .max_apply_now}{' '}
                                    more
                                  </span>{' '}
                                  matches.
                                </p>
                              </PlanLimitBanner>
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
                        className="w-full flex items-center justify-between py-2 transition-colors text-left sticky top-0 z-10 bg-gray-50 border-b border-gray-200"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                            Level up & earn more
                          </span>
                          <span className="text-xs font-medium bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded">
                            {levelUpCount ?? filteredLevelUpOffers.length}
                          </span>
                        </div>
                        <CaretDown
                          size={14}
                          className={`text-gray-400 transition-transform ${levelUpOpen ? 'rotate-180' : ''}`}
                        />
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
                                  setExpandedOfferId(prev =>
                                    prev === offer.user_offer_id
                                      ? null
                                      : offer.user_offer_id,
                                  )
                                }
                                onShowOffer={
                                  offer.offer_url
                                    ? () =>
                                        void handleCardToggle(
                                          offer,
                                          offer.offer_url,
                                        )
                                    : undefined
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
                                onCvUpdate={handleCvUpdate}
                                onClUpdate={handleClUpdate}
                                onSalaryUpdate={handleSalaryUpdate}
                                candidateSkills={candidateSkills}
                                isOfferLoading={isLoading}
                                isCurrentPageOffer={
                                  offer.user_offer_id ===
                                  pageOffer?.user_offer_id
                                }
                                onScrollToPageOffer={handleScrollToPageOffer}
                                hideActions={true}
                                preferenceSalaries={preferenceSalaries}
                              />
                            ),
                          )}
                          {levelUpHasMore &&
                            (isPro ||
                              levelUpOffers.length <
                                (generalSettings?.plans?.free?.max_level_up ??
                                  Infinity)) && (
                              <div className="flex justify-center py-2">
                                <button
                                  type="button"
                                  onClick={() => void handleLoadMoreLevelUp()}
                                  disabled={levelUpLoadingMore}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white text-gray-600 hover:text-gray-800 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
                                >
                                  {levelUpLoadingMore && (
                                    <Spinner
                                      size={11}
                                      className="text-gray-500"
                                    />
                                  )}
                                  {levelUpLoadingMore
                                    ? 'Loading…'
                                    : 'Show more'}
                                </button>
                              </div>
                            )}
                          {!isPro &&
                            generalSettings?.plans?.free?.max_level_up !=
                              null &&
                            levelUpOffers.length >=
                              generalSettings.plans.free.max_level_up &&
                            (levelUpCount ?? 0) >
                              generalSettings.plans.free.max_level_up && (
                              <PlanLimitBanner
                                onButtonClick={() => setUpgradeDrawerOpen(true)}
                                buttonText="Upgrade to Pro"
                                withMX={false}
                              >
                                <p className="text-xs text-gray-500">
                                  You've reached your free plan limit. Upgrade
                                  to unlock{' '}
                                  <span className="font-medium text-gray-700">
                                    {(levelUpCount ?? 0) -
                                      generalSettings.plans.free
                                        .max_level_up}{' '}
                                    more
                                  </span>{' '}
                                  matches.
                                </p>
                              </PlanLimitBanner>
                            )}
                        </div>
                      )}
                    </div>
                  )}
                  {filteredApplyOffers.length === 0 &&
                    filteredLevelUpOffers.length === 0 && (
                      <p className="py-3 text-gray-400 text-xs">
                        {selfMode
                          ? "We're scanning thousands of offers for you. Your matches will appear here shortly."
                          : 'No offers found.'}
                      </p>
                    )}
                </>
              ) : (
                <>
                  {/* Single section for non-pending_apply statuses */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setApplyOpen(v => !v)}
                      className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200 w-full flex items-center justify-between py-2 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                          {selfMode && statusFilter === 'client_withdrawn'
                            ? 'Withdrawn'
                            : (STATUS_LABELS[statusFilter] ?? statusFilter)}
                        </span>
                        {filteredApplyOffers.length > 0 && (
                          <span className="text-xs font-medium bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">
                            {filteredApplyOffers.length}
                          </span>
                        )}
                      </div>
                      <CaretDown
                        size={14}
                        className={`text-gray-400 transition-transform ${applyOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {applyOpen && (
                      <div>
                        {filteredApplyOffers.length === 0 ? (
                          <p className="py-3 text-gray-400 text-xs">
                            No offers found.
                          </p>
                        ) : (
                          <div>
                            {sortOffers(filteredApplyOffers, sortBy).map(
                              offer => (
                                <OfferCard
                                  key={offer.user_offer_id}
                                  offer={offer}
                                  clientId={client.id}
                                  clientFirstName={client.first_name}
                                  clientLastName={client.last_name}
                                  isOpen={
                                    expandedOfferId === offer.user_offer_id
                                  }
                                  onToggle={() =>
                                    setExpandedOfferId(prev =>
                                      prev === offer.user_offer_id
                                        ? null
                                        : offer.user_offer_id,
                                    )
                                  }
                                  onShowOffer={
                                    offer.offer_url
                                      ? () =>
                                          void handleCardToggle(
                                            offer,
                                            offer.offer_url,
                                          )
                                      : undefined
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
                                  onCvUpdate={handleCvUpdate}
                                  onClUpdate={handleClUpdate}
                                  onSalaryUpdate={handleSalaryUpdate}
                                  candidateSkills={candidateSkills}
                                  isOfferLoading={isLoading}
                                  selfMode={selfMode}
                                  isCurrentPageOffer={
                                    offer.user_offer_id ===
                                    pageOffer?.user_offer_id
                                  }
                                  onScrollToPageOffer={handleScrollToPageOffer}
                                  onCvLimitReached={() =>
                                    void handleBuyCvPackage()
                                  }
                                  onClLimitReached={() =>
                                    void handleBuyClPackage()
                                  }
                                  cvPackageBuyLoading={cvPackageBuyLoading}
                                  cvPackageBuyError={cvPackageBuyError}
                                  clPackageBuyLoading={clPackageBuyLoading}
                                  clPackageBuyError={clPackageBuyError}
                                  cvPackageAmount={
                                    generalSettings?.cv_package_amount
                                  }
                                  cvPackagePrice={
                                    generalSettings?.cv_package_price?.formatted
                                  }
                                  clPackageAmount={
                                    generalSettings?.cl_package_amount
                                  }
                                  clPackagePrice={
                                    generalSettings?.cl_package_price?.formatted
                                  }
                                  preferenceSalaries={preferenceSalaries}
                                />
                              ),
                            )}
                            {statusHasMore && (
                              <div className="flex justify-center py-2 border-t border-gray-100">
                                <button
                                  type="button"
                                  onClick={() => void handleLoadMoreStatus()}
                                  disabled={statusLoadingMore}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
                                >
                                  {statusLoadingMore && (
                                    <Spinner
                                      size={11}
                                      className="text-gray-500"
                                    />
                                  )}
                                  {statusLoadingMore ? 'Loading…' : 'Show more'}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
      {profileOpen &&
        createPortal(
          <div className="fixed inset-0 z-50">
            <div
              className={`absolute inset-0 bg-black/20 transition-opacity duration-200 ${profileVisible ? 'opacity-100' : 'opacity-0'}`}
              onClick={closeWizard}
            />
            <div
              className={`absolute inset-y-0 right-0 w-full flex flex-col shadow-xl transition-transform duration-200 ${profileVisible ? 'translate-x-0' : 'translate-x-full'}`}
            >
              {!wizardProfile ? (
                <div className="flex flex-col h-full bg-gray-50">
                  <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 shrink-0">
                    <span className="text-sm font-semibold text-gray-900">
                      Great jobs start with a great profile
                    </span>
                    <button
                      type="button"
                      onClick={closeWizard}
                      aria-label="Close"
                      className="text-gray-800 hover:text-gray-700 transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </header>
                  <div className="flex-1 flex items-center justify-center">
                    <Spinner size={24} className="text-indigo-600" />
                  </div>
                </div>
              ) : (
                <WizardShell
                  profile={wizardProfile}
                  onChange={setWizardProfile}
                  clientId={client.id}
                  profileLoading={wizardProfileLoading}
                  onClose={closeWizard}
                  onRematch={() => setProfileReady(true)}
                  onCancelEdit={() => setProfileReady(true)}
                  profileRematchPending={profileRematchPending}
                  autoTriggerReview={autoTriggerReview}
                  onAutoTriggerReviewConsumed={() =>
                    setAutoTriggerReview(false)
                  }
                  initialTab={wizardInitialTab}
                  offerSkills={offerSkills}
                  onDismissOfferSkill={dismissOfferSkill}
                  openedFromBlueDot={wizardInitialTab === 'skills'}
                  onRematchLimitReached={() => {
                    setProfileRematchPending(true);
                    setProfileOpen(true);
                    requestAnimationFrame(() => setProfileVisible(true));
                  }}
                  onSyncTriggered={() => {
                    setApplyOffers([]);
                    setLevelUpOffers([]);
                    setApplyNowCount(null);
                    applyNowCountRef.current = 0;
                    setLevelUpCount(null);
                    levelUpCountRef.current = 0;
                    knownNewSkillsCountRef.current = 0;
                    setApplyPage(1);
                    setLevelUpPage(1);
                    const currency =
                      wizardProfile?.preferences?.salary[0]?.currency;
                    if (currency) {
                      void (async () => {
                        try {
                          const token = await getToken();
                          await fetch(`${API_BASE_URL}/v1/account/settings`, {
                            method: 'PATCH',
                            headers: {
                              'Content-Type': 'application/json',
                              ...(token
                                ? { Authorization: `Bearer ${token}` }
                                : {}),
                            },
                            body: JSON.stringify({
                              preferred_currency: currency,
                            }),
                          });
                        } catch {
                          /* ignore */
                        }
                      })();
                    }
                    void (async () => {
                      try {
                        const result = await fetchCombinedOffers(1, 0, 0, 0);
                        if (!result) return;
                        setApplyOffers(result.apply_now.offers ?? []);
                        setApplyHasMore(result.apply_now.has_more ?? false);
                        setApplyNowCount(result.apply_now.count);
                        applyNowCountRef.current = result.apply_now.count;
                        prevApplyCountRef.current = result.apply_now.count;
                        setLevelUpOffers(result.level_up.offers ?? []);
                        setLevelUpHasMore(result.level_up.has_more ?? false);
                        setLevelUpCount(result.level_up.count);
                        levelUpCountRef.current = result.level_up.count;
                        prevLevelUpCountRef.current = result.level_up.count;
                        knownNewSkillsCountRef.current =
                          result.new_skills_count ?? 0;
                      } catch {
                        /* ignore */
                      }
                    })();
                  }}
                  onSubmitted={closeWizard}
                  onSaved={saved => {
                    const fn = saved.basic_info?.first_name ?? '';
                    const ln = saved.basic_info?.last_name ?? '';
                    onClientUpdate?.(client.id, fn, ln);
                  }}
                  onCloseComplete={(ready, syncTriggered) => {
                    setProfileReady(ready);
                    if (syncTriggered) {
                      knownCountRef.current = 0;
                      void handleRefresh();
                    }
                  }}
                />
              )}
            </div>
          </div>,
          document.body,
        )}
      {upgradeDrawerOpen && (
        <PlanDrawer onClose={() => setUpgradeDrawerOpen(false)} isPro={isPro} />
      )}
    </div>
  );
}

export default function ExploreTab({
  onLogout,
  activeTabId,
  currentUrl,
  selfMode,
  wizardPortalTarget,
}: Props) {
  const { fetchClients } = useClients();
  const { settings: generalSettings } = useGeneralSettings();
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState('score');
  const [statusFilter, setStatusFilter] = useState('pending_apply');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [cvGenerated, setCvGenerated] = useState(false);
  const [clGenerated, setClGenerated] = useState(false);
  const [minScore, setMinScore] = useState(0);
  const [debouncedMinScore, setDebouncedMinScore] = useState(0);
  const minScoreDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [iconsSlotEl, setIconsSlotEl] = useState<HTMLDivElement | null>(null);

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
      if (result.hd_min_score !== undefined) {
        setMinScore(result.hd_min_score as number);
        setDebouncedMinScore(result.hd_min_score as number);
      }
    });
  }, []);

  useEffect(() => {
    return () => {
      if (minScoreDebounceRef.current)
        clearTimeout(minScoreDebounceRef.current);
    };
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

  function handleClientUpdate(id: string, firstName: string, lastName: string) {
    setClients(prev =>
      prev.map(c =>
        c.id === id ? { ...c, first_name: firstName, last_name: lastName } : c,
      ),
    );
  }

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
    if (minScoreDebounceRef.current) clearTimeout(minScoreDebounceRef.current);
    minScoreDebounceRef.current = setTimeout(() => {
      setDebouncedMinScore(value);
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set({ hd_min_score: value });
      }
    }, 400);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const result = await fetchClients();
      if (cancelled) return;
      setIsLoading(false);
      if ('error' in result) {
        setError(result.error);
        if (result.error.includes('Session expired')) {
          const flag = await chrome.storage.local.get(
            'account_deletion_in_progress',
          );
          if (!flag.account_deletion_in_progress) onLogout();
        }
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
      <div className="h-full flex items-center justify-center">
        <Spinner size={20} className="text-indigo-600" />
      </div>
    );
  }

  if (error) {
    return <p className="px-4 py-5 text-sm text-red-600">{error}</p>;
  }

  return (
    <>
      <div
        className="px-4 py-5 flex flex-col gap-3"
        style={{ paddingBottom: 500 }}
      >
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
              {minScore}%
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500">Status:</span>
              <select
                value={statusFilter}
                onChange={e => handleStatusFilterChange(e.target.value)}
                className="text-xs border border-gray-300 rounded px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="pending_apply">Pending apply</option>
                <option value="applied">Applied</option>
                {!selfMode && (
                  <option value="agent_withdrawn">Agent withdrawn</option>
                )}
                <option value="client_withdrawn">
                  {selfMode ? 'Withdrawn' : 'Client withdrawn'}
                </option>
                <option value="recruiter_rejected">Recruiter rejected</option>
                <option value="offer_received">Offer received</option>
                <option value="accepted">Accepted</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">With:</span>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cvGenerated}
                  onChange={e => setCvGenerated(e.target.checked)}
                  className="w-4 h-4 accent-blue-600 cursor-pointer shrink-0"
                />
                <span className="text-xs text-gray-700">CV</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={clGenerated}
                  onChange={e => setClGenerated(e.target.checked)}
                  className="w-4 h-4 accent-blue-600 cursor-pointer shrink-0"
                />
                <span className="text-xs text-gray-700">CL</span>
              </label>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            {generalSettings?.show_source_filter && (
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
            )}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500">Sort by:</span>
              <select
                value={sortBy}
                onChange={e => handleSortChange(e.target.value)}
                className="text-xs border border-gray-300 rounded px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="score">Score</option>
                <option value="published_at">Published at</option>
                <option value="salary_delta">Biggest pay raise</option>
              </select>
            </div>
            {selfMode && (
              <div ref={setIconsSlotEl} className="flex items-center" />
            )}
          </div>
        </div>
        {selfMode ? (
          clients.length === 0 ? (
            <div className="flex items-center justify-center py-6">
              <Spinner className="text-indigo-600" />
            </div>
          ) : (
            <ClientAccordion
              key={clients[0].id}
              client={clients[0]}
              activeTabId={activeTabId}
              currentUrl={currentUrl}
              sortBy={sortBy}
              statusFilter={statusFilter}
              sourceFilter={sourceFilter}
              minScore={debouncedMinScore}
              cvGenerated={cvGenerated}
              clGenerated={clGenerated}
              onClientUpdate={handleClientUpdate}
              onSortByOverride={handleSortChange}
              defaultExpanded={true}
              selfMode={true}
              iconsPortalTarget={iconsSlotEl}
              wizardPortalTarget={wizardPortalTarget}
            />
          )
        ) : clients.length === 0 ? (
          <p className="text-sm text-gray-500">No clients found.</p>
        ) : (
          [...clients]
            .sort((a, b) =>
              `${a.first_name} ${a.last_name}`.localeCompare(
                `${b.first_name} ${b.last_name}`,
              ),
            )
            .map(client => (
              <ClientAccordion
                key={client.id}
                client={client}
                activeTabId={activeTabId}
                currentUrl={currentUrl}
                sortBy={sortBy}
                statusFilter={statusFilter}
                sourceFilter={sourceFilter}
                minScore={debouncedMinScore}
                cvGenerated={cvGenerated}
                clGenerated={clGenerated}
                onClientUpdate={handleClientUpdate}
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
