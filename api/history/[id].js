import { getAnalysis } from '../_lib/storage.js'
import { getAuthenticatedRequest, AuthenticationError } from '../_lib/auth.js'

export const config = { runtime: 'nodejs' }

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0')
  res.setHeader('Vary', 'Authorization')
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido.' })
  try {
    const { accessToken } = await getAuthenticatedRequest(req)
    const item = await getAnalysis({ id: req.query?.id, accessToken })
    if (!item) return res.status(404).json({ error: 'Análisis no encontrado.' })
    return res.status(200).json(item)
  } catch (error) {
    if (error instanceof AuthenticationError) return res.status(error.statusCode).json({ error: error.message })
    console.error('[tdr-check] history item:', error)
    return res.status(500).json({ error: 'No pudimos cargar este análisis.' })
  }
}
