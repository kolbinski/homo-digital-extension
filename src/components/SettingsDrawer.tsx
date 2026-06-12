import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@phosphor-icons/react';
import Spinner from './Spinner';
import { useAuth } from '../hooks/useAuth';
import { API_BASE_URL } from '../config';

interface Props {
  onClose: () => void;
  onLogout: () => void;
}

export default function SettingsDrawer({ onClose, onLogout }: Props) {
  const { getToken } = useAuth();
  const [visible, setVisible] = useState(false);

  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');

  const [showConfirm, setShowConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 200);
  }

  async function handleSend() {
    if (!message.trim()) return;
    setFeedbackError('');
    setIsSending(true);
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
        setFeedbackError('Something went wrong. Please try again.');
        return;
      }
      setMessage('');
      setFeedbackSent(true);
    } catch {
      setFeedbackError('Network error. Please try again.');
    } finally {
      setIsSending(false);
    }
  }

  async function handleDeleteAccount() {
    setIsDeleting(true);
    setDeleteError('');
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/v1/account`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      onLogout();
    } catch {
      setDeleteError('Failed to delete account. Please try again.');
      setIsDeleting(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        className={`absolute inset-0 bg-black/20 transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleClose}
      />
      <div
        className={`absolute inset-y-0 right-0 w-full bg-white flex flex-col shadow-xl transition-transform duration-200 ${visible ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 shrink-0">
          <span className="text-sm font-semibold text-gray-900">Settings</span>
          <button
            type="button"
            onClick={handleClose}
            disabled={isDeleting}
            aria-label="Close"
            className="text-gray-800 hover:text-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <X size={16} />
          </button>
        </header>

        <div className={`flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-6 ${isDeleting ? 'pointer-events-none opacity-50' : ''}`}>
          <section className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Feedback
            </h2>
            {feedbackSent ? (
              <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2.5">
                Thank you! We'll get back to you soon.
              </p>
            ) : (
              <>
                <textarea
                  value={message}
                  onChange={e => {
                    setMessage(e.target.value);
                    setFeedbackError('');
                  }}
                  placeholder="Write your feedback or anything we should improve..."
                  rows={4}
                  disabled={isSending}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent resize-none disabled:bg-gray-50 disabled:text-gray-400"
                />
                {feedbackError && (
                  <p className="text-xs text-red-600">{feedbackError}</p>
                )}
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={isSending || !message.trim()}
                  className="w-full text-white font-medium py-2 px-4 rounded-md text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed bg-green-600 hover:bg-green-700"
                >
                  {isSending && <Spinner className="text-white" />}
                  {isSending ? 'Sending…' : 'Send'}
                </button>
              </>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Account
            </h2>
            <button
              type="button"
              onClick={onLogout}
              className="w-full font-medium py-2 px-4 rounded-md text-sm transition-colors bg-gray-700 hover:bg-gray-800 text-gray-100"
            >
              Log out
            </button>
            {deleteError && (
              <p className="text-xs text-red-600">{deleteError}</p>
            )}
            {!showConfirm ? (
              <button
                type="button"
                onClick={() => setShowConfirm(true)}
                className="w-full text-white font-medium py-2 px-4 rounded-md text-sm transition-colors bg-red-600 hover:bg-red-700"
              >
                Delete account
              </button>
            ) : (
              <div className="flex flex-col gap-3 p-3 border border-red-200 rounded-md bg-red-50">
                <p className="text-sm text-gray-700">
                  Are you sure? This action cannot be undone.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowConfirm(false)}
                    disabled={isDeleting}
                    className="flex-1 py-2 px-3 rounded-md text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteAccount}
                    disabled={isDeleting}
                    className="flex-1 py-2 px-3 rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {isDeleting && <Spinner size={14} className="text-white" />}
                    Delete account
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
