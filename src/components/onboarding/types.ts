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
  institution: string;
  degree?: string;
  field?: string;
  thesis?: string;
  gpa?: string;
  date_from?: string;
  date_to?: string;
}

export interface CertificationEntry {
  name: string;
  issuer: string;
  date?: string;
  url?: string;
}

export interface OwnProjectEntry {
  name: string;
  url?: string;
  skills?: string[];
  achievements?: string[];
}

export interface RedFlagEntry {
  category: 'company_type' | 'skills' | 'other';
  description: string[];
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
