import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AddressBook,
  ArrowsClockwise,
  ArrowUp,
  CheckFatIcon,
  CurrencyCircleDollar,
  FilePlusIcon,
  PencilSimple,
  WarningIcon,
  X,
} from '@phosphor-icons/react';
import WizardShell from './onboarding/WizardShell';
import { emptyProfile } from './onboarding/emptyProfile';
import type { Profile } from './onboarding/types';
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
  unit?: string;
  type: string;
  delta: number;
  delta_normalized?: number;
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
  source?: string;
  cv_language?: string | null;
  cv_status?: string | null;
  cv_url?: string | null;
  cl_status?: string | null;
  cl_url?: string | null;
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
      .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  );
}

function formatSalaryType(type: string): string {
  if (type === 'contract') return 'Contr.';
  if (type === 'permanent') return 'Perm.';
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
  return { ...emptyProfile, ...((raw as Partial<Profile>) ?? {}) } as Profile;
}

interface Props {
  onLogout: () => void;
  activeTabId?: number;
  currentUrl?: string;
  selfMode?: boolean;
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
  onResetFilters?: () => void;
  defaultExpanded?: boolean;
  selfMode?: boolean;
}

interface OfferCardProps {
  offer: UserOffer;
  clientId: string;
  clientFirstName: string;
  clientLastName: string;
  candidateSkills: string[];
  isOpen: boolean;
  onToggle: () => void;
  activeTabId?: number;
  onRemove: (offerId: string) => void;
  onRollback: (offer: UserOffer) => void;
  onError: (message: string) => void;
  onCvUpdate: (offerId: string, cvUrl: string, cvStatus: string) => void;
  onClUpdate: (offerId: string, clUrl: string, clStatus: string) => void;
  onSalaryUpdate?: (userOfferId: string, salary: OfferSalary) => void;
  isOfferLoading: boolean;
}

function OfferCard({
  offer,
  clientId,
  clientFirstName,
  clientLastName,
  candidateSkills,
  isOpen,
  onToggle,
  activeTabId,
  onRemove,
  onRollback,
  onError,
  onCvUpdate,
  onClUpdate,
  onSalaryUpdate,
  isOfferLoading,
}: OfferCardProps) {
  const { getToken } = useAuth();
  const { generateCV } = useCvGenerate();
  const { settings: generalSettings } = useGeneralSettings();
  const FALLBACK_UNITS = ['hourly', 'monthly', 'annually'];
  const unitOptions = generalSettings?.employment_type_units ?? FALLBACK_UNITS;
  const currencyOptions = generalSettings?.currencies ?? [];

  const [editSalaryOpen, setEditSalaryOpen] = useState(false);
  const [salaryFrom, setSalaryFrom] = useState('');
  const [salaryTo, setSalaryTo] = useState('');
  const [salaryCurrency, setSalaryCurrency] = useState('');
  const [salaryUnit, setSalaryUnit] = useState('');
  const [salaryType, setSalaryType] = useState<'contract' | 'permanent'>('contract');
  const [salaryLoading, setSalaryLoading] = useState(false);
  const [salaryError, setSalaryError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isClGenerating, setIsClGenerating] = useState(false);
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
      if (result.error) setStatus({ type: 'error', message: result.error });
    } else {
      onCvUpdate(offer.user_offer_id, result.cvUrl, result.cvStatus);
    }
  }

  async function handleCvSelect(language: string) {
    setIsCvDropdownOpen(false);
    await handleGenerate(language);
  }

  async function handleGenerateCl(language: string) {
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
    if (!offer.offer_id) return;
    setSalaryLoading(true);
    setSalaryError(null);
    try {
      const token = await getToken();
      const res = await fetch(
        `${API_BASE_URL}/v1/offers/${offer.offer_id}/employment-types`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token ?? ''}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: Number(salaryFrom),
            to: Number(salaryTo),
            currency: salaryCurrency,
            unit: salaryUnit,
            type: salaryType,
          }),
        },
      );
      if (!res.ok) {
        setSalaryError('Failed to save salary. Please try again.');
        return;
      }
      const newSalary: OfferSalary = {
        min: Number(salaryFrom),
        max: Number(salaryTo),
        currency: salaryCurrency,
        unit: salaryUnit,
        type: salaryType,
        delta: 0,
        delta_normalized: 0,
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
          </div>
        )}
        {offer.required_skills && offer.required_skills.length > 0 && (
          <div className="flex flex-wrap gap-1">
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
          <div className="flex flex-wrap gap-1">
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
        {offer.claude_role_fit && (
          <p className="text-xs text-gray-600 leading-relaxed">
            {offer.claude_role_fit}
          </p>
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
                  <CurrencyCircleDollar size={16} className="shrink-0" />{' '}
                  {s.currency} {formatSalaryType(s.type)} {formatNum(s.min)} –{' '}
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
                    setSalaryUnit(unitOptions[0] ?? '');
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
                <span className="text-xs font-medium text-gray-700">Edit offer salary</span>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-500">From</label>
                    <input
                      type="number"
                      min={0}
                      required
                      value={salaryFrom}
                      onChange={e => setSalaryFrom(e.target.value)}
                      className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-green-500"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-500">To</label>
                    <input
                      type="number"
                      min={0}
                      required
                      value={salaryTo}
                      onChange={e => setSalaryTo(e.target.value)}
                      className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-green-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-500">Currency</label>
                    <select
                      required
                      value={salaryCurrency}
                      onChange={e => setSalaryCurrency(e.target.value)}
                      className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-green-500"
                    >
                      {currencyOptions.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-500">Unit</label>
                    <select
                      required
                      value={salaryUnit}
                      onChange={e => setSalaryUnit(e.target.value)}
                      className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-green-500"
                    >
                      {unitOptions.map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-500">Type</label>
                  <select
                    required
                    value={salaryType}
                    onChange={e => setSalaryType(e.target.value as 'contract' | 'permanent')}
                    className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-green-500"
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
                    {salaryLoading && <Spinner size={11} className="text-white" />}
                    Save
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Expanded: CV generation + Withdraw */}
      {isOpen && (
        <div className="px-3 pb-3 flex flex-col gap-2 border-t border-gray-100 pt-2">
          {statusLoading !== offer.user_offer_id && (
            <div className="flex gap-2 items-center">
              {/* CV dropdown */}
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
                          width: rect.width,
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
                    <svg
                      className={`w-4 h-4 text-white transition-transform ${isCvDropdownOpen ? 'rotate-180' : ''}`}
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
                )}
                {isCvDropdownOpen &&
                  createPortal(
                    <div
                      ref={cvPortalRef}
                      style={cvPortalStyle}
                      className="bg-white border border-gray-200 rounded-md shadow-lg overflow-hidden"
                    >
                      {[
                        { value: 'en', label: 'English' },
                        { value: 'pl', label: 'Polish' },
                      ].map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            handleCvSelect(opt.value);
                          }}
                          className="w-full text-left text-sm px-4 py-2 hover:bg-gray-100 transition-colors text-gray-700"
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>,
                    document.body,
                  )}
              </div>
              {/* Green CV button */}
              {!isGenerating && offer.cv_status === 'done' && offer.cv_url && (
                <button
                  type="button"
                  onClick={() =>
                    chrome.tabs.create({
                      url: `${offer.cv_url}?t=${Date.now()}`,
                    })
                  }
                  className="shrink-0 flex items-center gap-1.5 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-medium py-2 px-3 rounded-md text-sm transition-colors"
                >
                  CV
                </button>
              )}
              {/* CL dropdown */}
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
                          width: rect.width,
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
                    <svg
                      className={`w-4 h-4 text-white transition-transform ${isClDropdownOpen ? 'rotate-180' : ''}`}
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
                )}
                {isClDropdownOpen &&
                  createPortal(
                    <div
                      ref={clPortalRef}
                      style={clPortalStyle}
                      className="bg-white border border-gray-200 rounded-md shadow-lg overflow-hidden"
                    >
                      {[
                        { value: 'en', label: 'English' },
                        { value: 'pl', label: 'Polish' },
                      ].map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            handleClSelect(opt.value);
                          }}
                          className="w-full text-left text-sm px-4 py-2 hover:bg-gray-100 transition-colors text-gray-700"
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>,
                    document.body,
                  )}
              </div>
              {/* Green CL button */}
              {!isClGenerating &&
                offer.cl_status === 'done' &&
                offer.cl_url && (
                  <button
                    type="button"
                    onClick={() =>
                      chrome.tabs.create({
                        url: `${offer.cl_url}?t=${Date.now()}`,
                      })
                    }
                    className="shrink-0 flex items-center gap-1.5 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-medium py-2 px-3 rounded-md text-sm transition-colors"
                  >
                    CL
                  </button>
                )}
            </div>
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

          {!isGenerating && !isClGenerating && (
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
              {isDropdownOpen &&
                createPortal(
                  <div
                    ref={portalRef}
                    style={portalStyle}
                    className="bg-white border border-gray-200 rounded-md shadow-lg overflow-hidden"
                  >
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
  onResetFilters,
  defaultExpanded = false,
  selfMode = false,
}: ClientAccordionProps) {
  const { getToken } = useAuth();

  const [isOpen, setIsOpen] = useState(defaultExpanded);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
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
  const [applyOpen, setApplyOpen] = useState(true);
  const [levelUpOpen, setLevelUpOpen] = useState(false);
  const [expandedOfferId, setExpandedOfferId] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [upgradeDrawerOpen, setUpgradeDrawerOpen] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanLimitReached, setScanLimitReached] = useState(false);

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
        };
        const active =
          data.subscribed_to !== null &&
          (!data.expires_at ||
            new Date(data.expires_at).getTime() > Date.now());
        setIsPro(active);
      } catch {
        // ignore
      }
    }

    void checkSubscription();

    function handleStorageChange(
      changes: Record<string, chrome.storage.StorageChange>,
    ) {
      if (
        'upgrade_success' in changes &&
        changes.upgrade_success.newValue !== undefined
      ) {
        void checkSubscription();
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
      let pending: UserOffer[] = [];
      let levelUp: UserOffer[] = [];
      if (statusFilter === 'pending_apply') {
        const result = await fetchCombinedOffers();
        pending = result.apply_now.offers ?? [];
        levelUp = result.level_up.offers ?? [];
        setApplyNowCount(result.apply_now.count);
        setLevelUpCount(result.level_up.count);
      } else {
        pending = await fetchOffers(statusFilter);
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
  }, [currentUrl, client.id]);

  useEffect(() => {
    setHasLoaded(false);
    let cancelled = false;
    async function refetchOffers() {
      if (isOpen) setIsLoading(true);
      if (statusFilter === 'pending_apply') {
        const result = await fetchCombinedOffers();
        if (cancelled) return;
        setApplyOffers(result.apply_now.offers ?? []);
        setLevelUpOffers(result.level_up.offers ?? []);
        setApplyNowCount(result.apply_now.count);
        setLevelUpCount(result.level_up.count);
      } else {
        const pending = await fetchOffers(statusFilter);
        if (cancelled) return;
        setApplyOffers(pending);
        setLevelUpOffers([]);
      }
      if (isOpen) setIsLoading(false);
      setHasLoaded(true);
    }
    refetchOffers();
    return () => {
      cancelled = true;
    };
  }, [statusFilter, sourceFilter]);

  interface CombinedBucket {
    offers: UserOffer[];
    count: number;
  }
  interface CombinedOffersResponse {
    apply_now: CombinedBucket;
    level_up: CombinedBucket;
    count: number;
  }
  const EMPTY_COMBINED: CombinedOffersResponse = {
    apply_now: { offers: [], count: 0 },
    level_up: { offers: [], count: 0 },
    count: 0,
  };

  async function fetchCombinedOffers(): Promise<CombinedOffersResponse> {
    const token = await getToken();
    if (!token) return EMPTY_COMBINED;
    const params = new URLSearchParams({ status: 'pending_apply|ai_rejected' });
    if (!selfMode) params.append('client_id', client.id);
    if (sourceFilter !== 'all') params.append('source', sourceFilter);
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
      };
    } catch {
      return EMPTY_COMBINED;
    }
  }

  async function fetchOffers(status: string): Promise<UserOffer[]> {
    const token = await getToken();
    if (!token) return [];
    const params = new URLSearchParams({ status });
    if (!selfMode) params.append('client_id', client.id);
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
      if (statusFilter === 'pending_apply') {
        const result = await fetchCombinedOffers();
        setApplyOffers(result.apply_now.offers ?? []);
        setLevelUpOffers(result.level_up.offers ?? []);
        setApplyNowCount(result.apply_now.count);
        setLevelUpCount(result.level_up.count);
      } else {
        setApplyOffers(await fetchOffers(statusFilter));
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
    if (statusFilter === 'pending_apply') {
      const result = await fetchCombinedOffers();
      setApplyOffers(result.apply_now.offers ?? []);
      setLevelUpOffers(result.level_up.offers ?? []);
      setApplyNowCount(result.apply_now.count);
      setLevelUpCount(result.level_up.count);
    } else {
      setApplyOffers(await fetchOffers(statusFilter));
      setLevelUpOffers([]);
    }
    setIsLoading(false);
    setHasLoaded(true);
    setIsRefreshing(false);
  }

  const handleRefreshRef = useRef(handleRefresh);
  handleRefreshRef.current = handleRefresh;

  async function openWizard() {
    setWizardProfile(null);
    setWizardProfileLoading(true);
    setProfileOpen(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams({ client_id: client.id });
      const res = await fetch(`${API_BASE_URL}/v1/profile?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const fetched = res.ok
        ? ((await res.json()) as { profile: Record<string, unknown> | null })
            .profile
        : null;
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

  const knownCountRef = useRef<number | null>(null);

  useEffect(() => {
    if (!selfMode) return;
    let interval: ReturnType<typeof setInterval> | null = null;
    fetchCombinedOffers().then(result => {
      knownCountRef.current = result.count;
      interval = setInterval(async () => {
        const polled = await fetchCombinedOffers();
        const count = polled.count;
        if (count > knownCountRef.current!) {
          knownCountRef.current = count;
          setHasNewOffers(true);
          if (!hasOffersRef.current) {
            void handleRefreshRef.current();
          }
        }
      }, 30000);
    });
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [selfMode]);

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
      console.log('[scanPage] tab:', tab?.id, tab?.url);
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
      console.log('[scanPage] pageText length:', pageText?.length);
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
      console.log('[scanPage] response:', JSON.stringify(data));
      console.log(
        '[scanPage] is_job_offer:',
        data.is_job_offer,
        'user_offer:',
        data.user_offer,
      );
      if (!data.is_job_offer) {
        setScanMessage(
          "This page doesn't look like a job offer. Try opening a job posting first.",
        );
        setTimeout(() => setScanMessage(null), 4000);
        return;
      }
      const newOffer = data.user_offer!;
      setApplyOffers(prev => [newOffer, ...prev]);
      setApplyOpen(true);
      onResetFilters?.();
      setExpandedOfferId(null);
      setTimeout(() => {
        setExpandedOfferId(newOffer.user_offer_id);
        document
          .querySelector(`[data-user-offer-id="${newOffer.user_offer_id}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (err) {
      console.error('[scanPage] error:', err);
      setScanError('Something went wrong. Please try again.');
      setTimeout(() => setScanError(null), 4000);
    } finally {
      setIsScanning(false);
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
    <div className="border border-gray-200 rounded-md overflow-hidden">
      <div
        role={selfMode ? undefined : 'button'}
        tabIndex={selfMode ? undefined : 0}
        onClick={selfMode ? undefined : handleToggle}
        onKeyDown={
          selfMode
            ? undefined
            : e => {
                if (e.key === 'Enter' || e.key === ' ') handleToggle();
              }
        }
        className={`w-full flex items-center justify-between px-3 py-2.5 bg-white transition-colors ${selfMode ? '' : 'hover:bg-gray-50 cursor-pointer'}`}
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
          {!hasLoaded || isLoading ? (
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
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={async e => {
              e.stopPropagation();
              void openWizard();
            }}
            title="Edit profile"
            className="text-gray-800 hover:text-gray-600 p-0.5 leading-none"
          >
            <AddressBook size={14} />
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
            <svg
              className={`w-4 h-4 text-gray-800 transition-transform ${isOpen ? 'rotate-180' : ''}`}
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
          )}
        </div>
      </div>

      {(isOpen || selfMode) && (
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
                  {/* Scan box */}
                  {scanLimitReached ? (
                    <PlanLimitBanner
                      onUpgradeClick={() =>
                        console.log('Buy 100 scans clicked')
                      }
                      buttonLabel="Buy 100 scans"
                    >
                      <p className="text-xs text-gray-500">
                        You've reached your scan limit. Buy a package for 100
                        more scans.
                      </p>
                    </PlanLimitBanner>
                  ) : (
                    <div className="mx-3 my-2 px-4 py-4 rounded-md border border-gray-200 bg-gray-50 flex flex-col items-center gap-2 text-center">
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
                    </div>
                  )}
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
                            {applyNowCount ?? filteredApplyOffers.length}
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
                                onCvUpdate={handleCvUpdate}
                                onClUpdate={handleClUpdate}
                                onSalaryUpdate={handleSalaryUpdate}
                                candidateSkills={candidateSkills}
                                isOfferLoading={isLoading}
                              />
                            ),
                          )}
                          {!isPro &&
                            applyNowCount !== null &&
                            applyOffers.length < applyNowCount && (
                              <PlanLimitBanner
                                onUpgradeClick={() =>
                                  setUpgradeDrawerOpen(true)
                                }
                              >
                                <p className="text-xs text-gray-500">
                                  You've reached your free plan limit. Upgrade
                                  to unlock{' '}
                                  <span className="font-medium text-gray-700">
                                    {applyNowCount - applyOffers.length} more
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
                        className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                            Level up & earn more
                          </span>
                          <span className="text-xs font-medium bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded">
                            {levelUpCount ?? filteredLevelUpOffers.length}
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
                          {(() => {
                            console.log(
                              '[render] levelUpOffers:',
                              levelUpOffers.map(o => o.user_offer_id),
                            );
                          })()}
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
                                onCvUpdate={handleCvUpdate}
                                onClUpdate={handleClUpdate}
                                onSalaryUpdate={handleSalaryUpdate}
                                candidateSkills={candidateSkills}
                                isOfferLoading={isLoading}
                              />
                            ),
                          )}
                          {!isPro &&
                            levelUpCount !== null &&
                            levelUpOffers.length < levelUpCount && (
                              <PlanLimitBanner
                                onUpgradeClick={() =>
                                  setUpgradeDrawerOpen(true)
                                }
                              >
                                <p className="text-xs text-gray-500">
                                  You've reached your free plan limit. Upgrade
                                  to unlock{' '}
                                  <span className="font-medium text-gray-700">
                                    {levelUpCount - levelUpOffers.length} more
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
                      <p className="px-3 py-3 text-gray-400 text-xs">
                        {selfMode
                          ? "We're scanning thousands of offers for you. Your matches will appear here shortly."
                          : 'No offers found.'}
                      </p>
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
                                onCvUpdate={handleCvUpdate}
                                onClUpdate={handleClUpdate}
                                onSalaryUpdate={handleSalaryUpdate}
                                candidateSkills={candidateSkills}
                                isOfferLoading={isLoading}
                              />
                            ),
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="px-3 py-3 text-gray-400 text-xs">
                      No offers found.
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
      {profileOpen &&
        createPortal(
          <div className="fixed inset-0 z-50">
            {wizardProfileLoading || !wizardProfile ? (
              <div className="flex flex-col h-screen bg-gray-50">
                <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 shrink-0">
                  <span className="text-sm font-semibold text-gray-900">
                    Great jobs start with a great profile
                  </span>
                  <button
                    type="button"
                    onClick={() => setProfileOpen(false)}
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
                onClose={() => setProfileOpen(false)}
                onSubmitted={() => setProfileOpen(false)}
                onSaved={saved => {
                  const fn = saved.basic_info?.first_name ?? '';
                  const ln = saved.basic_info?.last_name ?? '';
                  onClientUpdate?.(client.id, fn, ln);
                }}
                onCloseComplete={(ready, syncTriggered) => {
                  setProfileReady(ready);
                  if (syncTriggered) {
                    knownCountRef.current = 0;
                    console.log(
                      '[poll] baseline reset to 0 after trigger-sync',
                    );
                    void handleRefresh();
                  }
                }}
              />
            )}
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
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Generated:</span>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cvGenerated}
                  onChange={e => setCvGenerated(e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-xs text-gray-700">CV</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={clGenerated}
                  onChange={e => setClGenerated(e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-xs text-gray-700">CL</span>
              </label>
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
              minScore={minScore}
              cvGenerated={cvGenerated}
              clGenerated={clGenerated}
              onClientUpdate={handleClientUpdate}
              onResetFilters={() => {
                setMinScore(0);
                setSortBy('score');
              }}
              defaultExpanded={true}
              selfMode={true}
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
                minScore={minScore}
                cvGenerated={cvGenerated}
                clGenerated={clGenerated}
                onClientUpdate={handleClientUpdate}
                onResetFilters={() => {
                  setMinScore(0);
                  setSortBy('score');
                }}
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
