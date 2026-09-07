import { createClient } from '@supabase/supabase-js'

export class AuthenticationError extends Error {
  constructor(message = 'Debes iniciar sesión para continuar.') {
    super(message)
    this.name = 'AuthenticationError'
    this.statusCode = 401
  }
}

function getAccessToken(req) {
  const authorization = req.headers?.authorization || req.headers?.Authorization || ''
  const [scheme, token] = authorization.split(' ')
  return scheme?.toLowerCase() === 'bearer' && token ? token : null
}

export async function getAuthenticatedRequest(req) {
  const accessToken = getAccessToken(req)
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Faltan las variables de Supabase en el servidor.')
  if (!accessToken) throw new AuthenticationError()

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
  const { data, error } = await client.auth.getUser(accessToken)
  if (error || !data.user) throw new AuthenticationError()
  return { accessToken, client, user: data.user }
}
