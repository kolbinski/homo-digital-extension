import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import KickstartScreen from './KickstartScreen';
import WizardShell from './WizardShell';
import { emptyProfile } from './emptyProfile';
import type { Profile, SkillEntry } from './types';

interface Props {
  onLogout: () => void;
  onSubmitted: () => void;
}

type Step = 'kickstart' | 'wizard';

function normalizeSkills(
  raw: Record<string, (string | SkillEntry)[]>,
): Record<string, SkillEntry[]> {
  return Object.fromEntries(
    Object.entries(raw).map(([cat, arr]) => [
      cat,
      arr.map(e => (typeof e === 'string' ? { name: e, since: null } : e)),
    ]),
  );
}

function mergeProfile(base: Profile, override: Partial<Profile>): Profile {
  const mergedSkills = { ...base.skills, ...(override.skills ?? {}) };
  return {
    basic_info: { ...base.basic_info, ...(override.basic_info ?? {}) },
    skills: normalizeSkills(mergedSkills as Record<string, (string | SkillEntry)[]>),
    work_experience: override.work_experience ?? base.work_experience,
    education: override.education ?? base.education,
    certifications: override.certifications ?? base.certifications,
    own_projects: override.own_projects ?? base.own_projects,
    red_flags: override.red_flags ?? base.red_flags,
    preferences: { ...base.preferences, ...(override.preferences ?? {}) },
  };
}

export default function OnboardingWizard({ onLogout, onSubmitted }: Props) {
  const { getOAuthData } = useAuth();
  const [step, setStep] = useState<Step>('kickstart');
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getOAuthData().then(oauth => {
      if (oauth) {
        setProfile(prev => ({
          ...prev,
          basic_info: {
            ...prev.basic_info,
            ...(oauth.oauth_first_name != null ? { first_name: oauth.oauth_first_name } : {}),
            ...(oauth.oauth_last_name != null ? { last_name: oauth.oauth_last_name } : {}),
            ...(oauth.oauth_email ? { email: oauth.oauth_email } : {}),
          },
        }));
      }
      setReady(true);
    });
  }, []);

  if (!ready) return null;

  function handlePrepared(prepared: Partial<Profile>) {
    setProfile(prev => mergeProfile(prev, prepared));
    setStep('wizard');
  }

  if (step === 'kickstart') {
    return (
      <KickstartScreen
        onPrepared={handlePrepared}
        onSkip={() => setStep('wizard')}
      />
    );
  }

  return (
    <WizardShell
      profile={profile}
      onChange={setProfile}
      onLogout={onLogout}
      onSubmitted={onSubmitted}
    />
  );
}
