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
  missing += (b.languages ?? []).filter(
    l => !l.name?.trim() || !l.level,
  ).length;
  missing += (b.soft_skills ?? []).filter(s => !s.trim()).length;
  missing += (b.cv_summary_bullets ?? []).filter(s => !s.trim()).length;
  return missing;
}

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function countMissingWorkExperience(p: Profile): number {
  if (!p.work_experience?.length) return 1;
  let missing = 0;
  for (const e of p.work_experience) {
    if (!e.title?.trim()) missing++;
    if (!e.company?.trim()) missing++;
    if (!DATE_RE.test(e.date_from ?? '')) missing++;
    if (e.date_to !== null && !DATE_RE.test(e.date_to ?? '')) missing++;
    if (!e.work_model) missing++;
    const projects = e.projects ?? [];
    if (projects.length > 1) {
      missing += projects.filter(proj => !proj.name?.trim()).length;
    }
    for (const proj of projects) {
      if (!proj.role?.trim()) missing++;
      const achievements = proj.achievements ?? [];
      if (achievements.length === 0) {
        missing++;
      } else {
        missing += achievements.filter(a => !a.trim()).length;
      }
    }
  }
  return missing;
}

function countMissingSkills(p: Profile): number {
  const allSkills = Object.values(p.skills ?? {}).flat();
  if (allSkills.length === 0) return 1;
  return allSkills.filter(s => s.since === null).length;
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
  if (!pref.employment_type?.length) missing++;
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
    label: 'Basic info',
    shortLabel: 'Basic',
    optional: false,
  },
  {
    id: 'work_experience',
    label: 'Work experience',
    shortLabel: 'Work exp',
    optional: false,
  },
  {
    id: 'own_projects',
    label: 'Own projects',
    shortLabel: 'Own projects',
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
    shortLabel: 'Preferences',
    optional: false,
  },
  {
    id: 'red_flags',
    label: 'Red flags',
    shortLabel: 'Red flags',
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
          let count = 0;
          for (const p of projects) {
            if (!p.name?.trim()) count++;
            const achs = p.achievements ?? [];
            if (achs.length === 0) count++;
            else count += achs.filter(a => !a.trim()).length;
          }
          missingCount = count;
          break;
        }
        case 'certifications': {
          const certs = profile.certifications ?? [];
          hasEntry = certs.length > 0;
          const CERT_DATE_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
          let count = 0;
          for (const c of certs) {
            if (!c.name?.trim()) count++;
            if (!c.issuer?.trim()) count++;
            if (c.date?.trim() && !CERT_DATE_RE.test(c.date)) count++;
            if (c.url?.trim()) {
              try {
                const u = new URL(c.url);
                if (u.protocol !== 'http:' && u.protocol !== 'https:') count++;
              } catch {
                count++;
              }
            }
          }
          missingCount = count;
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
