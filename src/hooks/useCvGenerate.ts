import { API_BASE_URL } from '../config';
import { useAuth } from './useAuth';

type GenerateResult =
  | { success: true; cvUrl: string; cvStatus: string }
  | { success: false; error: string };

export function useCvGenerate() {
  const { getToken } = useAuth();

  async function generateCV(
    clientId: string,
    offerText: string,
    cvLanguage: string,
    _clientFirstName: string,
    _clientLastName: string,
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
      const data = (await res.json()) as { cv_url: string; cv_status: string };
      return { success: true, cvUrl: data.cv_url, cvStatus: data.cv_status };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { success: false, error: '' };
      }
      return { success: false, error: 'Network error. Check your connection.' };
    }
  }

  return { generateCV };
}
