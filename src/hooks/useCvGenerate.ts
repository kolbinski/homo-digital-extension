import { API_BASE_URL } from '../config'
import { useAuth } from './useAuth'
import type { Client } from './useClients'

type GenerateResult = { success: true } | { success: false; error: string }

function extractSlug(text: string): string {
  const firstLine = text.split('\n').find((l) => l.trim().length > 3) ?? text
  return firstLine.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function buildFilename(client: Client, offerText: string): string {
  const namePart = `${client.first_name}_${client.last_name}`.replace(/[^a-zA-Z0-9_]/g, '_')
  const slug = extractSlug(offerText)
  return `CV-${namePart}-${slug}.pdf`
}

export function useCvGenerate() {
  const { getToken } = useAuth()

  async function generateCV(
    client: Client,
    offerText: string,
    cvLanguage: string,
    openAfterDownload: boolean,
  ): Promise<GenerateResult> {
    if (typeof chrome === 'undefined') {
      return { success: false, error: 'Chrome extension context required.' }
    }

    const token = await getToken()
    if (!token) return { success: false, error: 'Not authenticated.' }

    let blob: Blob
    try {
      const res = await fetch(`${API_BASE_URL}/v1/cv/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          client_id: client.id,
          offer_text: offerText,
          cv_language: cvLanguage,
        }),
      })
      if (res.status === 401) return { success: false, error: 'Session expired. Please log in again.' }
      if (!res.ok) return { success: false, error: `CV generation failed (${res.status}). Please try again.` }
      blob = await res.blob()
    } catch (err) {
      console.error('[useCvGenerate] network error:', err)
      return { success: false, error: 'Network error. Check your connection.' }
    }

    return new Promise((resolve) => {
      const blobUrl = URL.createObjectURL(blob)
      const filename = buildFilename(client, offerText)

      chrome.downloads.download(
        { url: blobUrl, filename, conflictAction: 'uniquify', saveAs: false },
        (downloadId) => {
          URL.revokeObjectURL(blobUrl)
          if (chrome.runtime.lastError) {
            console.error('[useCvGenerate] download error:', chrome.runtime.lastError.message)
            resolve({ success: false, error: 'Download failed. Check Chrome download settings.' })
            return
          }
          if (openAfterDownload) {
            chrome.downloads.open(downloadId)
          }
          resolve({ success: true })
        },
      )
    })
  }

  return { generateCV }
}
