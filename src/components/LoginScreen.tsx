import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { API_BASE_URL } from '../config';

interface Props {
  onLogin: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4 text-white"
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
  );
}

const LOGIN_BULLETS = [
  'Easily scan thousands of job offers daily with AI',
  'Quickly apply on behalf of clients with tailored CVs',
  'Negotiate salaries and represent candidates',
  'Earn a success fee on every job change',
];

const JOIN_BULLETS = [
  'Flexible work — help candidates on your own schedule',
  'AI tools that handle most of the heavy lifting',
  'Success fee on every client job change',
  'Full onboarding and support from day one',
];

function BulletList({ items }: { items: string[] }) {
  return (
    <div className="flex flex-col" style={{ gap: 6 }}>
      {items.map(item => (
        <div key={item} className="flex items-start gap-2">
          <span
            style={{
              color: '#16a34a',
              fontSize: 12,
              lineHeight: '18px',
              flexShrink: 0,
            }}
          >
            ✦
          </span>
          <span style={{ fontSize: 12, color: '#374151', lineHeight: '18px' }}>
            {item}
          </span>
        </div>
      ))}
    </div>
  );
}

function LoginView({
  onLogin,
  onJoin,
}: {
  onLogin: () => void;
  onJoin: () => void;
}) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  function validateEmail() {
    if (email.trim() && !EMAIL_RE.test(email.trim())) {
      setEmailError('Enter a valid email address.');
      return false;
    }
    setEmailError('');
    return true;
  }

  async function handleLogin() {
    if (!validateEmail()) return;
    setError('');
    setIsLoading(true);
    const result = await login(email, password);
    setIsLoading(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onLogin();
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-6 py-8">
      <div className="w-full max-w-sm flex flex-col items-center">
        <img
          src="/icons/logo.png"
          alt="Homo Digital"
          style={{ width: 160, marginBottom: 12 }}
        />
        <h1
          className="text-2xl font-semibold text-gray-900 text-center tracking-tight"
          style={{ marginBottom: 6 }}
        >
          Homo Digital
        </h1>
        <p
          style={{
            textAlign: 'center',
            color: '#6b7280',
            fontSize: 13,
            marginBottom: 20,
            fontWeight: 'bold',
          }}
        >
          Help senior developers find better jobs.
          <br />
          Earn doing it.
        </p>

        <div className="w-full" style={{ marginBottom: 20 }}>
          <BulletList items={LOGIN_BULLETS} />
        </div>

        <div className="w-full flex flex-col gap-4">
          <p className="text-sm font-medium text-gray-700">
            Login to your account
          </p>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="email"
              className="text-sm font-medium text-gray-700"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => {
                setEmail(e.target.value);
                setEmailError('');
              }}
              onBlur={validateEmail}
              placeholder="agent@example.com"
              disabled={isLoading}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
              style={{ ['--tw-ring-color' as string]: '#16a34a' }}
            />
            {emailError && <p className="text-xs text-red-600">{emailError}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="password"
              className="text-sm font-medium text-gray-700"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={isLoading}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="button"
            onClick={handleLogin}
            disabled={isLoading || !email || !password}
            className="w-full text-white font-medium py-2 px-4 rounded-md text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: '#16a34a' }}
          >
            {isLoading && <Spinner />}
            {isLoading ? 'Logging in…' : 'Log in'}
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            margin: '12px 0',
            width: '100%',
          }}
        >
          <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
          <span style={{ fontSize: 12, color: '#9ca3af' }}>or</span>
          <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
        </div>

        <button
          type="button"
          onClick={onJoin}
          className="w-full text-white font-medium py-2 px-4 rounded-md text-sm transition-colors"
          style={{ backgroundColor: '#2563eb' }}
        >
          Join
        </button>
      </div>
    </div>
  );
}

function JoinView({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [emailError, setEmailError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  function validateEmail() {
    if (email.trim() && !EMAIL_RE.test(email.trim())) {
      setEmailError('Enter a valid email address.');
      return false;
    }
    setEmailError('');
    return true;
  }

  async function handleRequest() {
    if (!validateEmail()) return;
    if (!email.trim()) {
      setEmailError('Email is required.');
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/prospects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), notes, role: 'agent' }),
      });
      if (!res.ok) {
        setError('Something went wrong. Please try again.');
        setIsLoading(false);
        return;
      }
      setSuccess(true);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span style={{ color: '#16a34a', fontSize: 40, lineHeight: 1 }}>
            ✦
          </span>
          <h2 className="text-xl font-semibold text-gray-900">Thank you!</h2>
          <p className="text-sm text-gray-500">We will contact you soon.</p>
          <button
            type="button"
            onClick={onBack}
            className="mt-2 text-sm font-medium text-white px-5 py-2 rounded-md transition-colors"
            style={{ backgroundColor: '#16a34a' }}
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 px-6 py-8">
      <div className="w-full max-w-sm mx-auto flex flex-col">
        <div className="flex items-center gap-2 mb-5">
          <button
            type="button"
            onClick={onBack}
            className="text-gray-500 hover:text-gray-700 transition-colors"
            aria-label="Back"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <h2 className="text-base font-semibold text-gray-900">
            Become an agent
          </h2>
        </div>

        <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 16 }}>
          Join the platform that's changing IT recruitment.
        </p>

        <div style={{ marginBottom: 20 }}>
          <BulletList items={JOIN_BULLETS} />
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="join-email"
              className="text-sm font-medium text-gray-700"
            >
              Email
            </label>
            <input
              id="join-email"
              type="email"
              value={email}
              onChange={e => {
                setEmail(e.target.value);
                setEmailError('');
              }}
              onBlur={validateEmail}
              placeholder="you@example.com"
              disabled={isLoading}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
            />
            {emailError && <p className="text-xs text-red-600">{emailError}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="join-notes"
              className="text-sm font-medium text-gray-700"
            >
              Your experience in IT / recruitment (optional)
            </label>
            <textarea
              id="join-notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              disabled={isLoading}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400 resize-none"
              placeholder="Brief background — years of experience, industries, relevant skills…"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="button"
            onClick={handleRequest}
            disabled={isLoading || !email}
            className="w-full text-white font-medium py-2 px-4 rounded-md text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: '#2563eb' }}
          >
            {isLoading && <Spinner />}
            {isLoading ? 'Sending…' : 'Request access'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LoginScreen({ onLogin }: Props) {
  const [view, setView] = useState<'login' | 'join'>('login');

  if (view === 'join') {
    return <JoinView onBack={() => setView('login')} />;
  }

  return <LoginView onLogin={onLogin} onJoin={() => setView('join')} />;
}
