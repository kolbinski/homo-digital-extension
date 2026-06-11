import { useState } from 'react';
import { CheckCircle, CircleDashed, SignOut } from '@phosphor-icons/react';
import { useAuth } from '../../hooks/useAuth';
import { API_BASE_URL } from '../../config';
import type { Profile, WizardTabId } from './types';
import { getTabCompletions, allRequiredComplete } from './completionChecks';
import CertificationsTab from './tabs/CertificationsTab';

interface Props {
  profile: Profile;
  onChange: (profile: Profile) => void;
  onLogout: () => void;
}

export default function WizardShell({ profile, onChange, onLogout }: Props) {
  const { getToken } = useAuth();
  const [activeTab, setActiveTab] = useState<WizardTabId>('basic_info');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');

  const completions = getTabCompletions(profile);
  const allComplete = allRequiredComplete(completions);
  const activeCompletion = completions.find(t => t.id === activeTab)!;

  async function saveProfile(submitted: boolean) {
    setSaving(true);
    setSaveMessage('');
    setSaveError('');
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/v1/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(
          submitted ? { ...profile, submitted: true } : profile,
        ),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      setSaveMessage(submitted ? 'Profile submitted!' : 'Draft saved.');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : 'Save failed. Please try again.',
      );
      setTimeout(() => setSaveError(''), 4000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 shrink-0">
        <span className="text-sm font-semibold text-gray-900">
          Build your profile
        </span>
        <button
          type="button"
          onClick={onLogout}
          aria-label="Logout"
          className="text-gray-800 hover:text-gray-700 transition-colors"
        >
          <SignOut size={16} />
        </button>
      </header>

      {/* Tab bar — wraps to multiple lines */}
      <div className="bg-white border-b border-gray-200 shrink-0">
        <div className="flex flex-wrap">
          {completions.map(tab => {
            const isActive = tab.id === activeTab;
            const showRed = tab.missingCount > 0;
            const showGreen =
              !showRed &&
              (tab.optional ? tab.hasEntry : tab.missingCount === 0);
            const showGray = tab.optional && !tab.hasEntry && !showRed;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-row items-center gap-1 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-green-600 text-green-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {showGreen && (
                  <CheckCircle
                    size={20}
                    weight="fill"
                    className="text-green-500 shrink-0"
                  />
                )}
                {showRed && (
                  <span
                    className="inline-flex items-center justify-center rounded-full bg-red-500 text-white leading-none shrink-0"
                    style={{
                      fontSize: 8,
                      width: 16,
                      height: 16,
                    }}
                  >
                    {tab.missingCount}
                  </span>
                )}
                {showGray && (
                  <CircleDashed
                    size={20}
                    weight="fill"
                    className="text-gray-300 shrink-0"
                  />
                )}
                <span>{tab.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab body */}
      <div className="flex-1 overflow-y-auto p-4">
        <h2 className="text-base font-semibold text-gray-900 mb-3">
          {activeCompletion.label}
        </h2>
        {activeTab === 'certifications' ? (
          <CertificationsTab
            certifications={profile.certifications}
            onChange={certs => onChange({ ...profile, certifications: certs })}
          />
        ) : (
          <p className="text-sm text-gray-400">
            Tab content coming soon — {activeCompletion.label}
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 bg-white border-t border-gray-200 px-4 py-3 flex items-center gap-3">
        {saveMessage && (
          <p className="text-xs text-green-700 flex-1">{saveMessage}</p>
        )}
        {saveError && (
          <p className="text-xs text-red-600 flex-1">{saveError}</p>
        )}
        {!saveMessage && !saveError && <span className="flex-1" />}
        <button
          type="button"
          onClick={() => saveProfile(false)}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save draft'}
        </button>
        <button
          type="button"
          onClick={() => saveProfile(true)}
          disabled={saving || !allComplete}
          title={!allComplete ? 'Complete all required tabs first' : undefined}
          className="px-4 py-2 text-sm font-medium text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-green-600"
        >
          Submit profile
        </button>
      </div>
    </div>
  );
}
