import { listAnalyses } from '../_lib/storage.js'

export const config = { runtime: 'nodejs20.x' }

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido.' })
  try {
    const items = await listAnalyses(Number(req.query?.limit) || 20)
    return res.status(200).json({ items })
  } catch (error) {
    console.error('[tdr-check] history:', error)
    return res.status(500).json({ error: 'No pudimos cargar el historial.' })
  }
}
