import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import initSqlJs from 'sql.js'

let sqlitePromise
let supabase

function nowIso() {
  return new Date().toISOString()
}

function sqlitePath() {
  const configuredPath = process.env.SQLITE_PATH || path.join(process.cwd(), '.data', 'tdr-check.sqlite')
  return process.env.VERCEL ? path.join('/tmp', 'tdr-check.sqlite') : configuredPath
}

async function getSqlite() {
  if (sqlitePromise) return sqlitePromise
  sqlitePromise = (async () => {
    const dbPath = sqlitePath()
    if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    const SQL = await initSqlJs({ locateFile: (file) => path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file) })
    const db = dbPath !== ':memory:' && fs.existsSync(dbPath) ? new SQL.Database(fs.readFileSync(dbPath)) : new SQL.Database()
    db.run(`
    create table if not exists analyses (
      id text primary key,
      title text not null,
      tdr_text text not null,
      findings_json text not null,
      summary_json text not null,
      engine text not null,
      created_at text not null
    );
    create index if not exists analyses_created_at_idx on analyses(created_at desc);
  `)
    return db
  })()
  return sqlitePromise
}

function persistSqlite(db) {
  const dbPath = sqlitePath()
  if (dbPath === ':memory:') return
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  fs.writeFileSync(dbPath, Buffer.from(db.export()))
}

function readRows(db, sql, values = []) {
  const statement = db.prepare(sql)
  statement.bind(values)
  const rows = []
  while (statement.step()) rows.push(statement.getAsObject())
  statement.free()
  return rows
}

function readOne(db, sql, values = []) {
  return readRows(db, sql, values)[0] || null
}

function getSupabase() {
  if (supabase) return supabase
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) return null
  supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return supabase
}

function mapRow(row) {
  return {
    id: row.id,
    title: row.title,
    text: row.tdr_text,
    findings: JSON.parse(row.findings_json || '[]'),
    summary: JSON.parse(row.summary_json || '{}'),
    engine: row.engine,
    createdAt: row.created_at,
  }
}

export async function saveAnalysis({ title, text, findings, summary, engine }) {
  const id = crypto.randomUUID()
  const createdAt = nowIso()
  const db = await getSqlite()
  const statement = db.prepare(`insert into analyses (id, title, tdr_text, findings_json, summary_json, engine, created_at) values (?, ?, ?, ?, ?, ?, ?)`)
  statement.run([id, title || 'TDR sin título', text, JSON.stringify(findings), JSON.stringify(summary), engine || 'ollama-cloud', createdAt])
  statement.free()
  persistSqlite(db)

  const remote = getSupabase()
  let synced = false
  if (remote) {
    const { error } = await remote.from('tdr_analyses').insert({
      id,
      title: title || 'TDR sin título',
      tdr_text: text,
      findings,
      summary,
      engine: engine || 'ollama-cloud',
      created_at: createdAt,
    })
    if (error) console.error('[tdr-check] Supabase insert:', error.message)
    else synced = true
  }
  return { id, createdAt, synced }
}

export async function listAnalyses(limit = 20) {
  const remote = getSupabase()
  if (remote) {
    const { data, error } = await remote.from('tdr_analyses').select('id,title,findings,summary,engine,created_at').order('created_at', { ascending: false }).limit(limit)
    if (!error && data) {
      return data.map((row) => ({ id: row.id, title: row.title, findings: row.findings || [], summary: row.summary || {}, engine: row.engine, createdAt: row.created_at }))
    }
    if (error) console.error('[tdr-check] Supabase list:', error.message)
  }
  const db = await getSqlite()
  const rows = readRows(db, 'select * from analyses order by created_at desc limit ?', [Math.min(Number(limit) || 20, 50)])
  return rows.map(mapRow)
}

export async function getAnalysis(id) {
  const remote = getSupabase()
  if (remote) {
    const { data, error } = await remote.from('tdr_analyses').select('*').eq('id', id).maybeSingle()
    if (!error && data) return { id: data.id, title: data.title, text: data.tdr_text, findings: data.findings || [], summary: data.summary || {}, engine: data.engine, createdAt: data.created_at }
    if (error) console.error('[tdr-check] Supabase get:', error.message)
  }
  const db = await getSqlite()
  const row = readOne(db, 'select * from analyses where id = ?', [id])
  return row ? mapRow(row) : null
}
