import { useEffect, useState } from 'react';
import { Gear } from '@phosphor-icons/react';
import Spinner from './Spinner';
import { useAuth } from '../hooks/useAuth';
import { getSupabaseJwt } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
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

export default function ClientView({ onLogout, activeTabId, currentUrl }: Props) {
  const { getToken } = useAuth();
  const [profileState, setProfileState] = useState<ProfileState>('loading');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    getSupabaseJwt().then(async jwt => {
      if (jwt) {
        await supabase.auth.setSession({ access_token: jwt, refresh_token: '' });
      }
    });
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
        const { profile: dbProfile, profile_ready } = (await res.json()) as {
          profile: Profile | null;
          profile_ready: boolean;
        };
        if (!dbProfile) {
          setProfileState('onboarding');
        } else if (!profile_ready) {
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
      <div className="flex items-center justify-center min-h-screen">
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
        <span />
        <div className="flex items-center gap-3">
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
