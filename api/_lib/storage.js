import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

function nowIso() {
  return new Date().toISOString()
}

function canonicalizeText(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .trim()
}

function contentHash(value) {
  return crypto.createHash('sha256').update(canonicalizeText(value), 'utf8').digest('hex')
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
    content_hash: contentHash(text),
    title: title || 'TDR sin título',
    tdr_text: text,
    findings,
    summary,
    engine: engine || 'ollama-cloud',
    created_at: createdAt,
  })
  if (error) {
    if (error.code === '23505') {
      const existing = await findAnalysisByText({ text, accessToken })
      if (existing) return { id: existing.id, createdAt: existing.createdAt, synced: true, cached: true, analysis: existing }
    }
    throw error
  }
  return { id, createdAt, synced: true }
}

export async function updateAnalysis({ id, findings, summary, engine, accessToken }) {
  const remote = getSupabase(accessToken)
  const { data, error } = await remote
    .from('tdr_analyses')
    .update({ findings, summary, engine: engine || 'ollama-cloud' })
    .eq('id', id)
    .select('*')
    .maybeSingle()
  if (error) throw error
  return data ? mapRow(data) : null
}

export async function findOwnAnalysisByText({ text, accessToken }) {
  const remote = getSupabase(accessToken)
  const { data, error } = await remote
    .from('tdr_analyses')
    .select('*')
    .eq('content_hash', contentHash(text))
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ? mapRow(data) : null
}

export async function findSharedAnalysisByText({ text, accessToken }) {
  const remote = getSupabase(accessToken)
  const { data, error } = await remote.rpc('get_tdr_analysis_cache', {
    p_content_hash: contentHash(text),
  })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return row
    ? {
        findings: row.findings || [],
        summary: row.summary || {},
        engine: row.engine || 'ollama-cloud',
      }
    : null
}

export async function saveSharedAnalysis({ text, findings, summary, engine, accessToken }) {
  const remote = getSupabase(accessToken)
  const { data, error } = await remote.rpc('save_tdr_analysis_cache', {
    p_content_hash: contentHash(text),
    p_tdr_text: text,
    p_findings: findings,
    p_summary: summary,
    p_engine: engine || 'ollama-cloud',
  })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('No se pudo obtener el análisis canónico compartido.')
  return {
    findings: row.findings || [],
    summary: row.summary || {},
    engine: row.engine || 'ollama-cloud',
  }
}

export async function listAnalyses({ accessToken, limit = 20 }) {
  const remote = getSupabase(accessToken)
  const { data, error } = await remote
    .from('tdr_analyses')
    .select('id,title,findings,summary,engine,created_at,content_hash')
    .order('created_at', { ascending: false })
    .limit(Math.min(Number(limit) || 20, 50))
  if (error) throw error
  const unique = new Map()
  for (const row of data || []) {
    if (!unique.has(row.content_hash)) unique.set(row.content_hash, mapRow(row))
  }
  return [...unique.values()]
}

export async function getAnalysis({ id, accessToken }) {
  const remote = getSupabase(accessToken)
  const { data, error } = await remote.from('tdr_analyses').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data ? mapRow(data) : null
}
