import { useEffect, useState } from 'react';
import { Gear } from '@phosphor-icons/react';
import Spinner from './Spinner';
import { useAuth, type OAuthData } from '../hooks/useAuth';
import { API_BASE_URL } from '../config';
import OnboardingWizard from './onboarding/OnboardingWizard';
import ExploreTab from './ExploreTab';
import SettingsDrawer from './SettingsDrawer';
import type { Profile } from './onboarding/types';

interface Props {
  onLogout: () => void;
  activeTabId?: number;
  currentUrl?: string;
}

type ProfileState = 'loading' | 'onboarding' | 'loaded';

export default function ClientView({
  onLogout,
  activeTabId,
  currentUrl,
}: Props) {
  const { getToken, getOAuthData } = useAuth();
  const [profileState, setProfileState] = useState<ProfileState>('loading');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [oauthData, setOauthData] = useState<OAuthData | null>(null);
  const [wizardSlotEl, setWizardSlotEl] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    getOAuthData()
      .then(data => {
        if (data) setOauthData(data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    getToken().then(async token => {
      try {
        const res = await fetch(`${API_BASE_URL}/v1/profile`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          setProfileState('onboarding');
          return;
        }
        const raw = (await res.json()) as {
          profile: (Profile & { editing_snapshot?: unknown }) | null;
          profile_ready: boolean;
          profile_editing_snapshot?: unknown | null;
        };
        const {
          profile: dbProfile,
          profile_ready,
          profile_editing_snapshot,
        } = raw;
        // Onboarding only when the profile has never been completed:
        // not ready AND no editing snapshot. A non-null snapshot means the
        // user is mid-edit of an already-onboarded profile (post-onboarding).
        const isOnboarding = !profile_ready && profile_editing_snapshot == null;
        if (!dbProfile) {
          setProfileState('onboarding');
        } else if (isOnboarding) {
          setProfile(dbProfile);
          setProfileState('onboarding');
        } else {
          setProfile(dbProfile);
          setProfileState('loaded');
        }
      } catch {
        setProfileState('onboarding');
      }
    });
  }, []);

  if (profileState === 'loading') {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <Spinner size={20} className="text-blue-500" />
      </div>
    );
  }

  if (profileState === 'onboarding') {
    return (
      <OnboardingWizard
        initialProfile={profile}
        onLogout={onLogout}
        onSubmitted={() => setProfileState('loaded')}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 shrink-0">
        {oauthData ? (
          <div className="flex items-center gap-2">
            {oauthData.oauth_photo_url ? (
              <img
                src={oauthData.oauth_photo_url}
                alt=""
                className="w-8 h-8 rounded-full object-cover shrink-0"
              />
            ) : (
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-200 text-gray-600 text-xs font-medium shrink-0">
                {(oauthData.oauth_first_name?.[0] ?? '').toUpperCase()}
                {(oauthData.oauth_last_name?.[0] ?? '').toUpperCase()}
              </span>
            )}
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-900 leading-tight">
                {oauthData.oauth_first_name} {oauthData.oauth_last_name}
              </span>
              <span className="text-xs text-gray-400 leading-tight">
                {oauthData.oauth_email}
              </span>
            </div>
          </div>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-3">
          <div ref={setWizardSlotEl} className="flex items-center" />
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            className="text-gray-800 hover:text-gray-700 transition-colors"
          >
            <Gear size={16} />
          </button>
        </div>
      </header>
      <div id="main-scroll" className="flex-1 overflow-y-auto">
        <ExploreTab
          selfMode
          onLogout={onLogout}
          activeTabId={activeTabId}
          currentUrl={currentUrl}
          wizardPortalTarget={wizardSlotEl}
        />
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
