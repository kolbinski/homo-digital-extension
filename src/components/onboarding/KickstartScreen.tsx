import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle,
  CircleDashed,
  CloudCheck,
  Gear,
} from '@phosphor-icons/react';
import { useAuth } from '../../hooks/useAuth';
import { API_BASE_URL } from '../../config';
import Spinner from '../Spinner';
import SettingsDrawer from '../SettingsDrawer';
import { useGeneralSettings } from '../../store/generalSettingsStore';
import type { Profile } from './types';

function getDefaultCurrency(): string {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (tz === 'Europe/Warsaw') return 'PLN';
  if (tz === 'Europe/London') return 'GBP';
  if (tz === 'Europe/Zurich' || tz === 'Europe/Geneva') return 'CHF';
  if (tz === 'Europe/Oslo') return 'NOK';
  if (tz === 'Europe/Stockholm') return 'SEK';
  if (tz === 'Europe/Copenhagen') return 'DKK';
  if (tz.startsWith('America/')) return 'USD';
  if (tz.startsWith('Australia/')) return 'AUD';
  return 'USD';
}

const PROGRESS_ITEMS = [
  'Your basic data',
  'Your work experience',
  'Your own projects',
  'Your education',
  'Your certifications',
  'Your skills',
  'Finalizing',
];

const PROGRESS_DELAY = 96000;

interface Props {
  onPrepared: (profile: Partial<Profile>) => void;
  onSkip: () => void;
  onLogout: () => void;
}

export default function KickstartScreen({
  onPrepared,
  onSkip,
  onLogout,
}: Props) {
  const { getToken } = useAuth();
  const { settings: generalSettings } = useGeneralSettings();
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [displayStep, setDisplayStep] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const DEFAULT_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const DEFAULT_CURRENCY = getDefaultCurrency();
  const [selectedCurrency, setSelectedCurrency] = useState(DEFAULT_CURRENCY);
  const [tzQuery, setTzQuery] = useState(DEFAULT_TZ);
  const [tzDropdownOpen, setTzDropdownOpen] = useState(false);
  const [currencySaved, setCurrencySaved] = useState(false);
  const [timezoneSaved, setTimezoneSaved] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentStepRef = useRef(0);
  const apiResultRef = useRef<Partial<Profile> | 'pending'>('pending');
  const onPreparedRef = useRef(onPrepared);
  onPreparedRef.current = onPrepared;
  const tzWrapperRef = useRef<HTMLDivElement>(null);
  const currencySavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const timezoneSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (currencySavedTimerRef.current)
        clearTimeout(currencySavedTimerRef.current);
      if (timezoneSavedTimerRef.current)
        clearTimeout(timezoneSavedTimerRef.current);
    };
  }, []);

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

  async function patchAccountSetting(body: Record<string, string>) {
    try {
      const token = await getToken();
      await fetch(`${API_BASE_URL}/v1/account/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
    } catch {
      // ignore
    }
  }

  function showCurrencySaved() {
    setCurrencySaved(true);
    if (currencySavedTimerRef.current)
      clearTimeout(currencySavedTimerRef.current);
    currencySavedTimerRef.current = setTimeout(
      () => setCurrencySaved(false),
      2000,
    );
  }

  function showTimezoneSaved() {
    setTimezoneSaved(true);
    if (timezoneSavedTimerRef.current)
      clearTimeout(timezoneSavedTimerRef.current);
    timezoneSavedTimerRef.current = setTimeout(
      () => setTimezoneSaved(false),
      2000,
    );
  }

  function scheduleNext(delay: number) {
    timerRef.current = setTimeout(() => {
      const next = currentStepRef.current + 1;
      currentStepRef.current = next;
      setDisplayStep(next);
      if (next < PROGRESS_ITEMS.length) {
        scheduleNext(apiResultRef.current !== 'pending' ? 200 : PROGRESS_DELAY);
      } else if (apiResultRef.current !== 'pending') {
        onPreparedRef.current(apiResultRef.current as Partial<Profile>);
      }
      // else: API not done yet — wait for handleApiDone
    }, delay);
  }

  function handleApiDone(result: Partial<Profile>) {
    apiResultRef.current = result;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (currentStepRef.current < PROGRESS_ITEMS.length) {
      scheduleNext(200);
    } else {
      onPreparedRef.current(result);
    }
  }

  function handleFile(f: File) {
    if (f.type !== 'application/pdf') {
      setError('Please upload a PDF file.');
      return;
    }
    setError('');
    setFile(f);
  }

  async function patchProfile(
    profile: Partial<Profile>,
  ): Promise<Partial<Profile> | null> {
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/v1/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ profile }),
      });
      if (!res.ok) return null;
      const envelope = (await res.json()) as {
        profile: Partial<Profile> | null;
      };
      return envelope.profile;
    } catch {
      return null;
    }
  }

  async function handlePrepare() {
    if (!file) {
      setError('Please upload your CV first.');
      return;
    }
    setLoading(true);
    setError('');
    apiResultRef.current = 'pending';
    currentStepRef.current = 0;
    setDisplayStep(0);
    void patchAccountSetting({
      preferred_currency: DEFAULT_CURRENCY,
      timezone: DEFAULT_TZ,
    });
    scheduleNext(PROGRESS_DELAY);
    try {
      const token = await getToken();
      const body = new FormData();
      body.append('cv', file);
      const res = await fetch(`${API_BASE_URL}/v1/onboarding/prepare-profile`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body,
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const json = await res.json();
      const data = (json.profile ?? json) as Partial<Profile>;
      const fromDb = await patchProfile(data);
      handleApiDone(fromDb ?? data);
    } catch (err) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setError(
        err instanceof Error
          ? err.message
          : 'Something went wrong. Please try again.',
      );
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Topbar */}
      <header className="flex items-center justify-end px-4 py-3 bg-white border-b border-gray-200 shrink-0">
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          disabled={loading}
          aria-label="Settings"
          className="text-gray-800 hover:text-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Gear size={16} />
        </button>
      </header>

      {/* Content */}
      <div
        className={`flex-1 flex flex-col items-center ${!loading ? 'justify-center' : ''} px-6 py-8`}
      >
        <div className="w-full max-w-sm flex flex-col items-center gap-5">
          <div className={loading ? 'text-left w-full' : 'text-center'}>
            <h1 className="text-xl font-semibold text-gray-900 mb-1">
              {loading ? 'Analyzing your CV' : "Let's get you started"}
            </h1>
            {loading ? (
              <p className="text-sm text-gray-500">
                <br />
                The more we know about you, the better we match you with roles
                that fit - not just roles that exist.
                <br />
                <br />A complete profile also means personalized CVs and cover
                letters, ready in seconds for every application.
              </p>
            ) : (
              <p className="text-sm text-gray-500">
                Drop your CV below and we'll build your profile in seconds. No
                forms, no hassle.
              </p>
            )}
          </div>

          {/* Drop zone — hidden while loading */}
          {!loading && (
            <div
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}
              onDragOver={e => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files[0];
                if (f) handleFile(f);
              }}
              className={`w-full border-2 border-dashed rounded-lg px-4 py-8 flex flex-col items-center gap-2 cursor-pointer transition-colors ${
                dragging
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-300 bg-white hover:bg-gray-50'
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              <svg
                className="w-8 h-8 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                />
              </svg>
              <p className="text-sm text-gray-500 text-center">
                {file ? (
                  <span className="font-medium text-green-700">
                    {file.name}
                  </span>
                ) : (
                  <>
                    Drag & drop or{' '}
                    <span className="text-green-600 font-medium">browse</span>
                  </>
                )}
              </p>
              <p className="text-xs text-gray-400">PDF only</p>
            </div>
          )}

          {/* Animated progress — shown while loading */}
          {loading && (
            <div className="w-full flex flex-col gap-5">
              <div className="flex flex-col gap-2.5">
                {PROGRESS_ITEMS.map((item, i) => {
                  const isDone = i < displayStep;
                  const isActive = i === displayStep;
                  const isLast = i === PROGRESS_ITEMS.length - 1;
                  return (
                    <div key={item} className="flex items-center gap-2">
                      {isDone ? (
                        <>
                          <CheckCircle
                            size={24}
                            weight="fill"
                            className="text-green-500 shrink-0"
                          />
                          <span className="text-sm text-gray-700">{item}</span>
                        </>
                      ) : isActive ? (
                        <>
                          <Spinner size={24} className="text-gray-400" />
                          <span className="text-sm text-gray-500">
                            {isLast
                              ? 'Finalizing...'
                              : `Reading ${item.toLowerCase()}...`}
                          </span>
                        </>
                      ) : (
                        <>
                          <CircleDashed
                            size={24}
                            className="text-gray-300 shrink-0"
                          />
                          <span className="text-sm text-gray-300">{item}</span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Preferences section */}
              <div className="w-full flex flex-col gap-3 pt-3 border-t border-gray-200">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  In the meantime, set your preferences
                </p>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs text-gray-600">
                      Show offer salaries in currency
                    </label>
                    {currencySaved && (
                      <CloudCheck
                        size={14}
                        weight="fill"
                        className="text-green-500 shrink-0"
                      />
                    )}
                  </div>
                  <select
                    value={selectedCurrency}
                    onChange={e => {
                      const val = e.target.value;
                      setSelectedCurrency(val);
                      void patchAccountSetting({
                        preferred_currency: val,
                      }).then(showCurrencySaved);
                    }}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                  >
                    {(generalSettings?.currencies ?? [DEFAULT_CURRENCY]).map(
                      c => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ),
                    )}
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs text-gray-600">My timezone</label>
                    {timezoneSaved && (
                      <CloudCheck
                        size={14}
                        weight="fill"
                        className="text-green-500 shrink-0"
                      />
                    )}
                  </div>
                  <div className="relative" ref={tzWrapperRef}>
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
                        const options = [...starts, ...contains].slice(0, 60);
                        return options.length > 0 ? (
                          <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-44 overflow-y-auto z-10">
                            {options.map(tz => (
                              <button
                                key={tz}
                                type="button"
                                onMouseDown={() => {
                                  setTzQuery(tz);
                                  setTzDropdownOpen(false);
                                  void patchAccountSetting({
                                    timezone: tz,
                                  }).then(showTimezoneSaved);
                                }}
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
            </div>
          )}

          {error && <p className="text-sm text-red-600 w-full">{error}</p>}

          {!loading && (
            <button
              type="button"
              onClick={handlePrepare}
              className="w-full text-white font-medium py-2 px-4 rounded-md text-sm transition-colors flex items-center justify-center gap-2 bg-green-600"
            >
              Prepare my profile
            </button>
          )}

          {!loading && (
            <button
              type="button"
              onClick={onSkip}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Skip
            </button>
          )}
        </div>
      </div>
      {settingsOpen && (
        <SettingsDrawer
          onClose={() => setSettingsOpen(false)}
          onLogout={onLogout}
        />
      )}
    </div>
  );
}
