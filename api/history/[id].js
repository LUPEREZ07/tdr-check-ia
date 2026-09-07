import { getAnalysis } from '../_lib/storage.js'

export const config = { runtime: 'nodejs20.x' }

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido.' })
  try {
    const item = await getAnalysis(req.query?.id)
    if (!item) return res.status(404).json({ error: 'Análisis no encontrado.' })
    return res.status(200).json(item)
  } catch (error) {
    console.error('[tdr-check] history item:', error)
    return res.status(500).json({ error: 'No pudimos cargar este análisis.' })
  }
}
