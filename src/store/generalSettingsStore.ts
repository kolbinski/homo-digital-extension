import { useSyncExternalStore } from 'react';
import { API_BASE_URL } from '../config';

const CACHE_KEY = 'general_settings_cache';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface GeneralSettings {
  currencies: string[];
  employment_type_units?: string[];
  industries: string[];
  markets: string[];
  company_types: string[];
  countries: { code: string; name: string }[];
  languages: string[];
  language_levels: string[];
  experience_levels: string[];
  show_source_filter?: boolean;
  pro_price?: { formatted: string };
  scan_package_price?: { formatted: string } | null;
  package_page_scans_amount?: number;
  cv_package_amount?: number;
  cv_package_price?: { formatted: string } | null;
  cl_package_amount?: number;
  cl_package_price?: { formatted: string } | null;
  plans?: {
    free: { max_apply_now: number; max_scan_page: number; max_cv: number; max_cl: number };
    pro: { max_scan_page: number; max_cv: number; max_cl: number };
    premium: { max_scan_page: number; max_cv: number; max_cl: number };
  };
}

interface StoreState {
  settings: GeneralSettings | null;
  loaded: boolean;
}

let state: StoreState = { settings: null, loaded: false };
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach(fn => fn());
}

export const generalSettingsStore = {
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  getSnapshot(): StoreState {
    return state;
  },

  async fetch(): Promise<void> {
    if (state.loaded) return;

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      try {
        const result = await chrome.storage.local.get(CACHE_KEY);
        const cached = result[CACHE_KEY] as
          | { data: GeneralSettings; timestamp: number }
          | undefined;
        if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
          state = { settings: cached.data, loaded: true };
          notify();
          return;
        }
      } catch {
        // fall through to API fetch
      }
    }

    try {
      const res = await window.fetch(`${API_BASE_URL}/v1/general-settings`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data: GeneralSettings = await res.json();
      state = { settings: data, loaded: true };
      notify();

      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local
          .set({ [CACHE_KEY]: { data, timestamp: Date.now() } })
          .catch(() => {});
      }
    } catch {
      state = { settings: null, loaded: true };
      notify();
    }
  },
};

export function useGeneralSettings(): StoreState {
  return useSyncExternalStore(
    generalSettingsStore.subscribe,
    generalSettingsStore.getSnapshot,
  );
}
