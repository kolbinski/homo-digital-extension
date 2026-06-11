import type { Profile, TabCompletion, WizardTabId } from './types';

function countMissingBasicInfo(p: Profile): number {
  const b = p.basic_info;
  let missing = 0;
  if (!b.first_name?.trim()) missing++;
  if (!b.last_name?.trim()) missing++;
  if (!b.email?.trim()) missing++;
  if (!b.location?.city?.trim()) missing++;
  if (!b.experience_level?.trim()) missing++;
  if (!b.languages?.length) missing++;
  return missing;
}

function countMissingWorkExperience(p: Profile): number {
  if (!p.work_experience?.length) return 1;
  const valid = p.work_experience.some(e => e.title && e.company && e.date_from);
  return valid ? 0 : 1;
}

function countMissingSkills(p: Profile): number {
  const hasSkill = Object.values(p.skills ?? {}).some(arr => arr.length > 0);
  return hasSkill ? 0 : 1;
}

function countMissingPreferences(p: Profile): number {
  const pref = p.preferences;
  let missing = 0;
  if (!pref.salary?.length) missing++;
  if (!pref.work_model?.length) missing++;
  if (!pref.target_role?.length) missing++;
  return missing;
}

const TAB_META: Array<{
  id: WizardTabId;
  label: string;
  shortLabel: string;
  optional: boolean;
}> = [
  { id: 'basic_info',      label: 'Basic Info',      shortLabel: 'Basic',     optional: false },
  { id: 'work_experience', label: 'Work Experience', shortLabel: 'Work Exp',  optional: false },
  { id: 'skills',          label: 'Skills',          shortLabel: 'Skills',    optional: false },
  { id: 'preferences',     label: 'Preferences',     shortLabel: 'Prefs',     optional: false },
  { id: 'education',       label: 'Education',       shortLabel: 'Education', optional: true  },
  { id: 'own_projects',    label: 'Own Projects',    shortLabel: 'Projects',  optional: true  },
  { id: 'certifications',  label: 'Certifications',  shortLabel: 'Certs',     optional: true  },
  { id: 'red_flags',       label: 'Red Flags',       shortLabel: 'Red Flags', optional: true  },
];

export { TAB_META };

export function getTabCompletions(profile: Profile): TabCompletion[] {
  return TAB_META.map(tab => {
    let missingCount = 0;
    let hasEntry = false;

    if (!tab.optional) {
      switch (tab.id) {
        case 'basic_info':      missingCount = countMissingBasicInfo(profile); break;
        case 'work_experience': missingCount = countMissingWorkExperience(profile); break;
        case 'skills':          missingCount = countMissingSkills(profile); break;
        case 'preferences':     missingCount = countMissingPreferences(profile); break;
      }
    } else {
      switch (tab.id) {
        case 'education':      hasEntry = (profile.education?.length ?? 0) > 0; break;
        case 'own_projects':   hasEntry = (profile.own_projects?.length ?? 0) > 0; break;
        case 'certifications': hasEntry = (profile.certifications?.length ?? 0) > 0; break;
        case 'red_flags':      hasEntry = (profile.red_flags?.length ?? 0) > 0; break;
      }
    }

    return { ...tab, missingCount, hasEntry };
  });
}

export function allRequiredComplete(completions: TabCompletion[]): boolean {
  return completions.filter(t => !t.optional).every(t => t.missingCount === 0);
}
