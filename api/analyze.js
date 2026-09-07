import { analyzeTdr } from './_lib/analysis.js'
import { saveAnalysis } from './_lib/storage.js'
import { getAuthenticatedRequest, AuthenticationError } from './_lib/auth.js'

export const config = { runtime: 'nodejs20.x', maxDuration: 60 }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' })
  try {
    const { accessToken, user } = await getAuthenticatedRequest(req)
    const { text, title } = req.body || {}
    if (typeof text !== 'string' || text.trim().length < 30) {
      return res.status(400).json({ error: 'Pega un TDR de al menos 30 caracteres para iniciar la revisión.' })
    }
    if (text.length > 60000) return res.status(413).json({ error: 'El TDR supera el límite de 60 000 caracteres.' })
    const analysis = await analyzeTdr(text)
    const saved = await saveAnalysis({ title: title?.trim() || 'TDR sin título', text, ...analysis, userId: user.id, accessToken })
    return res.status(200).json({ ...analysis, id: saved.id, createdAt: saved.createdAt, synced: saved.synced })
  } catch (error) {
    if (error instanceof AuthenticationError) return res.status(error.statusCode).json({ error: error.message })
    console.error('[tdr-check] analyze:', error)
    return res.status(500).json({ error: 'No pudimos completar la revisión. Intenta nuevamente.' })
  }
}
