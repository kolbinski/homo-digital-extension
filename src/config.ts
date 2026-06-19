export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  'https://job-matcher-api-production.up.railway.app';
export const CONFIG = {
  auth: {
    google: true,
    facebook: false,
    microsoft: false,
    github: true,
  },
  use_template_cv: true,
};
