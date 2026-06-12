import { useRef, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { API_BASE_URL, CONFIG } from '../../config';
import exampleCv from '../../data/example-cv.json';
import type { Profile } from './types';

interface Props {
  onPrepared: (profile: Partial<Profile>) => void;
  onSkip: () => void;
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4 text-white"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export default function KickstartScreen({ onPrepared, onSkip }: Props) {
  const { getToken } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(f: File) {
    if (f.type !== 'application/pdf') {
      setError('Please upload a PDF file.');
      return;
    }
    setError('');
    setFile(f);
  }

  async function patchProfile(profile: Partial<Profile>): Promise<void> {
    try {
      const token = await getToken();
      await fetch(`${API_BASE_URL}/v1/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ profile }),
      });
    } catch {
      // non-blocking — auto-save will persist on first edit
    }
  }

  async function handlePrepare() {
    if (CONFIG.use_template_cv && !file) {
      setLoading(true);
      const prepared = exampleCv as unknown as Partial<Profile>;
      await patchProfile(prepared);
      onPrepared(prepared);
      return;
    }
    if (!file) {
      setError('Please upload your CV first.');
      return;
    }
    setLoading(true);
    setError('');
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
      const data = (await res.json()) as Partial<Profile>;
      await patchProfile(data);
      onPrepared(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Something went wrong. Please try again.',
      );
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-6 py-8">
      <div className="w-full max-w-sm flex flex-col items-center gap-5">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-gray-900 mb-1">
            Let's build your profile
          </h1>
          <p className="text-sm text-gray-500">
            Upload your CV and we'll pre-fill your profile automatically.
          </p>
        </div>

        {/* Drop zone */}
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
              <span className="font-medium text-green-700">{file.name}</span>
            ) : (
              <>
                Drag & drop or{' '}
                <span className="text-green-600 font-medium">browse</span>
              </>
            )}
          </p>
          <p className="text-xs text-gray-400">Upload your CV (PDF, optional)</p>
        </div>

        {error && <p className="text-sm text-red-600 w-full">{error}</p>}

        <button
          type="button"
          onClick={handlePrepare}
          disabled={loading}
          className="w-full text-white font-medium py-2 px-4 rounded-md text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60 bg-green-600"
        >
          {loading ? (
            <>
              <Spinner />
              Analyzing your CV…
            </>
          ) : (
            'Prepare my profile'
          )}
        </button>

        <button
          type="button"
          onClick={onSkip}
          disabled={loading}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
