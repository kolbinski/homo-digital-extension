import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { API_BASE_URL } from '../config';
import OnboardingWizard from './onboarding/OnboardingWizard';
import type { Profile } from './onboarding/types';

interface Props {
  onLogout: () => void;
}

type ProfileState = 'loading' | 'onboarding' | 'loaded';

export default function ClientView({ onLogout }: Props) {
  const { getSupabaseToken } = useAuth();
  const [profileState, setProfileState] = useState<ProfileState>('loading');
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    getSupabaseToken().then(async token => {
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

  if (profileState === 'loading') return null;

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
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <h2 className="text-xl font-semibold text-gray-900">Your Dashboard</h2>
        {profile?.basic_info?.email && (
          <p className="text-sm text-gray-500">{profile.basic_info.email}</p>
        )}
        <button
          type="button"
          onClick={onLogout}
          className="text-sm font-medium text-white px-5 py-2 rounded-md transition-colors bg-red-600"
        >
          Logout
        </button>
      </div>
    </div>
  );
}
