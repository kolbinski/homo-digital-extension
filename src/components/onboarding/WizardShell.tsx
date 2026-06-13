import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle,
  CloudArrowUp,
  CloudCheck,
  CloudLightning,
  Gear,
  QuestionIcon,
  X,
} from '@phosphor-icons/react';
import { useAuth } from '../../hooks/useAuth';
import { API_BASE_URL } from '../../config';
import Spinner from '../Spinner';
import SettingsDrawer from '../SettingsDrawer';
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
  onLogout?: () => void;
  onSubmitted: () => void;
  clientId?: string;
  onClose?: () => void;
  onSaved?: (profile: Profile) => void;
}

export default function WizardShell({
  profile,
  onChange,
  onLogout,
  onSubmitted,
  clientId,
  onClose,
  onSaved,
}: Props) {
  const { getToken } = useAuth();
  const [activeTab, setActiveTab] = useState<WizardTabId>('basic_info');
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>('saved');
  const [submitting, setSubmitting] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);
  const tabBodyRef = useRef<HTMLDivElement>(null);
  const getAuthTokenRef = useRef(getToken);
  getAuthTokenRef.current = getToken;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const completions = getTabCompletions(profile);
  const allComplete = allRequiredComplete(completions);
  const activeCompletion = completions.find(t => t.id === activeTab)!;
  const totalErrors = completions.reduce((sum, t) => sum + t.missingCount, 0);

  useEffect(() => {
    if (tabBodyRef.current) tabBodyRef.current.scrollTop = 0;
  }, [activeTab]);

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
        const token = await getAuthTokenRef.current();
        console.log('[patchProfile] token:', token?.slice(0, 20));
        const res = await fetch(`${API_BASE_URL}/v1/profile`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            profile,
            ...(clientId ? { client_id: clientId } : {}),
          }),
        });
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        setAutoSaveStatus('saved');
        onSavedRef.current?.(profile);
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
      const token = await getAuthTokenRef.current();
      console.log('[patchProfile] token:', token?.slice(0, 20));
      const res = await fetch(`${API_BASE_URL}/v1/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          profile,
          ...(clientId ? { client_id: clientId } : { profile_ready: true }),
        }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      if (!clientId) {
        void getAuthTokenRef.current().then(t =>
          fetch(`${API_BASE_URL}/v1/profile/trigger-sync`, {
            method: 'POST',
            headers: t ? { Authorization: `Bearer ${t}` } : {},
          }),
        );
      }
      onSubmitted();
    } catch {
      setAutoSaveStatus('error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReview() {
    setIsReviewing(true);
    setReviewError(null);
    try {
      const token = await getAuthTokenRef.current();
      const res = await fetch(`${API_BASE_URL}/v1/onboarding/review-profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ profile }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const html = await res.text();
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);

      const stored = await chrome.storage.local.get('review_tab_id');
      const storedId = stored.review_tab_id as number | undefined;
      let reused = false;

      if (storedId !== undefined) {
        try {
          const existing = await chrome.tabs.get(storedId);
          await chrome.tabs.update(storedId, { url, active: true });
          if (existing.windowId !== undefined) {
            await chrome.windows.update(existing.windowId, { focused: true });
          }
          reused = true;
        } catch {
          // tab was closed — fall through to create a new one
        }
      }

      if (!reused) {
        const tab = await chrome.tabs.create({ url });
        if (tab.id !== undefined) {
          await chrome.storage.local.set({ review_tab_id: tab.id });
        }
      }
    } catch {
      setReviewError('Review failed. Please try again.');
    } finally {
      setIsReviewing(false);
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 shrink-0">
        <span className="text-sm font-semibold text-gray-900">
          Great jobs start with a great profile
        </span>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            disabled={autoSaveStatus === 'saving' || isReviewing || submitting}
            aria-label="Close"
            className="text-gray-800 hover:text-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <X size={16} />
          </button>
        ) : onLogout ? (
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            className="text-gray-800 hover:text-gray-700 transition-colors"
          >
            <Gear size={16} />
          </button>
        ) : null}
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
                    className="text-orange-300 shrink-0"
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
        ref={tabBodyRef}
        className={`flex-1 overflow-y-auto pb-4 px-2 ${isReviewing || submitting ? 'pointer-events-none opacity-50' : ''}`}
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

      {settingsOpen && onLogout && (
        <SettingsDrawer
          onClose={() => setSettingsOpen(false)}
          onLogout={onLogout}
        />
      )}

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

        {/* Right: save status + Review + Submit grouped */}
        <div className="flex-1 flex items-center justify-end gap-2">
          <div className="flex items-center gap-1">
            {autoSaveStatus === 'saving' && (
              <>
                <span className="text-sm text-gray-400">Saving</span>
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
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={handleReview}
              disabled={isReviewing || submitting || autoSaveStatus === 'saving' || totalErrors > 0}
              title={totalErrors > 0 ? 'Fix all errors first' : undefined}
              className="px-4 py-2 text-sm font-medium text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-700 flex items-center gap-1.5"
            >
              {isReviewing ? (
                <>
                  <Spinner size={14} className="text-white" />
                  Reviewing
                </>
              ) : (
                'Review by AI'
              )}
            </button>
            {reviewError && (
              <span className="text-xs text-red-500">{reviewError}</span>
            )}
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={
              submitting ||
              !allComplete ||
              autoSaveStatus === 'saving' ||
              isReviewing
            }
            title={
              !allComplete ? 'Complete all required tabs first' : undefined
            }
            className="px-4 py-2 text-sm font-medium text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-green-600 flex items-center gap-1.5"
          >
            {submitting ? 'Submitting' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}
