import { listRegisteredUsers } from './_lib/storage.js'
import { getAuthenticatedRequest, AuthenticationError } from './_lib/auth.js'

export const config = { runtime: 'nodejs' }

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0')
  res.setHeader('Vary', 'Authorization')
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido.' })
  try {
    const { accessToken } = await getAuthenticatedRequest(req)
    const items = await listRegisteredUsers({ accessToken })
    return res.status(200).json({ items })
  } catch (error) {
    if (error instanceof AuthenticationError) return res.status(error.statusCode).json({ error: error.message })
    console.error('[tdr-check] users:', error)
    return res.status(500).json({ error: 'No pudimos cargar la lista de usuarios.' })
  }
}
