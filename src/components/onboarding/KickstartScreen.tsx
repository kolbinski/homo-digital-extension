import { useEffect, useRef, useState } from 'react';
import { CheckCircle, Gear } from '@phosphor-icons/react';
import { useAuth } from '../../hooks/useAuth';
import { API_BASE_URL } from '../../config';
import Spinner from '../Spinner';
import SettingsDrawer from '../SettingsDrawer';
import type { Profile } from './types';

const PROGRESS_ITEMS = [
  'Your basic data',
  'Your work experience',
  'Your own projects',
  'Your education',
  'Your certifications',
  'Your skills',
];

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
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [displayStep, setDisplayStep] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentStepRef = useRef(0);
  const apiResultRef = useRef<Partial<Profile> | 'pending'>('pending');
  const onPreparedRef = useRef(onPrepared);
  onPreparedRef.current = onPrepared;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function scheduleNext(delay: number) {
    timerRef.current = setTimeout(() => {
      const next = currentStepRef.current + 1;
      currentStepRef.current = next;
      setDisplayStep(next);
      if (next < PROGRESS_ITEMS.length) {
        scheduleNext(apiResultRef.current !== 'pending' ? 200 : 5000);
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
    scheduleNext(5000);
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
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
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
            <div className="w-full flex flex-col gap-2.5">
              {PROGRESS_ITEMS.map((item, i) => {
                if (i > displayStep) return null;
                const isActive = i === displayStep;
                return (
                  <div key={item} className="flex items-center gap-2">
                    {isActive ? (
                      <>
                        <Spinner className="text-gray-400" />
                        <span className="text-sm text-gray-500">
                          Reading {item.toLowerCase()}...
                        </span>
                      </>
                    ) : (
                      <>
                        <CheckCircle
                          size={16}
                          weight="fill"
                          className="text-green-500 shrink-0"
                        />
                        <span className="text-sm text-gray-700">{item}</span>
                      </>
                    )}
                  </div>
                );
              })}
              {displayStep >= PROGRESS_ITEMS.length && (
                <div className="flex items-center gap-2">
                  <Spinner className="text-gray-400" />
                  <span className="text-sm text-gray-500">Finalizing...</span>
                </div>
              )}
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
