export interface ProfileLocation {
  city: string;
  country_code: string;
  max_distance_km: number | null;
}

export interface ProfileBasicInfo {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  gender: string;
  github: string;
  linkedin: string;
  location: ProfileLocation;
  languages: string[];
  experience_level: string;
  experience_since: string;
  job_search_status: string;
  soft_skills: string[];
  cv_summary_bullets: string[];
}

export interface WorkExperienceEntry {
  title: string;
  company: string;
  date_from: string;
  date_to?: string;
  description?: string;
  [key: string]: unknown;
}

export interface EducationEntry {
  [key: string]: unknown;
}

export interface CertificationEntry {
  [key: string]: unknown;
}

export interface OwnProjectEntry {
  [key: string]: unknown;
}

export interface RedFlagEntry {
  [key: string]: unknown;
}

export interface ProfilePreferences {
  salary: unknown[];
  work_model: string[];
  target_role: string[];
  company_type: string[];
  company_type_excluded: string[];
  employment_type: string[];
  industries: string[];
  markets: string[];
  learning_goals: string[];
  max_office_days_per_week: number | null;
  office_location_cities: string[];
}

export interface Profile {
  basic_info: ProfileBasicInfo;
  skills: Record<string, string[]>;
  work_experience: WorkExperienceEntry[];
  education: EducationEntry[];
  certifications: CertificationEntry[];
  own_projects: OwnProjectEntry[];
  red_flags: RedFlagEntry[];
  preferences: ProfilePreferences;
}

export type WizardTabId =
  | 'basic_info'
  | 'work_experience'
  | 'skills'
  | 'preferences'
  | 'education'
  | 'own_projects'
  | 'certifications'
  | 'red_flags';

export interface TabCompletion {
  id: WizardTabId;
  label: string;
  shortLabel: string;
  optional: boolean;
  missingCount: number;
  hasEntry: boolean;
}
