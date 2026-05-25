// pages/api/indexar.js

import { createClient } from '@supabase/supabase-js'
import mammoth from 'mammoth'
import formidable from 'formidable'
import fs from 'fs'

export const config = {
  api: { bodyParser: false }
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function verificarAdmin(token) {
  if (!token) return false
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return false
  const { data: perfil } = await supabaseAdmin
    .from('perfis').select('cargo').eq('id', user.id).single()
  return perfil?.cargo === 'Administrador'
}

async function extrairTexto(caminhoArquivo) {
  const buffer = fs.readFileSync(caminhoArquivo)
  const resultado = await mammoth.extractRawText({ buffer })
  return resultado.value
}

function detectarTipo(texto) {
  const linhas = texto.split('\n').filter(l => l.trim())
  const nArtigos = linhas.filter(l => /^Art\.\s+\d+/i.test(l.trim())).length
  if (nArtigos >= 3) return 'artigos'
  if (nArtigos === 0 && linhas.length < 100) return 'lista'
  return 'tabela'
}

function chunkarPorArtigo(texto, nomeDoc) {
  const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean)
  const REGEX_ARTIGO = /^Art\.\s+\d+[\wº°]?(?:-[A-Z])?\b/i
  const REGEX_SECAO = /^(LIVRO|TÍTULO|TITULO|CAPÍTULO|CAPITULO|SEÇÃO|SECAO|SUBSEÇÃO|SUBSECAO|ANEXO|SUBANEXO)\b/i

  const chunks = []
  let artigoAtual = []
  let numeroArtigo = null
  const contexto = []

  function salvar() {
    if (artigoAtual.length && numeroArtigo) {
      const cab = contexto.slice(-3).join(' › ')
      let trecho = artigoAtual.join('\n')
      if (cab) trecho = `[${cab}]\n${trecho}`
      chunks.push({
        nome_documento: nomeDoc,
        trecho,
        metadata: { artigo: numeroArtigo, secao: cab, fonte: nomeDoc }
      })
    }
  }

  for (const linha of linhas) {
    if (REGEX_SECAO.test(linha) && linha.length < 150) {
      contexto.push(linha)
      continue
    }
    if (REGEX_ARTIGO.test(linha)) {
      salvar()
      artigoAtual = [linha]
      const m = linha.match(/^Art\.\s+(\d+[\wº°]?(?:-[A-Z])?)/)
      numeroArtigo = m ? m[1] : linha.slice(0, 20)
    } else if (artigoAtual.length) {
      artigoAtual.push(linha)
    }
  }
  salvar()
  return chunks
}

function chunkarBloco(texto, nomeDoc) {
  const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean)
  const BLOCO = 15
  const chunks = []
  for (let i = 0; i < linhas.length; i += BLOCO) {
    const trecho = `[${nomeDoc}]\n` + linhas.slice(i, i + BLOCO).join('\n')
    chunks.push({
      nome_documento: nomeDoc,
      trecho,
      metadata: { tipo: 'bloco', bloco: Math.floor(i / BLOCO) + 1, fonte: nomeDoc }
    })
  }
  return chunks
}

// Trunca texto para no máximo ~6000 caracteres (~7500 tokens), com margem de segurança
function truncar(texto, maxChars = 6000) {
  return texto.length > maxChars ? texto.slice(0, maxChars) : texto
}

async function gerarEmbeddings(textos) {
  const truncados = textos.map(t => truncar(t))
  const resp = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: truncados })
  })
  const data = await resp.json()
  if (!resp.ok) throw new Error(data.error?.message || 'Erro na API OpenAI')
  return data.data.map(d => d.embedding)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' })

  // Parseia o form primeiro (bodyParser: false exige isso)
  const form = formidable({ maxFileSize: 50 * 1024 * 1024, keepExtensions: true })
  let fields, files
  try {
    ;[fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, f, fi) => err ? reject(err) : resolve([f, fi]))
    })
  } catch (err) {
    return res.status(400).json({ error: 'Erro ao receber arquivo: ' + err.message })
  }

  // Token pode vir no header OU no campo do form
  const tokenHeader = req.headers.authorization?.replace('Bearer ', '')
  const tokenForm = Array.isArray(fields.token) ? fields.token[0] : fields.token
  const token = tokenHeader || tokenForm

  const isAdmin = await verificarAdmin(token)
  if (!isAdmin) return res.status(403).json({ error: 'Acesso negado' })

  // Rate limit: máx 10 uploads por minuto por IP
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown'
  const rlKey = `indexar:${ip}`
  if (!global._rl) global._rl = new Map()
  const now = Date.now()
  const rl = global._rl.get(rlKey) || { count: 0, start: now }
  if (now - rl.start > 60000) {
    global._rl.set(rlKey, { count: 1, start: now })
  } else if (rl.count >= 10) {
    return res.status(429).json({ error: 'Muitos uploads. Aguarde um momento.' })
  } else {
    global._rl.set(rlKey, { ...rl, count: rl.count + 1 })
  }

  const arquivo = Array.isArray(files.arquivo) ? files.arquivo[0] : files.arquivo
  const nomeDoc = (Array.isArray(fields.nome) ? fields.nome[0] : fields.nome) || arquivo?.originalFilename
  const limpar = (Array.isArray(fields.limpar) ? fields.limpar[0] : fields.limpar) === 'true'

  if (!arquivo) return res.status(400).json({ error: 'Nenhum arquivo enviado' })

  try {
    const texto = await extrairTexto(arquivo.filepath)
    const tipo = detectarTipo(texto)
    const chunks = tipo === 'artigos'
      ? chunkarPorArtigo(texto, nomeDoc)
      : chunkarBloco(texto, nomeDoc)

    if (chunks.length === 0) {
      return res.status(400).json({ error: 'Nenhum conteúdo encontrado no arquivo' })
    }

    if (limpar) {
      await supabaseAdmin.from('documentos_legislacao')
        .delete().eq('nome_documento', nomeDoc)
    }

    const LOTE = 20
    let inseridos = 0
    for (let i = 0; i < chunks.length; i += LOTE) {
      const lote = chunks.slice(i, i + LOTE)
      const embeddings = await gerarEmbeddings(lote.map(c => c.trecho))
      const rows = lote.map((c, j) => ({
        nome_documento: c.nome_documento,
        trecho: c.trecho,
        embedding: embeddings[j],
        metadata: c.metadata
      }))
      const { error } = await supabaseAdmin.from('documentos_legislacao').insert(rows)
      if (error) throw new Error(`Erro Supabase: ${error.message}`)
      inseridos += rows.length
    }

    try { fs.unlinkSync(arquivo.filepath) } catch (_) {}

    return res.status(200).json({ ok: true, tipo, chunks: chunks.length, inseridos, documento: nomeDoc })

  } catch (err) {
    console.error('Erro indexação:', err)
    return res.status(500).json({ error: err.message || 'Erro interno' })
  }
}
