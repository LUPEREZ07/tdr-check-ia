import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 70000) reject(new Error('Payload demasiado grande'))
    })
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}) } catch { reject(new Error('JSON inválido')) }
    })
    req.on('error', reject)
  })
}

function responseAdapter(res) {
  let statusCode = 200
  return {
    status(code) { statusCode = code; return this },
    json(payload) {
      res.statusCode = statusCode
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(payload))
      return this
    },
  }
}

function apiDevMiddleware() {
  const attachApiMiddleware = (server) => {
    server.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith('/api/')) return next()
      const url = new URL(req.url, 'http://localhost')
      let handler
      let query = Object.fromEntries(url.searchParams.entries())
      if (url.pathname === '/api/analyze') {
        handler = (await import('./api/analyze.js')).default
      } else if (url.pathname === '/api/history') {
        handler = (await import('./api/history/index.js')).default
      } else if (url.pathname.startsWith('/api/history/')) {
        handler = (await import('./api/history/[id].js')).default
        query = { ...query, id: decodeURIComponent(url.pathname.split('/').at(-1)) }
      } else {
        return next()
      }
      try {
        req.query = query
        req.body = req.method === 'POST' ? await readJsonBody(req) : {}
        await handler(req, responseAdapter(res))
      } catch (error) {
        if (!res.headersSent) {
          res.statusCode = error.message === 'Payload demasiado grande' ? 413 : 400
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ error: error.message || 'Solicitud inválida.' }))
        }
      }
    })
  }

  return {
    name: 'tdr-check-api-dev',
    configureServer: attachApiMiddleware,
    configurePreviewServer: attachApiMiddleware,
  }
}

export default defineConfig(({ mode }) => {
  // Vite exposes VITE_* to the browser, while the local API middleware
  // reads server variables from process.env just like Vercel Functions.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))
  return {
    plugins: [react(), apiDevMiddleware()],
    server: {
      port: 5173,
      host: '0.0.0.0',
      allowedHosts: ['.ngrok-free.dev'],
    },
    preview: {
      port: 5173,
      host: '0.0.0.0',
      allowedHosts: ['.ngrok-free.dev'],
    },
  }
})
