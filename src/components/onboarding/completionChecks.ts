import type { Profile, TabCompletion, WizardTabId } from './types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function countMissingBasicInfo(p: Profile): number {
  const b = p.basic_info;
  let missing = 0;
  if (!b.first_name?.trim()) missing++;
  if (!b.last_name?.trim()) missing++;
  if (!b.email?.trim() || !EMAIL_RE.test(b.email)) missing++;
  if (!b.gender?.trim()) missing++;
  if (!b.experience_level?.trim()) missing++;
  if (!b.job_search_status?.trim()) missing++;
  if (!b.languages?.length) missing++;
  missing += (b.languages ?? []).filter(l => !l.name?.trim() || !l.level).length;
  missing += (b.soft_skills ?? []).filter(s => !s.trim()).length;
  missing += (b.cv_summary_bullets ?? []).filter(s => !s.trim()).length;
  return missing;
}

function countMissingWorkExperience(p: Profile): number {
  if (!p.work_experience?.length) return 1;
  let missing = 0;
  for (const e of p.work_experience) {
    if (!e.title?.trim()) missing++;
    if (!e.company?.trim()) missing++;
    if (!e.date_from?.trim()) missing++;
    if (e.date_to !== null && !e.date_to?.trim()) missing++;
    const projects = e.projects ?? [];
    if (projects.length > 1) {
      missing += projects.filter(proj => !proj.name?.trim()).length;
    }
    for (const proj of projects) {
      missing += (proj.achievements ?? []).filter(a => !a.trim()).length;
    }
  }
  return missing;
}

function countMissingSkills(p: Profile): number {
  const hasSkill = Object.values(p.skills ?? {}).some(arr => arr.length > 0);
  return hasSkill ? 0 : 1;
}

function countMissingPreferences(p: Profile): number {
  const pref = p.preferences;
  const salary = pref.salary ?? [];
  const roles = pref.target_role ?? [];
  let missing = 0;
  missing += salary.length === 0 ? 1 : 0;
  missing += salary.filter(s => !s.min).length;
  missing += roles.length === 0 ? 1 : 0;
  missing += roles.filter(r => !r.trim()).length;
  if (!pref.work_model?.length) missing++;
  return missing;
}

const TAB_META: Array<{
  id: WizardTabId;
  label: string;
  shortLabel: string;
  optional: boolean;
}> = [
  {
    id: 'basic_info',
    label: 'Basic Info',
    shortLabel: 'Basic',
    optional: false,
  },
  {
    id: 'work_experience',
    label: 'Work Experience',
    shortLabel: 'Work Exp',
    optional: false,
  },
  {
    id: 'own_projects',
    label: 'Own Projects',
    shortLabel: 'Own Projects',
    optional: true,
  },
  {
    id: 'education',
    label: 'Education',
    shortLabel: 'Education',
    optional: true,
  },
  {
    id: 'certifications',
    label: 'Certifications',
    shortLabel: 'Certs',
    optional: true,
  },
  {
    id: 'skills',
    label: 'Skills',
    shortLabel: 'Skills',
    optional: false,
  },
  {
    id: 'preferences',
    label: 'Preferences',
    shortLabel: 'Prefs',
    optional: false,
  },
  {
    id: 'red_flags',
    label: 'Red Flags',
    shortLabel: 'Red Flags',
    optional: true,
  },
];

export { TAB_META };

export function getTabCompletions(profile: Profile): TabCompletion[] {
  return TAB_META.map(tab => {
    let missingCount = 0;
    let hasEntry = false;

    if (!tab.optional) {
      switch (tab.id) {
        case 'basic_info':
          missingCount = countMissingBasicInfo(profile);
          break;
        case 'work_experience':
          missingCount = countMissingWorkExperience(profile);
          break;
        case 'skills':
          missingCount = countMissingSkills(profile);
          break;
        case 'preferences':
          missingCount = countMissingPreferences(profile);
          break;
      }
    } else {
      switch (tab.id) {
        case 'education': {
          const entries = profile.education ?? [];
          hasEntry = entries.some(e => e.institution?.trim());
          missingCount = entries.filter(e => !e.institution?.trim()).length;
          break;
        }
        case 'own_projects': {
          const projects = profile.own_projects ?? [];
          hasEntry = projects.some(p => p.name?.trim());
          missingCount = projects.filter(p => !p.name?.trim()).length;
          break;
        }
        case 'certifications': {
          const certs = profile.certifications ?? [];
          hasEntry = certs.length > 0;
          missingCount = certs.filter(
            c => !c.name?.trim() || !c.issuer?.trim(),
          ).length;
          break;
        }
        case 'red_flags':
          hasEntry = (profile.red_flags ?? []).some(
            r => r.description?.length > 0,
          );
          break;
      }
    }

    return { ...tab, missingCount, hasEntry };
  });
}

export function allRequiredComplete(completions: TabCompletion[]): boolean {
  return completions.filter(t => !t.optional).every(t => t.missingCount === 0);
}
