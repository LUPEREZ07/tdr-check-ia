import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

function nowIso() {
  return new Date().toISOString()
}

function getSupabase(accessToken) {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Faltan las variables de Supabase en el servidor.')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

function mapRow(row) {
  return {
    id: row.id,
    title: row.title,
    text: row.tdr_text,
    findings: row.findings || [],
    summary: row.summary || {},
    engine: row.engine,
    createdAt: row.created_at,
  }
}

export async function saveAnalysis({ title, text, findings, summary, engine, userId, accessToken }) {
  const id = crypto.randomUUID()
  const createdAt = nowIso()
  const remote = getSupabase(accessToken)
  const { error } = await remote.from('tdr_analyses').insert({
    id,
    user_id: userId,
    title: title || 'TDR sin título',
    tdr_text: text,
    findings,
    summary,
    engine: engine || 'ollama-cloud',
    created_at: createdAt,
  })
  if (error) throw error
  return { id, createdAt, synced: true }
}

export async function listAnalyses({ accessToken, limit = 20 }) {
  const remote = getSupabase(accessToken)
  const { data, error } = await remote
    .from('tdr_analyses')
    .select('id,title,findings,summary,engine,created_at')
    .order('created_at', { ascending: false })
    .limit(Math.min(Number(limit) || 20, 50))
  if (error) throw error
  return (data || []).map(mapRow)
}

export async function getAnalysis({ id, accessToken }) {
  const remote = getSupabase(accessToken)
  const { data, error } = await remote.from('tdr_analyses').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data ? mapRow(data) : null
}
