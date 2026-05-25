// pages/api/extrair-pdf.js
// Recebe um PDF do TVF/TA e retorna o texto extraído

import formidable from 'formidable'
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

export const config = {
  api: { bodyParser: false }
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function verificarAuth(req) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return false
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  return !error && !!user
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' })

  const autenticado = await verificarAuth(req)
  if (!autenticado) return res.status(401).json({ error: 'Não autorizado' })

  const form = formidable({ maxFileSize: 10 * 1024 * 1024 })
  let fields, files
  try {
    ;[fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, f, fi) => err ? reject(err) : resolve([f, fi]))
    })
  } catch (err) {
    return res.status(400).json({ error: 'Erro ao receber arquivo: ' + err.message })
  }

  const arquivo = Array.isArray(files.pdf) ? files.pdf[0] : files.pdf
  if (!arquivo) return res.status(400).json({ error: 'Nenhum arquivo enviado' })

  try {
    const buffer = fs.readFileSync(arquivo.filepath)
    const pdfParse = (await import('pdf-parse')).default
    const data = await pdfParse(buffer)

    // Limpa o texto extraído
    const texto = data.text
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    try { fs.unlinkSync(arquivo.filepath) } catch (_) {}

    return res.status(200).json({ texto, paginas: data.numpages })

  } catch (err) {
    console.error('Erro ao extrair PDF:', err)
    return res.status(500).json({ error: 'Erro ao extrair texto do PDF: ' + err.message })
  }
}
