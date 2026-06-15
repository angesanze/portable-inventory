import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const PORT = Number(process.env.PORT) || 3333

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  let pathname = url.pathname

  // Resolve paths:
  //   /          -> demo/index.html
  //   /dist/*    -> sdk/dist/*
  //   /demo/*    -> sdk/demo/*
  //   everything else -> try demo/ first
  let filePath

  if (pathname === '/' || pathname === '/index.html') {
    filePath = join(__dirname, 'index.html')
  } else if (pathname.startsWith('/dist/')) {
    filePath = join(__dirname, '..', pathname)
  } else {
    filePath = join(__dirname, pathname)
  }

  try {
    const content = await readFile(filePath)
    const ext = extname(filePath)
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' })
    res.end(content)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('404 Not Found')
  }
})

server.listen(PORT, () => {
  console.log(`SDK demo server running at http://localhost:${PORT}`)
})
