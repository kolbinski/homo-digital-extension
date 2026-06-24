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
  Star,
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
  is_starred?: boolean;
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
  client_withdrawn: 'Withdrawn',
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
  { value: 'pending_apply', label: 'Pending apply' },
  { value: 'applied', label: 'Applied' },
  { value: 'agent_withdrawn', label: 'Agent withdrawn' },
  { value: 'client_withdrawn', label: 'Withdrawn' },
  { value: 'offer_received', label: 'Offer received' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'recruiter_rejected', label: 'Recruiter rejected' },
];
// STATUS_OPTIONS kept for OfferCard "Set status" dropdown

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
  wizardPortalTarget?: HTMLDivElement | null;
  withSalary?: boolean;
  onlyStarred?: boolean;
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
  onStatusChange402?: () => void;
  onStatusChanged?: (offerId: string, newStatus: string) => void;
  onCvUpdate: (offerId: string, cvUrl: string, cvStatus: string) => void;
  onClUpdate: (offerId: string, clUrl: string, clStatus: string) => void;
  onSalaryUpdate?: (userOfferId: string, salary: OfferSalary) => void;
  onStarToggle?: (id: string, starred: boolean) => Promise<void> | void;
  isOfferLoading: boolean;
  isPageOffer?: boolean;
  statusChangeCounterMax?: number | null;
  onUpgradeClick?: () => void;
  onRegisterUpgradeRetry?: (retryFn: (() => void) | null) => void;
  upgradeCheckoutLoading?: boolean;
  upgradeCheckoutError?: string | null;
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
  onStatusChange402,
  onStatusChanged,
  onCvUpdate,
  onClUpdate,
  onSalaryUpdate,
  onStarToggle,
  isOfferLoading,
  isPageOffer = false,
  statusChangeCounterMax,
  onUpgradeClick,
  onRegisterUpgradeRetry,
  upgradeCheckoutLoading = false,
  upgradeCheckoutError,
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
  const [isStarLoading, setIsStarLoading] = useState(false);
  const [statusChangeError, setStatusChangeError] = useState<string | null>(
    null,
  );
  const [status402Error, setStatus402Error] = useState(false);
  const pendingStatus402Ref = useRef<string | null>(null);
  const onRegisterUpgradeRetryRef = useRef(onRegisterUpgradeRetry);
  onRegisterUpgradeRetryRef.current = onRegisterUpgradeRetry;
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
    setStatusChangeError(null);
    setStatus402Error(false);
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
      if (res.status === 402) {
        onRollback(offer);
        if (isPageOffer) {
          pendingStatus402Ref.current = newStatus;
          onRegisterUpgradeRetryRef.current?.(() => {
            void handleStatusChange(pendingStatus402Ref.current!);
          });
          setStatus402Error(true);
        } else {
          onStatusChange402?.();
        }
      } else if (!res.ok) {
        onRollback(offer);
        if (isPageOffer) {
          setStatusChangeError('Failed to update status. Please try again.');
        } else {
          onError('Failed to update status. Please try again.');
        }
      } else {
        onStatusChanged?.(offer.user_offer_id, newStatus);
      }
    } catch {
      onRollback(offer);
      if (isPageOffer) {
        setStatusChangeError('Failed to update status. Please try again.');
      } else {
        onError('Failed to update status. Please try again.');
      }
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
        <div className="flex items-center gap-1 flex-wrap">
          <button
            type="button"
            onClick={async e => {
              e.stopPropagation();
              if (!onStarToggle || isStarLoading) return;
              setIsStarLoading(true);
              try {
                await onStarToggle(offer.user_offer_id, !offer.is_starred);
              } finally {
                setIsStarLoading(false);
              }
            }}
            disabled={isStarLoading}
            className="shrink-0 text-gray-600 transition-colors leading-none disabled:cursor-wait"
            title={offer.is_starred ? 'Unstar' : 'Star'}
          >
            {isStarLoading ? (
              <Spinner size={16} />
            ) : offer.is_starred ? (
              <Star size={16} weight="fill" className="text-yellow-400" />
            ) : (
              <Star size={16} />
            )}
          </button>
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
          {isPageOffer && !hideActions && (
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
            <>
              <div ref={dropdownRef}>
                <button
                  type="button"
                  disabled={statusLoading === offer.user_offer_id}
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
                  className="w-full flex items-center justify-between gap-2 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-medium py-2 px-3 rounded-md text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <span>Set status</span>
                  <span className="flex items-center gap-1">
                    {statusLoading === offer.user_offer_id ? (
                      <Spinner size={12} className="text-white" />
                    ) : (
                      offer.status && (
                        <span className="text-xs opacity-70">
                          curr.{' '}
                          {(
                            STATUS_LABELS[offer.status] ?? offer.status
                          ).toLowerCase()}
                        </span>
                      )
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
                        opt =>
                          opt.value !== offer.status &&
                          (!selfMode || opt.value !== 'agent_withdrawn'),
                      ).map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => handleStatusChange(opt.value)}
                          className="w-full text-left text-sm px-4 py-2 hover:bg-gray-100 transition-colors text-gray-700"
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>,
                    document.body,
                  )}
              </div>
              {status402Error && (
                <div className="mt-1 px-3 py-2 text-xs text-gray-700 bg-white border border-gray-200 rounded-md flex flex-col gap-2 items-center">
                  <div className="flex items-center justify-between gap-2">
                    <span style={{ textAlign: 'center' }}>
                      You've used all {statusChangeCounterMax ?? '?'} free
                      status changes. Upgrade to Pro to continue.
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setStatus402Error(false);
                        pendingStatus402Ref.current = null;
                        onRegisterUpgradeRetryRef.current?.(null);
                      }}
                      className="shrink-0 text-gray-400 hover:text-gray-600"
                    >
                      ✕
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={onUpgradeClick}
                    disabled={upgradeCheckoutLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 active:bg-green-800 rounded transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {upgradeCheckoutLoading && (
                      <Spinner size={11} className="text-white" />
                    )}
                    {upgradeCheckoutLoading
                      ? 'Checkout in progress…'
                      : 'Upgrade to Pro'}
                  </button>
                  {upgradeCheckoutError && (
                    <p className="text-xs text-red-500">
                      {upgradeCheckoutError}
                    </p>
                  )}
                </div>
              )}
              {statusChangeError && (
                <div className="mt-1 px-3 py-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md flex items-center justify-between gap-2">
                  <span>{statusChangeError}</span>
                  <button
                    type="button"
                    onClick={() => setStatusChangeError(null)}
                    className="shrink-0 text-red-400 hover:text-red-600"
                  >
                    ✕
                  </button>
                </div>
              )}
            </>
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

type SectionState = { offers: UserOffer[]; count: number; countFiltered: number; hasMore: boolean };
const EMPTY_SECTION: SectionState = { offers: [], count: 0, countFiltered: 0, hasMore: false };

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
  wizardPortalTarget,
  withSalary = false,
  onlyStarred = false,
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
  const [applySection, setApplySection] = useState<SectionState>(EMPTY_SECTION);
  const [levelUpSection, setLevelUpSection] = useState<SectionState>(EMPTY_SECTION);
  const [appliedSection, setAppliedSection] = useState<SectionState>(EMPTY_SECTION);
  const [withdrawnSection, setWithdrawnSection] = useState<SectionState>(EMPTY_SECTION);
  const [rejectedSection, setRejectedSection] = useState<SectionState>(EMPTY_SECTION);
  const [offerReceivedSection, setOfferReceivedSection] = useState<SectionState>(EMPTY_SECTION);
  const [acceptedSection, setAcceptedSection] = useState<SectionState>(EMPTY_SECTION);

  // For polling known_*_count params
  const knownApplyCountRef = useRef(0);
  const knownLevelUpCountRef = useRef(0);
  const knownAppliedCountRef = useRef(0);
  const knownWithdrawnCountRef = useRef(0);
  const knownRejectedCountRef = useRef(0);
  const knownOfferReceivedCountRef = useRef(0);
  const knownAcceptedCountRef = useRef(0);

  type AccordionKey = 'apply_now' | 'level_up' | 'applied' | 'client_withdrawn' | 'recruiter_rejected' | 'offer_received' | 'accepted';
  const DEFAULT_ACCORDION_OPEN: Record<AccordionKey, boolean> = { apply_now: true, level_up: true, applied: true, client_withdrawn: true, recruiter_rejected: true, offer_received: true, accepted: true };
  const [accordionOpen, setAccordionOpen] = useState<Record<AccordionKey, boolean>>(DEFAULT_ACCORDION_OPEN);
  function setAccordionSection(key: AccordionKey, value: boolean) {
    const next = { ...accordionOpen, [key]: value };
    setAccordionOpen(next);
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ accordion_state: next });
    }
  }
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    chrome.storage.local.get('accordion_state', result => {
      if (chrome.runtime.lastError) return;
      if (result.accordion_state) {
        setAccordionOpen(prev => ({ ...prev, ...(result.accordion_state as Record<AccordionKey, boolean>) }));
      }
    });
  }, []);

  const [pageOfferOpen, setPageOfferOpen] = useState(true);
  const [expandedOfferId, setExpandedOfferId] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusChangeCounter, setStatusChangeCounter] = useState<number>(0);
  const [statusChangeCounterMax, setStatusChangeCounterMax] = useState<
    number | null
  >(null);
  const [statusChangeLimitHit, setStatusChangeLimitHit] = useState(false);

  const [pageApplyNow, setPageApplyNow] = useState(1);
  const [pageLevelUp, setPageLevelUp] = useState(1);
  const [pageApplied, setPageApplied] = useState(1);
  const [pageWithdrawn, setPageWithdrawn] = useState(1);
  const [pageRejected, setPageRejected] = useState(1);
  const [pageOfferReceived, setPageOfferReceived] = useState(1);
  const [pageAccepted, setPageAccepted] = useState(1);

  // hasMore is now part of SectionState

  const [applyLoadingMore, setApplyLoadingMore] = useState(false);
  const [levelUpLoadingMore, setLevelUpLoadingMore] = useState(false);
  const [appliedLoadingMore, setAppliedLoadingMore] = useState(false);
  const [withdrawnLoadingMore, setWithdrawnLoadingMore] = useState(false);
  const [rejectedLoadingMore, setRejectedLoadingMore] = useState(false);
  const [offerReceivedLoadingMore, setOfferReceivedLoadingMore] =
    useState(false);
  const [acceptedLoadingMore, setAcceptedLoadingMore] = useState(false);

  const loadMoreApplyInProgress = useRef(false);
  const loadMoreLevelUpInProgress = useRef(false);
  const loadMoreAppliedInProgress = useRef(false);
  const loadMoreWithdrawnInProgress = useRef(false);
  const loadMoreRejectedInProgress = useRef(false);
  const loadMoreOfferReceivedInProgress = useRef(false);
  const loadMoreAcceptedInProgress = useRef(false);

  // Per-section blue-dot flags (count changed since last refresh)
  const [hasNewApply, setHasNewApply] = useState(false);
  const [hasNewLevelUp, setHasNewLevelUp] = useState(false);
  const [hasNewApplied, setHasNewApplied] = useState(false);
  const [hasNewWithdrawn, setHasNewWithdrawn] = useState(false);
  const [hasNewRejected, setHasNewRejected] = useState(false);
  const [hasNewOfferReceived, setHasNewOfferReceived] = useState(false);
  const [hasNewAccepted, setHasNewAccepted] = useState(false);

  const [upgradeDrawerOpen, setUpgradeDrawerOpen] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const upgradeRetryRef = useRef<(() => void) | null>(null);
  const [upgradeCheckoutLoading, setUpgradeCheckoutLoading] = useState(false);
  const [upgradeCheckoutError, setUpgradeCheckoutError] = useState<
    string | null
  >(null);
  const upgradeCheckoutTabIdRef = useRef<number | null>(null);
  const upgradeTabRemovedListenerRef = useRef<((tabId: number) => void) | null>(
    null,
  );
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
        setUpgradeCheckoutLoading(false);
        upgradeRetryRef.current?.();
        upgradeRetryRef.current = null;
      }
      if (
        'upgrade_cancelled' in changes &&
        changes.upgrade_cancelled.newValue !== undefined
      ) {
        setUpgradeDrawerOpen(false);
        setUpgradeCheckoutLoading(false);
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
        setApplySection(EMPTY_SECTION);
        setLevelUpSection(EMPTY_SECTION);
        setAppliedSection(EMPTY_SECTION);
        setWithdrawnSection(EMPTY_SECTION);
        setRejectedSection(EMPTY_SECTION);
        setOfferReceivedSection(EMPTY_SECTION);
        setAcceptedSection(EMPTY_SECTION);
        knownApplyCountRef.current = 0;
        knownLevelUpCountRef.current = 0;
        knownAppliedCountRef.current = 0;
        knownWithdrawnCountRef.current = 0;
        knownRejectedCountRef.current = 0;
        knownOfferReceivedCountRef.current = 0;
        knownAcceptedCountRef.current = 0;
        setPageApplyNow(1);
        setPageLevelUp(1);
        setPageApplied(1);
        setPageWithdrawn(1);
        setPageRejected(1);
        setPageOfferReceived(1);
        setPageAccepted(1);
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
            setApplySection(EMPTY_SECTION);
            setLevelUpSection(EMPTY_SECTION);
            setAppliedSection(EMPTY_SECTION);
            setWithdrawnSection(EMPTY_SECTION);
            setRejectedSection(EMPTY_SECTION);
            setOfferReceivedSection(EMPTY_SECTION);
            setAcceptedSection(EMPTY_SECTION);
            knownApplyCountRef.current = 0;
            knownLevelUpCountRef.current = 0;
            knownAppliedCountRef.current = 0;
            knownWithdrawnCountRef.current = 0;
            knownRejectedCountRef.current = 0;
            knownOfferReceivedCountRef.current = 0;
            knownAcceptedCountRef.current = 0;
            setPageApplyNow(1);
            setPageLevelUp(1);
            setPageApplied(1);
            setPageWithdrawn(1);
            setPageRejected(1);
            setPageOfferReceived(1);
            setPageAccepted(1);
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
      applySection.offers.find(o => o.user_offer_id === expandedOfferId) ??
      levelUpSection.offers.find(o => o.user_offer_id === expandedOfferId) ??
      appliedSection.offers.find(o => o.user_offer_id === expandedOfferId) ??
      withdrawnSection.offers.find(o => o.user_offer_id === expandedOfferId) ??
      rejectedSection.offers.find(o => o.user_offer_id === expandedOfferId) ??
      offerReceivedSection.offers.find(o => o.user_offer_id === expandedOfferId) ??
      acceptedSection.offers.find(o => o.user_offer_id === expandedOfferId);
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
    const allOffers = [
      ...applySection.offers,
      ...levelUpSection.offers,
      ...appliedSection.offers,
      ...withdrawnSection.offers,
      ...rejectedSection.offers,
      ...offerReceivedSection.offers,
      ...acceptedSection.offers,
    ];
    const match = allOffers.find(
      o => o.offer_url && currentUrl.startsWith(o.offer_url.split('?')[0]),
    );
    if (match && match.user_offer_id !== pageOfferIdRef.current) {
      setExpandedOfferId(match.user_offer_id);
    }
  }, [
    currentUrl,
    applySection,
    levelUpSection,
    appliedSection,
    withdrawnSection,
    rejectedSection,
    offerReceivedSection,
    acceptedSection,
  ]);

  useEffect(() => {
    if (!currentUrl || hasLoaded) return;
    const url = currentUrl;
    let cancelled = false;
    async function eagerLoad() {
      const result = await fetchAllOffers();
      if (cancelled) return;
      applyAllOffersResponse(result);
      setHasLoaded(true);
      const allOffers = [
        ...(result.apply_now?.offers ?? []),
        ...(result.level_up?.offers ?? []),
        ...(result.applied?.offers ?? []),
        ...(result.client_withdrawn?.offers ?? []),
        ...(result.recruiter_rejected?.offers ?? []),
        ...(result.offer_received?.offers ?? []),
        ...(result.accepted?.offers ?? []),
      ];
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
    setPageApplyNow(1);
    setPageLevelUp(1);
    setPageApplied(1);
    setPageWithdrawn(1);
    setPageRejected(1);
    setPageOfferReceived(1);
    setPageAccepted(1);
    setApplySection(EMPTY_SECTION);
    setLevelUpSection(EMPTY_SECTION);
    setAppliedSection(EMPTY_SECTION);
    setWithdrawnSection(EMPTY_SECTION);
    setRejectedSection(EMPTY_SECTION);
    setOfferReceivedSection(EMPTY_SECTION);
    setAcceptedSection(EMPTY_SECTION);
    if (sortBy === 'salary_delta' && !isPro) return;
    let cancelled = false;
    async function refetchOffers() {
      if (isOpen) setIsLoading(true);
      const result = await fetchAllOffers();
      if (cancelled) return;
      applyAllOffersResponse(result);
      if (cancelled) return;
      if (isOpen) setIsLoading(false);
      setHasLoaded(true);
    }
    refetchOffers();
    return () => {
      cancelled = true;
    };
  }, [
    statusFilter,
    sourceFilter,
    minScore,
    sortBy,
    cvGenerated,
    clGenerated,
    withSalary,
    onlyStarred,
  ]);

  interface SectionBucket {
    count: number;
    count_after_filters: number;
    offers: UserOffer[];
    has_more: boolean;
  }
  interface AllOffersResponse {
    apply_now: SectionBucket;
    level_up: SectionBucket;
    applied: SectionBucket;
    client_withdrawn: SectionBucket;
    recruiter_rejected: SectionBucket;
    offer_received: SectionBucket;
    accepted: SectionBucket;
    new_skills_count?: number;
    status_change_counter?: number;
    status_change_counter_max?: number | null;
  }
  const EMPTY_BUCKET: SectionBucket = {
    count: 0,
    count_after_filters: 0,
    offers: [],
    has_more: false,
  };
  interface FetchAllPages {
    pageApplyNow?: number;
    pageLevelUp?: number;
    pageApplied?: number;
    pageWithdrawn?: number;
    pageRejected?: number;
    pageOfferReceived?: number;
    pageAccepted?: number;
    knownNewSkillsCount?: number;
  }

  async function fetchAllOffers(
    pages: FetchAllPages = {},
  ): Promise<Partial<AllOffersResponse>> {
    const token = await getToken();
    if (!token) return {};
    const apiStatus =
      statusFilter === 'pending_apply'
        ? 'pending_apply|ai_rejected'
        : statusFilter;
    const params = new URLSearchParams({ status: apiStatus });
    if (!selfMode) params.append('client_id', client.id);
    if (sourceFilter !== 'all') params.append('source', sourceFilter);
    params.append('min_score', String(minScore));
    if (cvGenerated) params.append('generated_cv', 'true');
    if (clGenerated) params.append('generated_cl', 'true');
    if (!(sortBy === 'salary_delta' && !isPro))
      params.append('sort_by', sortBy);
    if (withSalary) params.append('with_salary', 'true');
    if (onlyStarred) params.append('is_starred', 'true');
    params.append('page_size', String(pageSize));
    params.append('page_apply_now', String(pages.pageApplyNow ?? 1));
    params.append('page_level_up', String(pages.pageLevelUp ?? 1));
    params.append('page_applied', String(pages.pageApplied ?? 1));
    params.append('page_client_withdrawn', String(pages.pageWithdrawn ?? 1));
    params.append('page_recruiter_rejected', String(pages.pageRejected ?? 1));
    params.append('page_offer_received', String(pages.pageOfferReceived ?? 1));
    params.append('page_accepted', String(pages.pageAccepted ?? 1));
    params.append('known_apply_count', String(knownApplyCountRef.current));
    params.append('known_level_up_count', String(knownLevelUpCountRef.current));
    params.append('known_applied_count', String(knownAppliedCountRef.current));
    params.append(
      'known_withdrawn_count',
      String(knownWithdrawnCountRef.current),
    );
    params.append(
      'known_recruiter_rejected_count',
      String(knownRejectedCountRef.current),
    );
    params.append(
      'known_offer_received_count',
      String(knownOfferReceivedCountRef.current),
    );
    params.append(
      'known_accepted_count',
      String(knownAcceptedCountRef.current),
    );
    if (pages.knownNewSkillsCount !== undefined)
      params.append(
        'known_new_skills_count',
        String(pages.knownNewSkillsCount),
      );
    try {
      const res = await fetch(`${API_BASE_URL}/v1/user-offers?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return {};
      const raw = (await res.json()) as Partial<AllOffersResponse>;
      return {
        apply_now: raw.apply_now,
        level_up: raw.level_up,
        applied: raw.applied,
        client_withdrawn: raw.client_withdrawn,
        recruiter_rejected: raw.recruiter_rejected,
        offer_received: raw.offer_received,
        accepted: raw.accepted,
        new_skills_count: raw.new_skills_count,
        status_change_counter: raw.status_change_counter,
        status_change_counter_max: raw.status_change_counter_max,
      };
    } catch {
      return {};
    }
  }

  function applyAllOffersResponse(result: Partial<AllOffersResponse>) {
    if (result.apply_now) {
      const b = result.apply_now;
      setApplySection({ offers: b.offers, count: b.count, countFiltered: b.count_after_filters, hasMore: b.has_more });
      knownApplyCountRef.current = b.count;
    }
    if (result.level_up) {
      const b = result.level_up;
      setLevelUpSection({ offers: b.offers, count: b.count, countFiltered: b.count_after_filters, hasMore: b.has_more });
      knownLevelUpCountRef.current = b.count;
    }
    if (result.applied) {
      const b = result.applied;
      setAppliedSection({ offers: b.offers, count: b.count, countFiltered: b.count_after_filters, hasMore: b.has_more });
      knownAppliedCountRef.current = b.count;
    }
    if (result.client_withdrawn) {
      const b = result.client_withdrawn;
      setWithdrawnSection({ offers: b.offers, count: b.count, countFiltered: b.count_after_filters, hasMore: b.has_more });
      knownWithdrawnCountRef.current = b.count;
    }
    if (result.recruiter_rejected) {
      const b = result.recruiter_rejected;
      setRejectedSection({ offers: b.offers, count: b.count, countFiltered: b.count_after_filters, hasMore: b.has_more });
      knownRejectedCountRef.current = b.count;
    }
    if (result.offer_received) {
      const b = result.offer_received;
      setOfferReceivedSection({ offers: b.offers, count: b.count, countFiltered: b.count_after_filters, hasMore: b.has_more });
      knownOfferReceivedCountRef.current = b.count;
    }
    if (result.accepted) {
      const b = result.accepted;
      setAcceptedSection({ offers: b.offers, count: b.count, countFiltered: b.count_after_filters, hasMore: b.has_more });
      knownAcceptedCountRef.current = b.count;
    }
    if (result.status_change_counter !== undefined) {
      setStatusChangeCounter(result.status_change_counter);
    }
    if (result.status_change_counter_max !== undefined) {
      setStatusChangeCounterMax(result.status_change_counter_max ?? null);
    }
  }

  async function handleToggle() {
    const opening = !isOpen;
    setIsOpen(opening);
    if (opening && !hasLoaded) {
      setIsLoading(true);
      const result = await fetchAllOffers();
      applyAllOffersResponse(result);
      setIsLoading(false);
      setHasLoaded(true);
    }
  }

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingApplyNow, setIsLoadingApplyNow] = useState(false);
  const [isLoadingLevelUp, setIsLoadingLevelUp] = useState(false);
  const [isLoadingApplied, setIsLoadingApplied] = useState(false);
  const [isLoadingWithdrawn, setIsLoadingWithdrawn] = useState(false);
  const [isLoadingRejected, setIsLoadingRejected] = useState(false);
  const [isLoadingOfferReceived, setIsLoadingOfferReceived] = useState(false);
  const [isLoadingAccepted, setIsLoadingAccepted] = useState(false);

  const hasOffersRef = useRef(false);
  useEffect(() => {
    hasOffersRef.current =
      applySection.offers.length > 0 ||
      levelUpSection.offers.length > 0 ||
      appliedSection.offers.length > 0 ||
      withdrawnSection.offers.length > 0 ||
      rejectedSection.offers.length > 0 ||
      offerReceivedSection.offers.length > 0 ||
      acceptedSection.offers.length > 0;
  }, [
    applySection,
    levelUpSection,
    appliedSection,
    withdrawnSection,
    rejectedSection,
    offerReceivedSection,
    acceptedSection,
  ]);

  async function handleRefresh(sectionKey?: string) {
    setIsRefreshing(true);

    // Section-scoped refresh: only when a specific section is clicked in status=all view
    if (sectionKey && statusFilter === 'all') {
      const isPendingGroup =
        sectionKey === 'apply_now' || sectionKey === 'level_up';
      if (isPendingGroup) {
        setIsLoadingApplyNow(true);
        setIsLoadingLevelUp(true);
        setHasNewApply(false);
        setHasNewLevelUp(false);
      } else if (sectionKey === 'applied') {
        setIsLoadingApplied(true);
        setHasNewApplied(false);
      } else if (sectionKey === 'withdrawn') {
        setIsLoadingWithdrawn(true);
        setHasNewWithdrawn(false);
      } else if (sectionKey === 'rejected') {
        setIsLoadingRejected(true);
        setHasNewRejected(false);
      } else if (sectionKey === 'offer_received') {
        setIsLoadingOfferReceived(true);
        setHasNewOfferReceived(false);
      } else if (sectionKey === 'accepted') {
        setIsLoadingAccepted(true);
        setHasNewAccepted(false);
      }

      const sectionStatusMap: Record<string, string> = {
        apply_now: 'pending_apply|ai_rejected',
        level_up: 'pending_apply|ai_rejected',
        applied: 'applied',
        withdrawn: 'client_withdrawn',
        rejected: 'recruiter_rejected',
        offer_received: 'offer_received',
        accepted: 'accepted',
      };
      const sectionStatus = sectionStatusMap[sectionKey] ?? 'all';

      const token = await getToken();
      if (token) {
        const params = new URLSearchParams({ status: sectionStatus });
        if (!selfMode) params.append('client_id', client.id);
        if (sourceFilter !== 'all') params.append('source', sourceFilter);
        params.append('min_score', String(minScore));
        if (cvGenerated) params.append('generated_cv', 'true');
        if (clGenerated) params.append('generated_cl', 'true');
        if (!(sortBy === 'salary_delta' && !isPro))
          params.append('sort_by', sortBy);
        if (withSalary) params.append('with_salary', 'true');
        if (onlyStarred) params.append('is_starred', 'true');
        params.append('page_size', String(pageSize));
        if (isPendingGroup) {
          setPageApplyNow(1);
          setPageLevelUp(1);
          params.append('page_apply_now', '1');
          params.append('page_level_up', '1');
        } else if (sectionKey === 'applied') {
          setPageApplied(1);
          params.append('page_applied', '1');
        } else if (sectionKey === 'withdrawn') {
          setPageWithdrawn(1);
          params.append('page_client_withdrawn', '1');
        } else if (sectionKey === 'rejected') {
          setPageRejected(1);
          params.append('page_recruiter_rejected', '1');
        } else if (sectionKey === 'offer_received') {
          setPageOfferReceived(1);
          params.append('page_offer_received', '1');
        } else if (sectionKey === 'accepted') {
          setPageAccepted(1);
          params.append('page_accepted', '1');
        }
        try {
          const res = await fetch(`${API_BASE_URL}/v1/user-offers?${params}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const raw = (await res.json()) as Partial<AllOffersResponse>;
            if (isPendingGroup) {
              const applyBucket = raw.apply_now ?? EMPTY_BUCKET;
              const levelBucket = raw.level_up ?? EMPTY_BUCKET;
              setApplySection({ offers: applyBucket.offers, count: applyBucket.count, countFiltered: applyBucket.count_after_filters, hasMore: applyBucket.has_more });
              knownApplyCountRef.current = applyBucket.count;
              setLevelUpSection({ offers: levelBucket.offers, count: levelBucket.count, countFiltered: levelBucket.count_after_filters, hasMore: levelBucket.has_more });
              knownLevelUpCountRef.current = levelBucket.count;
            } else if (sectionKey === 'applied') {
              const b = raw.applied ?? EMPTY_BUCKET;
              setAppliedSection({ offers: b.offers, count: b.count, countFiltered: b.count_after_filters, hasMore: b.has_more });
              knownAppliedCountRef.current = b.count;
            } else if (sectionKey === 'withdrawn') {
              const b = raw.client_withdrawn ?? EMPTY_BUCKET;
              setWithdrawnSection({ offers: b.offers, count: b.count, countFiltered: b.count_after_filters, hasMore: b.has_more });
              knownWithdrawnCountRef.current = b.count;
            } else if (sectionKey === 'rejected') {
              const b = raw.recruiter_rejected ?? EMPTY_BUCKET;
              setRejectedSection({ offers: b.offers, count: b.count, countFiltered: b.count_after_filters, hasMore: b.has_more });
              knownRejectedCountRef.current = b.count;
            } else if (sectionKey === 'offer_received') {
              const b = raw.offer_received ?? EMPTY_BUCKET;
              setOfferReceivedSection({ offers: b.offers, count: b.count, countFiltered: b.count_after_filters, hasMore: b.has_more });
              knownOfferReceivedCountRef.current = b.count;
            } else if (sectionKey === 'accepted') {
              const b = raw.accepted ?? EMPTY_BUCKET;
              setAcceptedSection({ offers: b.offers, count: b.count, countFiltered: b.count_after_filters, hasMore: b.has_more });
              knownAcceptedCountRef.current = b.count;
            }
          }
        } catch {
          // ignore, leave existing data in place
        }
      }

      setIsLoadingApplyNow(false);
      setIsLoadingLevelUp(false);
      setIsLoadingApplied(false);
      setIsLoadingWithdrawn(false);
      setIsLoadingRejected(false);
      setIsLoadingOfferReceived(false);
      setIsLoadingAccepted(false);
      setHasLoaded(true);
      setIsRefreshing(false);
      return;
    }

    // Global refresh (no sectionKey, or status filter is not 'all')
    const all = !sectionKey;
    if (all || sectionKey === 'apply_now') setIsLoadingApplyNow(true);
    if (all || sectionKey === 'level_up') setIsLoadingLevelUp(true);
    if (all || sectionKey === 'applied') setIsLoadingApplied(true);
    if (all || sectionKey === 'withdrawn') setIsLoadingWithdrawn(true);
    if (all || sectionKey === 'rejected') setIsLoadingRejected(true);
    if (all || sectionKey === 'offer_received') setIsLoadingOfferReceived(true);
    if (all || sectionKey === 'accepted') setIsLoadingAccepted(true);
    setHasNewApply(false);
    setHasNewLevelUp(false);
    setHasNewApplied(false);
    setHasNewWithdrawn(false);
    setHasNewRejected(false);
    setHasNewOfferReceived(false);
    setHasNewAccepted(false);
    setExpandedOfferId(null);
    setPageApplyNow(1);
    setPageLevelUp(1);
    setPageApplied(1);
    setPageWithdrawn(1);
    setPageRejected(1);
    setPageOfferReceived(1);
    setPageAccepted(1);
    const result = await fetchAllOffers();
    applyAllOffersResponse(result);
    setIsLoadingApplyNow(false);
    setIsLoadingLevelUp(false);
    setIsLoadingApplied(false);
    setIsLoadingWithdrawn(false);
    setIsLoadingRejected(false);
    setIsLoadingOfferReceived(false);
    setIsLoadingAccepted(false);
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
    if (loadMoreApplyInProgress.current) return;
    loadMoreApplyInProgress.current = true;
    setApplyLoadingMore(true);
    try {
      const next = pageApplyNow + 1;
      const result = await fetchAllOffers({
        pageApplyNow: next,
        pageLevelUp: 1,
        pageApplied: 1,
        pageWithdrawn: 1,
        pageRejected: 1,
        pageOfferReceived: 1,
        pageAccepted: 1,
      });
      const applyMore = result.apply_now ?? EMPTY_BUCKET;
      setApplySection(prev => ({ ...prev, offers: [...prev.offers, ...applyMore.offers], hasMore: applyMore.has_more }));
      setPageApplyNow(next);
    } finally {
      setApplyLoadingMore(false);
      loadMoreApplyInProgress.current = false;
    }
  }

  async function handleLoadMoreLevelUp() {
    if (loadMoreLevelUpInProgress.current) return;
    loadMoreLevelUpInProgress.current = true;
    setLevelUpLoadingMore(true);
    try {
      const next = pageLevelUp + 1;
      const result = await fetchAllOffers({
        pageApplyNow: 1,
        pageLevelUp: next,
        pageApplied: 1,
        pageWithdrawn: 1,
        pageRejected: 1,
        pageOfferReceived: 1,
        pageAccepted: 1,
      });
      const levelMore = result.level_up ?? EMPTY_BUCKET;
      setLevelUpSection(prev => ({ ...prev, offers: [...prev.offers, ...levelMore.offers], hasMore: levelMore.has_more }));
      setPageLevelUp(next);
    } finally {
      setLevelUpLoadingMore(false);
      loadMoreLevelUpInProgress.current = false;
    }
  }

  async function handleLoadMoreApplied() {
    if (loadMoreAppliedInProgress.current) return;
    loadMoreAppliedInProgress.current = true;
    setAppliedLoadingMore(true);
    try {
      const next = pageApplied + 1;
      const result = await fetchAllOffers({
        pageApplyNow: 1,
        pageLevelUp: 1,
        pageApplied: next,
        pageWithdrawn: 1,
        pageRejected: 1,
        pageOfferReceived: 1,
        pageAccepted: 1,
      });
      const appliedMore = result.applied ?? EMPTY_BUCKET;
      setAppliedSection(prev => ({ ...prev, offers: [...prev.offers, ...appliedMore.offers], hasMore: appliedMore.has_more }));
      setPageApplied(next);
    } finally {
      setAppliedLoadingMore(false);
      loadMoreAppliedInProgress.current = false;
    }
  }

  async function handleLoadMoreWithdrawn() {
    if (loadMoreWithdrawnInProgress.current) return;
    loadMoreWithdrawnInProgress.current = true;
    setWithdrawnLoadingMore(true);
    try {
      const next = pageWithdrawn + 1;
      const result = await fetchAllOffers({
        pageApplyNow: 1,
        pageLevelUp: 1,
        pageApplied: 1,
        pageWithdrawn: next,
        pageRejected: 1,
        pageOfferReceived: 1,
        pageAccepted: 1,
      });
      const withdrawnMore = result.client_withdrawn ?? EMPTY_BUCKET;
      setWithdrawnSection(prev => ({ ...prev, offers: [...prev.offers, ...withdrawnMore.offers], hasMore: withdrawnMore.has_more }));
      setPageWithdrawn(next);
    } finally {
      setWithdrawnLoadingMore(false);
      loadMoreWithdrawnInProgress.current = false;
    }
  }

  async function handleLoadMoreRejected() {
    if (loadMoreRejectedInProgress.current) return;
    loadMoreRejectedInProgress.current = true;
    setRejectedLoadingMore(true);
    try {
      const next = pageRejected + 1;
      const result = await fetchAllOffers({
        pageApplyNow: 1,
        pageLevelUp: 1,
        pageApplied: 1,
        pageWithdrawn: 1,
        pageRejected: next,
        pageOfferReceived: 1,
        pageAccepted: 1,
      });
      const rejectedMore = result.recruiter_rejected ?? EMPTY_BUCKET;
      setRejectedSection(prev => ({ ...prev, offers: [...prev.offers, ...rejectedMore.offers], hasMore: rejectedMore.has_more }));
      setPageRejected(next);
    } finally {
      setRejectedLoadingMore(false);
      loadMoreRejectedInProgress.current = false;
    }
  }

  async function handleLoadMoreOfferReceived() {
    if (loadMoreOfferReceivedInProgress.current) return;
    loadMoreOfferReceivedInProgress.current = true;
    setOfferReceivedLoadingMore(true);
    try {
      const next = pageOfferReceived + 1;
      const result = await fetchAllOffers({
        pageApplyNow: 1,
        pageLevelUp: 1,
        pageApplied: 1,
        pageWithdrawn: 1,
        pageRejected: 1,
        pageOfferReceived: next,
        pageAccepted: 1,
      });
      const offerReceivedMore = result.offer_received ?? EMPTY_BUCKET;
      setOfferReceivedSection(prev => ({ ...prev, offers: [...prev.offers, ...offerReceivedMore.offers], hasMore: offerReceivedMore.has_more }));
      setPageOfferReceived(next);
    } finally {
      setOfferReceivedLoadingMore(false);
      loadMoreOfferReceivedInProgress.current = false;
    }
  }

  async function handleLoadMoreAccepted() {
    if (loadMoreAcceptedInProgress.current) return;
    loadMoreAcceptedInProgress.current = true;
    setAcceptedLoadingMore(true);
    try {
      const next = pageAccepted + 1;
      const result = await fetchAllOffers({
        pageApplyNow: 1,
        pageLevelUp: 1,
        pageApplied: 1,
        pageWithdrawn: 1,
        pageRejected: 1,
        pageOfferReceived: 1,
        pageAccepted: next,
      });
      const acceptedMore = result.accepted ?? EMPTY_BUCKET;
      setAcceptedSection(prev => ({ ...prev, offers: [...prev.offers, ...acceptedMore.offers], hasMore: acceptedMore.has_more }));
      setPageAccepted(next);
    } finally {
      setAcceptedLoadingMore(false);
      loadMoreAcceptedInProgress.current = false;
    }
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

  // Polling param refs — mirror props/state so the stale setInterval closure always reads fresh values
  const pollStatusRef = useRef(statusFilter);
  pollStatusRef.current = statusFilter;
  const pollMinScoreRef = useRef(minScore);
  pollMinScoreRef.current = minScore;
  const pollSortByRef = useRef(sortBy);
  pollSortByRef.current = sortBy;
  const pollWithSalaryRef = useRef(withSalary);
  pollWithSalaryRef.current = withSalary;
  const pollOnlyStarredRef = useRef(onlyStarred);
  pollOnlyStarredRef.current = onlyStarred;
  const pollPageSizeRef = useRef(pageSize);
  pollPageSizeRef.current = pageSize;
  const pollPageApplyNowRef = useRef(pageApplyNow);
  pollPageApplyNowRef.current = pageApplyNow;
  const pollPageLevelUpRef = useRef(pageLevelUp);
  pollPageLevelUpRef.current = pageLevelUp;
  const pollPageAppliedRef = useRef(pageApplied);
  pollPageAppliedRef.current = pageApplied;
  const pollPageWithdrawnRef = useRef(pageWithdrawn);
  pollPageWithdrawnRef.current = pageWithdrawn;
  const pollPageRejectedRef = useRef(pageRejected);
  pollPageRejectedRef.current = pageRejected;
  const pollPageOfferReceivedRef = useRef(pageOfferReceived);
  pollPageOfferReceivedRef.current = pageOfferReceived;
  const pollPageAcceptedRef = useRef(pageAccepted);
  pollPageAcceptedRef.current = pageAccepted;

  useEffect(() => {
    if (!selfMode) return;
    let interval: ReturnType<typeof setInterval> | null = null;
    fetchAllOffers().then(result => {
      applyAllOffersResponse(result);
      interval = setInterval(async () => {
        // Capture known counts before fetch so we can compare after
        const oldApply = knownApplyCountRef.current;
        const oldLevelUp = knownLevelUpCountRef.current;
        const oldApplied = knownAppliedCountRef.current;
        const oldWithdrawn = knownWithdrawnCountRef.current;
        const oldRejected = knownRejectedCountRef.current;
        const oldOfferReceived = knownOfferReceivedCountRef.current;
        const oldAccepted = knownAcceptedCountRef.current;

        // Build request from refs so polling always uses current param values
        const pollToken = await getToken();
        if (!pollToken) return;
        const pollApiStatus =
          pollStatusRef.current === 'pending_apply'
            ? 'pending_apply|ai_rejected'
            : pollStatusRef.current;
        const pollParams = new URLSearchParams({ status: pollApiStatus });
        if (!selfMode) pollParams.append('client_id', client.id);
        if (sourceFilter !== 'all') pollParams.append('source', sourceFilter);
        pollParams.append('min_score', String(pollMinScoreRef.current));
        if (cvGenerated) pollParams.append('generated_cv', 'true');
        if (clGenerated) pollParams.append('generated_cl', 'true');
        if (!(pollSortByRef.current === 'salary_delta' && !isPro))
          pollParams.append('sort_by', pollSortByRef.current);
        if (pollWithSalaryRef.current) pollParams.append('with_salary', 'true');
        if (pollOnlyStarredRef.current) pollParams.append('is_starred', 'true');
        pollParams.append('page_size', String(pollPageSizeRef.current));
        pollParams.append(
          'page_apply_now',
          String(pollPageApplyNowRef.current),
        );
        pollParams.append('page_level_up', String(pollPageLevelUpRef.current));
        pollParams.append('page_applied', String(pollPageAppliedRef.current));
        pollParams.append(
          'page_client_withdrawn',
          String(pollPageWithdrawnRef.current),
        );
        pollParams.append(
          'page_recruiter_rejected',
          String(pollPageRejectedRef.current),
        );
        pollParams.append(
          'page_offer_received',
          String(pollPageOfferReceivedRef.current),
        );
        pollParams.append('page_accepted', String(pollPageAcceptedRef.current));
        pollParams.append(
          'known_apply_count',
          String(knownApplyCountRef.current),
        );
        pollParams.append(
          'known_level_up_count',
          String(knownLevelUpCountRef.current),
        );
        pollParams.append(
          'known_applied_count',
          String(knownAppliedCountRef.current),
        );
        pollParams.append(
          'known_withdrawn_count',
          String(knownWithdrawnCountRef.current),
        );
        pollParams.append(
          'known_recruiter_rejected_count',
          String(knownRejectedCountRef.current),
        );
        pollParams.append(
          'known_offer_received_count',
          String(knownOfferReceivedCountRef.current),
        );
        pollParams.append(
          'known_accepted_count',
          String(knownAcceptedCountRef.current),
        );
        if (knownNewSkillsCountRef.current !== null)
          pollParams.append(
            'known_new_skills_count',
            String(knownNewSkillsCountRef.current),
          );

        let polled: AllOffersResponse;
        try {
          const pollRes = await fetch(
            `${API_BASE_URL}/v1/user-offers?${pollParams}`,
            {
              headers: { Authorization: `Bearer ${pollToken}` },
            },
          );
          if (!pollRes.ok) return;
          const pollRaw = (await pollRes.json()) as Partial<AllOffersResponse>;
          polled = {
            apply_now: pollRaw.apply_now ?? EMPTY_BUCKET,
            level_up: pollRaw.level_up ?? EMPTY_BUCKET,
            applied: pollRaw.applied ?? EMPTY_BUCKET,
            client_withdrawn: pollRaw.client_withdrawn ?? EMPTY_BUCKET,
            recruiter_rejected: pollRaw.recruiter_rejected ?? EMPTY_BUCKET,
            offer_received: pollRaw.offer_received ?? EMPTY_BUCKET,
            accepted: pollRaw.accepted ?? EMPTY_BUCKET,
            new_skills_count: pollRaw.new_skills_count,
          };
        } catch {
          return;
        }

        if (
          polled.new_skills_count !== undefined &&
          polled.new_skills_count > (knownNewSkillsCountRef.current ?? 0)
        ) {
          setHasNewSkills(true);
        }
        if (polled.new_skills_count !== undefined) {
          knownNewSkillsCountRef.current = polled.new_skills_count;
        }

        // Blue dots: compare polled counts with known counts captured before this fetch
        if (polled.apply_now.count !== oldApply) setHasNewApply(true);
        if (polled.level_up.count !== oldLevelUp) setHasNewLevelUp(true);
        if (polled.applied.count !== oldApplied) setHasNewApplied(true);
        if (polled.client_withdrawn.count !== oldWithdrawn)
          setHasNewWithdrawn(true);
        if (polled.recruiter_rejected.count !== oldRejected)
          setHasNewRejected(true);
        if (polled.offer_received.count !== oldOfferReceived)
          setHasNewOfferReceived(true);
        if (polled.accepted.count !== oldAccepted) setHasNewAccepted(true);

        // Update counts and known refs (does not reset offer arrays or pages)
        setApplySection(prev => ({ ...prev, count: polled.apply_now.count, countFiltered: polled.apply_now.count_after_filters }));
        knownApplyCountRef.current = polled.apply_now.count;

        setLevelUpSection(prev => ({ ...prev, count: polled.level_up.count, countFiltered: polled.level_up.count_after_filters }));
        knownLevelUpCountRef.current = polled.level_up.count;

        setAppliedSection(prev => ({ ...prev, count: polled.applied.count, countFiltered: polled.applied.count_after_filters }));
        knownAppliedCountRef.current = polled.applied.count;

        setWithdrawnSection(prev => ({ ...prev, count: polled.client_withdrawn.count, countFiltered: polled.client_withdrawn.count_after_filters }));
        knownWithdrawnCountRef.current = polled.client_withdrawn.count;

        setRejectedSection(prev => ({ ...prev, count: polled.recruiter_rejected.count, countFiltered: polled.recruiter_rejected.count_after_filters }));
        knownRejectedCountRef.current = polled.recruiter_rejected.count;

        setOfferReceivedSection(prev => ({ ...prev, count: polled.offer_received.count, countFiltered: polled.offer_received.count_after_filters }));
        knownOfferReceivedCountRef.current = polled.offer_received.count;

        setAcceptedSection(prev => ({ ...prev, count: polled.accepted.count, countFiltered: polled.accepted.count_after_filters }));
        knownAcceptedCountRef.current = polled.accepted.count;

        // Populate arrays on 0→N transitions
        if (oldApply === 0 && polled.apply_now.count > 0) {
          setApplySection(prev => ({ ...prev, offers: polled.apply_now.offers, hasMore: polled.apply_now.has_more }));
          setPageApplyNow(1);
        }
        if (oldLevelUp === 0 && polled.level_up.count > 0) {
          setLevelUpSection(prev => ({ ...prev, offers: polled.level_up.offers, hasMore: polled.level_up.has_more }));
          setPageLevelUp(1);
        }
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
    setApplySection(prev => ({ ...prev, offers: patch(prev.offers) }));
    setLevelUpSection(prev => ({ ...prev, offers: patch(prev.offers) }));
    setAppliedSection(prev => ({ ...prev, offers: patch(prev.offers) }));
    setWithdrawnSection(prev => ({ ...prev, offers: patch(prev.offers) }));
    setRejectedSection(prev => ({ ...prev, offers: patch(prev.offers) }));
    setOfferReceivedSection(prev => ({ ...prev, offers: patch(prev.offers) }));
    setAcceptedSection(prev => ({ ...prev, offers: patch(prev.offers) }));
  }

  function handleClUpdate(offerId: string, clUrl: string, clStatus: string) {
    const patch = (offers: UserOffer[]) =>
      offers.map(o =>
        o.user_offer_id === offerId
          ? { ...o, cl_url: clUrl, cl_status: clStatus }
          : o,
      );
    setApplySection(prev => ({ ...prev, offers: patch(prev.offers) }));
    setLevelUpSection(prev => ({ ...prev, offers: patch(prev.offers) }));
    setAppliedSection(prev => ({ ...prev, offers: patch(prev.offers) }));
    setWithdrawnSection(prev => ({ ...prev, offers: patch(prev.offers) }));
    setRejectedSection(prev => ({ ...prev, offers: patch(prev.offers) }));
    setOfferReceivedSection(prev => ({ ...prev, offers: patch(prev.offers) }));
    setAcceptedSection(prev => ({ ...prev, offers: patch(prev.offers) }));
  }

  function handleSalaryUpdate(userOfferId: string, salary: OfferSalary) {
    const patch = (offers: UserOffer[]) =>
      (offers ?? []).map(o =>
        o.user_offer_id === userOfferId ? { ...o, salary: [salary] } : o,
      );
    setApplySection(prev => ({ ...prev, offers: patch(prev.offers) }));
    setLevelUpSection(prev => ({ ...prev, offers: patch(prev.offers) }));
    setAppliedSection(prev => ({ ...prev, offers: patch(prev.offers) }));
    setWithdrawnSection(prev => ({ ...prev, offers: patch(prev.offers) }));
    setRejectedSection(prev => ({ ...prev, offers: patch(prev.offers) }));
    setOfferReceivedSection(prev => ({ ...prev, offers: patch(prev.offers) }));
    setAcceptedSection(prev => ({ ...prev, offers: patch(prev.offers) }));
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

  async function handleDirectUpgradeCheckout() {
    if (upgradeTabRemovedListenerRef.current) {
      chrome.tabs.onRemoved.removeListener(
        upgradeTabRemovedListenerRef.current,
      );
      upgradeTabRemovedListenerRef.current = null;
    }
    setUpgradeCheckoutLoading(true);
    setUpgradeCheckoutError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/v1/subscription/checkout`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = (await res.json()) as { url: string };
      const tab = await chrome.tabs.create({ url: data.url });
      upgradeCheckoutTabIdRef.current = tab.id ?? null;

      function onTabRemoved(tabId: number) {
        if (tabId === upgradeCheckoutTabIdRef.current) {
          upgradeCheckoutTabIdRef.current = null;
          setUpgradeCheckoutLoading(false);
          if (upgradeTabRemovedListenerRef.current) {
            chrome.tabs.onRemoved.removeListener(
              upgradeTabRemovedListenerRef.current,
            );
            upgradeTabRemovedListenerRef.current = null;
          }
        }
      }

      upgradeTabRemovedListenerRef.current = onTabRemoved;
      chrome.tabs.onRemoved.addListener(onTabRemoved);
    } catch {
      setUpgradeCheckoutError('Something went wrong. Please try again.');
      setUpgradeCheckoutLoading(false);
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
      applySection.offers
        .filter(o => (o.claude_score ?? 0) >= minScore)
        .filter(o => !cvGenerated || o.cv_status === 'done')
        .filter(o => !clGenerated || o.cl_status === 'done'),
    [applySection.offers, minScore, cvGenerated, clGenerated],
  );
  const filteredLevelUpOffers = useMemo(
    () =>
      levelUpSection.offers
        .filter(o => (o.claude_score ?? 0) >= minScore)
        .filter(o => !cvGenerated || o.cv_status === 'done')
        .filter(o => !clGenerated || o.cl_status === 'done'),
    [levelUpSection.offers, minScore, cvGenerated, clGenerated],
  );

  function renderSection(opts: {
    title: string;
    sectionKey: string;
    offers: UserOffer[];
    count: number;
    countFiltered: number;
    hasMore: boolean;
    loadingMore: boolean;
    isOpen: boolean;
    hasNew: boolean;
    isLoadingSection: boolean;
    setOpen: (v: boolean) => void;
    onLoadMore: () => void;
    badgeColor: string;
    setOffers: React.Dispatch<React.SetStateAction<UserOffer[]>>;
    setCountFiltered: React.Dispatch<React.SetStateAction<number>>;
    emptyMessage?: string;
  }) {
    const {
      title,
      sectionKey,
      offers,
      count,
      countFiltered,
      hasMore,
      loadingMore,
      isOpen: sectionOpen,
      hasNew,
      isLoadingSection,
      setOpen,
      onLoadMore,
      badgeColor,
      setCountFiltered,
      setOffers,
      emptyMessage,
    } = opts;
    return (
      <div className="border-b border-gray-100 last:border-b-0">
        <button
          type="button"
          onClick={() => setOpen(!sectionOpen)}
          className="w-full flex items-center justify-between py-2 px-0 transition-colors text-left sticky top-0 z-10 bg-gray-50 border-b border-gray-200"
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
              {title}
            </span>
            <span
              className={`text-xs font-medium px-1.5 py-0.5 rounded ${badgeColor}`}
            >
              {countFiltered}/{count}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                void handleRefresh(sectionKey);
              }}
              disabled={isRefreshing || !hasLoaded}
              title="Refresh"
              className="relative text-gray-500 hover:text-gray-700 disabled:opacity-40 p-0.5 leading-none"
            >
              {isLoadingSection ? (
                <Spinner size={13} />
              ) : (
                <ArrowsClockwise size={13} />
              )}
              {hasNew && hasLoaded && !isLoadingSection && (
                <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-blue-500" />
              )}
            </button>
            <CaretDown
              size={14}
              className={`text-gray-400 transition-transform ${sectionOpen ? 'rotate-180' : ''}`}
            />
          </div>
        </button>
        {sectionOpen && (
          <div>
            {isLoadingSection ? (
              <div className="flex items-center justify-center py-6">
                <Spinner className="text-indigo-600" />
              </div>
            ) : offers.length === 0 ? (
              <p className="py-3 text-gray-400 text-xs">
                {emptyMessage ?? 'No offers found.'}
              </p>
            ) : (
              <>
                {sortOffers(offers, sortBy).map(offer => (
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
                        ? () => void handleCardToggle(offer, offer.offer_url)
                        : undefined
                    }
                    activeTabId={activeTabId}
                    onRemove={id =>
                      setOffers(prev =>
                        prev.filter(o => o.user_offer_id !== id),
                      )
                    }
                    onRollback={o => setOffers(prev => [...prev, o])}
                    onError={setStatusError}
                    onStatusChange402={() => setStatusChangeLimitHit(true)}
                    onCvUpdate={handleCvUpdate}
                    onClUpdate={handleClUpdate}
                    onSalaryUpdate={handleSalaryUpdate}
                    onStarToggle={async (id, starred) => {
                      try {
                        const token = await getToken();
                        const res = await fetch(
                          `${API_BASE_URL}/v1/user-offers/${id}/star`,
                          {
                            method: 'PATCH',
                            headers: token
                              ? { Authorization: `Bearer ${token}` }
                              : {},
                          },
                        );
                        if (res.ok) {
                          if (onlyStarred && !starred) {
                            setOffers(prev =>
                              prev.filter(o => o.user_offer_id !== id),
                            );
                            setCountFiltered(prev => Math.max(0, prev - 1));
                          } else {
                            setOffers(prev =>
                              prev.map(o =>
                                o.user_offer_id === id
                                  ? { ...o, is_starred: starred }
                                  : o,
                              ),
                            );
                          }
                          // Sync to page offer if same offer
                          if (pageOffer?.user_offer_id === id) {
                            setPageOffer(p =>
                              p ? { ...p, is_starred: starred } : null,
                            );
                          }
                        }
                      } catch {
                        /* ignore */
                      }
                    }}
                    candidateSkills={candidateSkills}
                    isOfferLoading={isLoading}
                    selfMode={selfMode}
                    isCurrentPageOffer={
                      offer.user_offer_id === pageOffer?.user_offer_id
                    }
                    onScrollToPageOffer={handleScrollToPageOffer}
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
                  />
                ))}
                {hasMore && (
                  <div className="flex justify-center py-2">
                    <button
                      type="button"
                      onClick={() => void onLoadMore()}
                      disabled={loadingMore}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white text-gray-600 hover:text-gray-800 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
                    >
                      {loadingMore && (
                        <Spinner size={11} className="text-gray-500" />
                      )}
                      {loadingMore ? 'Loading…' : 'Show more'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    );
  }

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
            {!selfMode && (!hasLoaded || isLoading) && (
              <Spinner size={12} className="text-gray-400" />
            )}
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
          {(statusChangeLimitHit ||
            (statusChangeCounterMax !== null &&
              statusChangeCounter > statusChangeCounterMax)) && (
            <PlanLimitBanner
              onButtonClick={() => setUpgradeDrawerOpen(true)}
              buttonText="Upgrade to Pro"
              closable
              onClose={() => setStatusChangeLimitHit(false)}
            >
              <p className="text-xs text-gray-500">
                You've used all {statusChangeCounterMax} free status changes.
                Upgrade to Pro to continue.
              </p>
            </PlanLimitBanner>
          )}
          <>
            {/* Salary delta upsell */}
            {showSalaryDeltaBanner && !isPro && (
              <PlanLimitBanner
                onButtonClick={() => setUpgradeDrawerOpen(true)}
                buttonText="Upgrade to Pro"
                closable
                onClose={() => setShowSalaryDeltaBanner(false)}
                withMX={false}
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
                    onRemove={() => {}}
                    onRollback={() => {}}
                    onError={setStatusError}
                    onStatusChange402={() => setStatusChangeLimitHit(true)}
                    onStatusChanged={(_id, newStatus) =>
                      setPageOffer(prev =>
                        prev ? { ...prev, status: newStatus } : null,
                      )
                    }
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
                    statusChangeCounterMax={statusChangeCounterMax}
                    onUpgradeClick={() => void handleDirectUpgradeCheckout()}
                    onRegisterUpgradeRetry={fn => {
                      upgradeRetryRef.current = fn;
                    }}
                    upgradeCheckoutLoading={upgradeCheckoutLoading}
                    upgradeCheckoutError={upgradeCheckoutError}
                    onStarToggle={async (id, starred) => {
                      const prev = pageOffer?.is_starred;
                      setPageOffer(p =>
                        p ? { ...p, is_starred: starred } : null,
                      );
                      try {
                        const token = await getToken();
                        const res = await fetch(
                          `${API_BASE_URL}/v1/user-offers/${id}/star`,
                          {
                            method: 'PATCH',
                            headers: token
                              ? { Authorization: `Bearer ${token}` }
                              : {},
                          },
                        );
                        if (res.ok) {
                          // Sync to all section arrays
                          const patch = (offers: UserOffer[]) =>
                            offers.map(o =>
                              o.user_offer_id === id
                                ? { ...o, is_starred: starred }
                                : o,
                            );
                          setApplySection(prev => ({ ...prev, offers: patch(prev.offers) }));
                          setLevelUpSection(prev => ({ ...prev, offers: patch(prev.offers) }));
                          setAppliedSection(prev => ({ ...prev, offers: patch(prev.offers) }));
                          setWithdrawnSection(prev => ({ ...prev, offers: patch(prev.offers) }));
                          setRejectedSection(prev => ({ ...prev, offers: patch(prev.offers) }));
                          setOfferReceivedSection(prev => ({ ...prev, offers: patch(prev.offers) }));
                          setAcceptedSection(prev => ({ ...prev, offers: patch(prev.offers) }));
                        } else {
                          setPageOffer(p =>
                            p ? { ...p, is_starred: prev } : null,
                          );
                        }
                      } catch {
                        setPageOffer(p =>
                          p ? { ...p, is_starred: prev } : null,
                        );
                      }
                    }}
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
              {(() => {
                const showApplyNow =
                  statusFilter === 'all' || statusFilter === 'pending_apply';
                const showLevelUp =
                  statusFilter === 'all' || statusFilter === 'pending_apply';
                const showApplied =
                  statusFilter === 'all' || statusFilter === 'applied';
                const showWithdrawn =
                  statusFilter === 'all' ||
                  statusFilter === 'client_withdrawn' ||
                  statusFilter === 'agent_withdrawn';
                const showRejected =
                  statusFilter === 'all' ||
                  statusFilter === 'recruiter_rejected';
                const showOfferReceived =
                  statusFilter === 'all' || statusFilter === 'offer_received';
                const showAccepted =
                  statusFilter === 'all' || statusFilter === 'accepted';
                return (
                  <>
                    {showApplyNow &&
                      renderSection({
                        title: 'Apply now',
                        sectionKey: 'apply_now',
                        isLoadingSection: isLoadingApplyNow,
                        offers: filteredApplyOffers,
                        count: applySection.count,
                        countFiltered: applySection.countFiltered,
                        hasMore: applySection.hasMore,
                        loadingMore: applyLoadingMore,
                        isOpen: accordionOpen.apply_now,
                        hasNew: hasNewApply,
                        setOpen: v => setAccordionSection('apply_now', v),
                        onLoadMore: handleLoadMoreApply,
                        badgeColor: 'bg-blue-100 text-blue-800',
                        setOffers: (updater: React.SetStateAction<UserOffer[]>) => setApplySection(prev => ({ ...prev, offers: typeof updater === 'function' ? (updater as (p: UserOffer[]) => UserOffer[])(prev.offers) : updater })),
                        setCountFiltered: (updater: React.SetStateAction<number>) => setApplySection(prev => ({ ...prev, countFiltered: typeof updater === 'function' ? (updater as (p: number) => number)(prev.countFiltered) : updater })),
                        emptyMessage: selfMode
                          ? "We're scanning thousands of offers for you. Your matches will appear here shortly."
                          : 'No offers found.',
                      })}
                    {showLevelUp &&
                      renderSection({
                        title: 'Level up & earn more',
                        sectionKey: 'level_up',
                        isLoadingSection: isLoadingLevelUp,
                        offers: filteredLevelUpOffers,
                        count: levelUpSection.count,
                        countFiltered: levelUpSection.countFiltered,
                        hasMore: levelUpSection.hasMore,
                        loadingMore: levelUpLoadingMore,
                        isOpen: accordionOpen.level_up,
                        hasNew: hasNewLevelUp,
                        setOpen: v => setAccordionSection('level_up', v),
                        onLoadMore: handleLoadMoreLevelUp,
                        badgeColor: 'bg-orange-100 text-orange-800',
                        setOffers: (updater: React.SetStateAction<UserOffer[]>) => setLevelUpSection(prev => ({ ...prev, offers: typeof updater === 'function' ? (updater as (p: UserOffer[]) => UserOffer[])(prev.offers) : updater })),
                        setCountFiltered: (updater: React.SetStateAction<number>) => setLevelUpSection(prev => ({ ...prev, countFiltered: typeof updater === 'function' ? (updater as (p: number) => number)(prev.countFiltered) : updater })),
                      })}
                    {showApplied &&
                      renderSection({
                        title: 'Applied',
                        sectionKey: 'applied',
                        isLoadingSection: isLoadingApplied,
                        offers: appliedSection.offers,
                        count: appliedSection.count,
                        countFiltered: appliedSection.countFiltered,
                        hasMore: appliedSection.hasMore,
                        loadingMore: appliedLoadingMore,
                        isOpen: accordionOpen.applied,
                        hasNew: hasNewApplied,
                        setOpen: v => setAccordionSection('applied', v),
                        onLoadMore: handleLoadMoreApplied,
                        badgeColor: 'bg-green-100 text-green-800',
                        setOffers: (updater: React.SetStateAction<UserOffer[]>) => setAppliedSection(prev => ({ ...prev, offers: typeof updater === 'function' ? (updater as (p: UserOffer[]) => UserOffer[])(prev.offers) : updater })),
                        setCountFiltered: (updater: React.SetStateAction<number>) => setAppliedSection(prev => ({ ...prev, countFiltered: typeof updater === 'function' ? (updater as (p: number) => number)(prev.countFiltered) : updater })),
                      })}
                    {showWithdrawn &&
                      renderSection({
                        title: 'Withdrawn',
                        sectionKey: 'withdrawn',
                        isLoadingSection: isLoadingWithdrawn,
                        offers: withdrawnSection.offers,
                        count: withdrawnSection.count,
                        countFiltered: withdrawnSection.countFiltered,
                        hasMore: withdrawnSection.hasMore,
                        loadingMore: withdrawnLoadingMore,
                        isOpen: accordionOpen.client_withdrawn,
                        hasNew: hasNewWithdrawn,
                        setOpen: v => setAccordionSection('client_withdrawn', v),
                        onLoadMore: handleLoadMoreWithdrawn,
                        badgeColor: 'bg-gray-100 text-gray-600',
                        setOffers: (updater: React.SetStateAction<UserOffer[]>) => setWithdrawnSection(prev => ({ ...prev, offers: typeof updater === 'function' ? (updater as (p: UserOffer[]) => UserOffer[])(prev.offers) : updater })),
                        setCountFiltered: (updater: React.SetStateAction<number>) => setWithdrawnSection(prev => ({ ...prev, countFiltered: typeof updater === 'function' ? (updater as (p: number) => number)(prev.countFiltered) : updater })),
                      })}
                    {showRejected &&
                      renderSection({
                        title: 'Recruiter rejected',
                        sectionKey: 'rejected',
                        isLoadingSection: isLoadingRejected,
                        offers: rejectedSection.offers,
                        count: rejectedSection.count,
                        countFiltered: rejectedSection.countFiltered,
                        hasMore: rejectedSection.hasMore,
                        loadingMore: rejectedLoadingMore,
                        isOpen: accordionOpen.recruiter_rejected,
                        hasNew: hasNewRejected,
                        setOpen: v => setAccordionSection('recruiter_rejected', v),
                        onLoadMore: handleLoadMoreRejected,
                        badgeColor: 'bg-red-100 text-red-700',
                        setOffers: (updater: React.SetStateAction<UserOffer[]>) => setRejectedSection(prev => ({ ...prev, offers: typeof updater === 'function' ? (updater as (p: UserOffer[]) => UserOffer[])(prev.offers) : updater })),
                        setCountFiltered: (updater: React.SetStateAction<number>) => setRejectedSection(prev => ({ ...prev, countFiltered: typeof updater === 'function' ? (updater as (p: number) => number)(prev.countFiltered) : updater })),
                      })}
                    {showOfferReceived &&
                      renderSection({
                        title: 'Offer received',
                        sectionKey: 'offer_received',
                        isLoadingSection: isLoadingOfferReceived,
                        offers: offerReceivedSection.offers,
                        count: offerReceivedSection.count,
                        countFiltered: offerReceivedSection.countFiltered,
                        hasMore: offerReceivedSection.hasMore,
                        loadingMore: offerReceivedLoadingMore,
                        isOpen: accordionOpen.offer_received,
                        hasNew: hasNewOfferReceived,
                        setOpen: v => setAccordionSection('offer_received', v),
                        onLoadMore: handleLoadMoreOfferReceived,
                        badgeColor: 'bg-purple-100 text-purple-700',
                        setOffers: (updater: React.SetStateAction<UserOffer[]>) => setOfferReceivedSection(prev => ({ ...prev, offers: typeof updater === 'function' ? (updater as (p: UserOffer[]) => UserOffer[])(prev.offers) : updater })),
                        setCountFiltered: (updater: React.SetStateAction<number>) => setOfferReceivedSection(prev => ({ ...prev, countFiltered: typeof updater === 'function' ? (updater as (p: number) => number)(prev.countFiltered) : updater })),
                      })}
                    {showAccepted &&
                      renderSection({
                        title: 'Accepted',
                        sectionKey: 'accepted',
                        isLoadingSection: isLoadingAccepted,
                        offers: acceptedSection.offers,
                        count: acceptedSection.count,
                        countFiltered: acceptedSection.countFiltered,
                        hasMore: acceptedSection.hasMore,
                        loadingMore: acceptedLoadingMore,
                        isOpen: accordionOpen.accepted,
                        hasNew: hasNewAccepted,
                        setOpen: v => setAccordionSection('accepted', v),
                        onLoadMore: handleLoadMoreAccepted,
                        badgeColor: 'bg-teal-100 text-teal-700',
                        setOffers: (updater: React.SetStateAction<UserOffer[]>) => setAcceptedSection(prev => ({ ...prev, offers: typeof updater === 'function' ? (updater as (p: UserOffer[]) => UserOffer[])(prev.offers) : updater })),
                        setCountFiltered: (updater: React.SetStateAction<number>) => setAcceptedSection(prev => ({ ...prev, countFiltered: typeof updater === 'function' ? (updater as (p: number) => number)(prev.countFiltered) : updater })),
                      })}
                  </>
                );
              })()}
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
                    setApplySection(EMPTY_SECTION);
                    setLevelUpSection(EMPTY_SECTION);
                    setAppliedSection(EMPTY_SECTION);
                    setWithdrawnSection(EMPTY_SECTION);
                    setRejectedSection(EMPTY_SECTION);
                    setOfferReceivedSection(EMPTY_SECTION);
                    setAcceptedSection(EMPTY_SECTION);
                    knownApplyCountRef.current = 0;
                    knownLevelUpCountRef.current = 0;
                    knownAppliedCountRef.current = 0;
                    knownWithdrawnCountRef.current = 0;
                    knownRejectedCountRef.current = 0;
                    knownOfferReceivedCountRef.current = 0;
                    knownAcceptedCountRef.current = 0;
                    knownNewSkillsCountRef.current = 0;
                    setPageApplyNow(1);
                    setPageLevelUp(1);
                    setPageApplied(1);
                    setPageWithdrawn(1);
                    setPageRejected(1);
                    setPageOfferReceived(1);
                    setPageAccepted(1);
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
                        const result = await fetchAllOffers();
                        applyAllOffersResponse(result);
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
  const [withSalary, setWithSalary] = useState(false);
  const [onlyStarred, setOnlyStarred] = useState(false);

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
      if (result.hd_min_score !== undefined) {
        setMinScore(result.hd_min_score as number);
        setDebouncedMinScore(result.hd_min_score as number);
      }
    });
  }, []);

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    chrome.storage.local.get('hd_with_salary', result => {
      if (chrome.runtime.lastError) return;
      if (result.hd_with_salary) setWithSalary(true);
    });
  }, []);

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    chrome.storage.local.get('hd_only_starred', result => {
      if (chrome.runtime.lastError) return;
      if (result.hd_only_starred) setOnlyStarred(true);
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

  function handleOnlyStarredChange(value: boolean) {
    setOnlyStarred(value);
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ hd_only_starred: value });
    }
  }

  function handleSourceFilterChange(value: string) {
    setSourceFilter(value);
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ hd_source_filter: value });
    }
  }

  function handleMinScoreCommit(value: number) {
    setDebouncedMinScore(value);
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ hd_min_score: value });
    }
  }

  function handleWithSalaryChange(value: boolean) {
    setWithSalary(value);
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ hd_with_salary: value });
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
              onChange={e => setMinScore(Number(e.target.value))}
              onMouseUp={e =>
                handleMinScoreCommit(
                  Number((e.target as HTMLInputElement).value),
                )
              }
              onTouchEnd={e =>
                handleMinScoreCommit(
                  Number((e.target as HTMLInputElement).value),
                )
              }
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
                <option value="all">All</option>
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
              <label className="flex items-center gap-1.5 cursor-pointer text-gray-700">
                <input
                  type="checkbox"
                  checked={onlyStarred}
                  onChange={e => handleOnlyStarredChange(e.target.checked)}
                  className="w-4 h-4 accent-blue-600 cursor-pointer"
                />
                <Star size={16} />
              </label>
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
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={withSalary}
                  onChange={e => handleWithSalaryChange(e.target.checked)}
                  className="w-4 h-4 accent-blue-600 cursor-pointer"
                />
                <span className="text-xs text-gray-700">With salary</span>
              </label>
            </div>
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
              wizardPortalTarget={wizardPortalTarget}
              withSalary={withSalary}
              onlyStarred={onlyStarred}
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
                withSalary={withSalary}
                onlyStarred={onlyStarred}
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
