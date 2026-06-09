import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { API_BASE_URL } from '../config';

interface Props {
  onClose: () => void;
}

export default function FeedbackPopup({ onClose }: Props) {
  const { getToken } = useAuth();
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  async function handleSend() {
    if (!message.trim()) return;
    setError('');
    setIsLoading(true);
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
        setError('Something went wrong. Please try again.');
        return;
      }
      setMessage('');
      setSuccess(true);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-16 px-4"
      onMouseDown={e => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="w-full max-w-sm bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="text-sm font-semibold text-gray-900">Feedback &amp; Support</span>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-4 py-4 flex flex-col gap-3">
          {success ? (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2.5">
              Thank you! We'll get back to you soon.
            </p>
          ) : (
            <>
              <textarea
                value={message}
                onChange={e => { setMessage(e.target.value); setError(''); }}
                placeholder="Write your feedback or anything we should improve..."
                rows={4}
                disabled={isLoading}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent resize-none disabled:bg-gray-50 disabled:text-gray-400"
              />
              {error && <p className="text-xs text-red-600">{error}</p>}
              <button
                type="button"
                onClick={handleSend}
                disabled={isLoading || !message.trim()}
                className="w-full text-white font-medium py-2 px-4 rounded-md text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: '#16a34a' }}
              >
                {isLoading && (
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                {isLoading ? 'Sending…' : 'Send'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
