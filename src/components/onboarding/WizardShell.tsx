import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle,
  CloudArrowUp,
  CloudCheck,
  CloudLightning,
  QuestionIcon,
  SignOut,
} from '@phosphor-icons/react';
import { useAuth } from '../../hooks/useAuth';
import { API_BASE_URL } from '../../config';
import type { Profile, WizardTabId } from './types';
import { getTabCompletions, allRequiredComplete } from './completionChecks';
import BasicInfoTab from './tabs/BasicInfoTab';
import CertificationsTab from './tabs/CertificationsTab';
import EducationTab from './tabs/EducationTab';
import OwnProjectsTab from './tabs/OwnProjectsTab';
import PreferencesTab from './tabs/PreferencesTab';
import RedFlagsTab from './tabs/RedFlagsTab';
import SkillsTab from './tabs/SkillsTab';
import WorkExperienceTab from './tabs/WorkExperienceTab';

type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface Props {
  profile: Profile;
  onChange: (profile: Profile) => void;
  onLogout: () => void;
  onSubmitted: () => void;
}

export default function WizardShell({
  profile,
  onChange,
  onLogout,
  onSubmitted,
}: Props) {
  const { getToken } = useAuth();
  const [activeTab, setActiveTab] = useState<WizardTabId>('basic_info');
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>('idle');
  const [submitting, setSubmitting] = useState(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const completions = getTabCompletions(profile);
  const allComplete = allRequiredComplete(completions);
  const activeCompletion = completions.find(t => t.id === activeTab)!;
  const totalErrors = completions.reduce((sum, t) => sum + t.missingCount, 0);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setAutoSaveStatus('saving');
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      autoSaveTimerRef.current = null;
      try {
        const token = await getTokenRef.current();
        const res = await fetch(`${API_BASE_URL}/v1/profile`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ profile }),
        });
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        setAutoSaveStatus('saved');
      } catch {
        setAutoSaveStatus('error');
      }
    }, 2000);
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [profile]);

  async function handleSubmit() {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    setSubmitting(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/v1/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ profile, profile_ready: true }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      onSubmitted();
    } catch {
      setAutoSaveStatus('error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 shrink-0">
        <span className="text-sm font-semibold text-gray-900">
          Great jobs start with a great profile
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
                className={`flex flex-row items-center gap-1 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
                style={{ marginLeft: 8 }}
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
                    style={{ fontSize: 8, width: 16, height: 16 }}
                  >
                    {tab.missingCount}
                  </span>
                )}
                {showGray && (
                  <QuestionIcon
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
      <div
        className="flex-1 overflow-y-auto py-4 px-2"
        style={{ paddingBottom: 300 }}
      >
        <h2 className="text-base font-semibold text-gray-900 mb-3">
          {activeCompletion.label}
        </h2>
        {activeTab === 'basic_info' ? (
          <BasicInfoTab
            basicInfo={profile.basic_info}
            onChange={basicInfo =>
              onChange({ ...profile, basic_info: basicInfo })
            }
          />
        ) : activeTab === 'work_experience' ? (
          <WorkExperienceTab
            workExperience={profile.work_experience}
            onChange={work_experience =>
              onChange({ ...profile, work_experience })
            }
          />
        ) : activeTab === 'certifications' ? (
          <CertificationsTab
            certifications={profile.certifications}
            onChange={certs => onChange({ ...profile, certifications: certs })}
          />
        ) : activeTab === 'education' ? (
          <EducationTab
            education={profile.education}
            onChange={education => onChange({ ...profile, education })}
          />
        ) : activeTab === 'own_projects' ? (
          <OwnProjectsTab
            projects={profile.own_projects}
            onChange={projects =>
              onChange({ ...profile, own_projects: projects })
            }
          />
        ) : activeTab === 'skills' ? (
          <SkillsTab
            skills={profile.skills}
            onChange={skills => onChange({ ...profile, skills })}
          />
        ) : activeTab === 'preferences' ? (
          <PreferencesTab
            preferences={profile.preferences}
            onChange={preferences => onChange({ ...profile, preferences })}
          />
        ) : activeTab === 'red_flags' ? (
          <RedFlagsTab
            redFlags={profile.red_flags}
            onChange={flags => onChange({ ...profile, red_flags: flags })}
          />
        ) : (
          <p className="text-sm text-gray-400">
            Tab content coming soon — {activeCompletion.label}
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 bg-white border-t border-gray-200 px-4 py-3 flex items-center gap-2">
        {/* Left: error / all-clear indicator */}
        <div className="flex items-center">
          {totalErrors > 0 ? (
            <span
              className="inline-flex items-center justify-center rounded-full bg-red-500 text-white leading-none font-medium"
              style={{
                fontSize: 11,
                minWidth: 20,
                height: 20,
                padding: '0 4px',
              }}
            >
              {totalErrors}
            </span>
          ) : (
            <CheckCircle size={20} weight="fill" className="text-green-500" />
          )}
        </div>

        {/* Right: save status + Submit grouped */}
        <div className="flex-1 flex items-center justify-end gap-3">
          <div className="flex items-center gap-1">
            {autoSaveStatus === 'saving' && (
              <>
                <span className="text-sm text-gray-400">Saving...</span>
                <CloudArrowUp size={20} className="text-gray-400" />
              </>
            )}
            {autoSaveStatus === 'saved' && (
              <>
                <span className="text-sm text-gray-400">Saved</span>
                <CloudCheck size={20} className="text-gray-400" />
              </>
            )}
            {autoSaveStatus === 'error' && (
              <>
                <span className="text-xs text-red-400">Save failed</span>
                <CloudLightning size={15} className="text-red-400" />
              </>
            )}
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !allComplete}
            title={
              !allComplete ? 'Complete all required tabs first' : undefined
            }
            className="px-4 py-2 text-sm font-medium text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-green-600"
          >
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}
