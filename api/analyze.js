import { analyzeTdr, ANALYSIS_VERSION, MAX_TDR_CHARACTERS } from './_lib/analysis.js'
import { findOwnAnalysisByText, findSharedAnalysisByText, saveAnalysis, saveSharedAnalysis, updateAnalysis } from './_lib/storage.js'
import { getAuthenticatedRequest, AuthenticationError } from './_lib/auth.js'

export const config = { runtime: 'nodejs', maxDuration: 60 }

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0')
  res.setHeader('Vary', 'Authorization')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' })
  try {
    const { accessToken, user } = await getAuthenticatedRequest(req)
    const { text, title } = req.body || {}
    if (typeof text !== 'string' || text.trim().length < 30) {
      return res.status(400).json({ error: 'Pega un TDR de al menos 30 caracteres para iniciar la revisión.' })
    }
    if (text.length > MAX_TDR_CHARACTERS) return res.status(413).json({ error: `El TDR supera el límite técnico de ${MAX_TDR_CHARACTERS.toLocaleString('es-PE')} caracteres.` })
    const sharedCached = await findSharedAnalysisByText({ text, analysisVersion: ANALYSIS_VERSION, accessToken })
    const ownCached = await findOwnAnalysisByText({ text, analysisVersion: ANALYSIS_VERSION, accessToken })
    if (sharedCached) {
      if (ownCached) {
        const refreshed = await updateAnalysis({ id: ownCached.id, ...sharedCached, analysisVersion: ANALYSIS_VERSION, accessToken })
        return res.status(200).json({ ...(refreshed || { ...ownCached, ...sharedCached }), synced: true, cached: true })
      }
      const saved = await saveAnalysis({ title: title?.trim() || 'TDR sin título', text, ...sharedCached, analysisVersion: ANALYSIS_VERSION, userId: user.id, accessToken })
      if (saved.analysis) return res.status(200).json({ ...saved.analysis, synced: true, cached: true })
      return res.status(200).json({ ...sharedCached, id: saved.id, createdAt: saved.createdAt, synced: saved.synced, cached: true })
    }

    const analysis = await analyzeTdr(text)
    const canonical = await saveSharedAnalysis({ text, ...analysis, analysisVersion: ANALYSIS_VERSION, accessToken })
    const saved = await saveAnalysis({ title: title?.trim() || 'TDR sin título', text, ...canonical, analysisVersion: ANALYSIS_VERSION, userId: user.id, accessToken })
    if (saved.analysis) return res.status(200).json({ ...saved.analysis, synced: true, cached: true })
    return res.status(200).json({ ...canonical, id: saved.id, createdAt: saved.createdAt, synced: saved.synced, cached: Boolean(sharedCached) })
  } catch (error) {
    if (error instanceof AuthenticationError) return res.status(error.statusCode).json({ error: error.message })
    console.error('[tdr-check] analyze:', error)
    return res.status(500).json({ error: 'No pudimos completar la revisión. Intenta nuevamente.' })
  }
}
