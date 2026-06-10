import slugify from 'slugify';
import { API_BASE_URL } from '../config';
import { useAuth } from './useAuth';

type GenerateResult =
  | { success: true; clipboardFailed: false }
  | { success: true; clipboardFailed: true; filename: string }
  | { success: false; error: string };

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback for extension context where clipboard API requires focus
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}

export function useCvGenerate() {
  const { getToken } = useAuth();

  async function generateCV(
    clientId: string,
    offerText: string,
    cvLanguage: string,
    clientFirstName: string,
    clientLastName: string,
    companyName: string,
    jobTitle: string,
    userOfferId: string,
    signal?: AbortSignal,
  ): Promise<GenerateResult> {
    if (typeof chrome === 'undefined') {
      return { success: false, error: 'Chrome extension context required.' };
    }

    const token = await getToken();
    if (!token) return { success: false, error: 'Not authenticated.' };

    console.log(
      '[useCvGenerate] offer_text length:',
      offerText?.length,
      'preview:',
      offerText?.slice(0, 100),
    );

    let html: string;
    let apiFilename: string | undefined;
    try {
      const res = await fetch(`${API_BASE_URL}/v1/cv/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          client_id: clientId,
          offer_text: offerText,
          cv_language: cvLanguage,
          job_title: jobTitle,
          company_name: companyName,
          user_offer_id: userOfferId,
        }),
        signal,
      });
      if (res.status === 401)
        return { success: false, error: 'Session expired. Please log in again.' };
      if (!res.ok)
        return {
          success: false,
          error: `CV generation failed (${res.status}). Please try again.`,
        };
      const data = (await res.json()) as { html: string; filename?: string };
      html = data.html;
      apiFilename = data.filename;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { success: false, error: '' };
      }
      console.error('[useCvGenerate] network error:', err);
      return { success: false, error: 'Network error. Check your connection.' };
    }

    const filename =
      apiFilename ??
      `cv-${slugify(clientFirstName, { lower: true, strict: true })}-${slugify(clientLastName, { lower: true, strict: true })}-${slugify(companyName, { lower: true, strict: true })}.pdf`;

    let clipboardFailed = false;
    try {
      await copyToClipboard(filename);
    } catch (e) {
      console.warn('[useCvGenerate] clipboard copy failed:', e);
      clipboardFailed = true;
    }

    try {
      const blob = new Blob([html], { type: 'text/html' });
      const dataUrl = URL.createObjectURL(blob);
      await chrome.tabs.create({ url: dataUrl, active: true });
    } catch (err) {
      console.error('[useCvGenerate] tab open error:', err);
      return { success: false, error: 'Could not open CV. Check extension permissions.' };
    }

    if (clipboardFailed) {
      return { success: true, clipboardFailed: true, filename };
    }
    return { success: true, clipboardFailed: false };
  }

  return { generateCV };
}
