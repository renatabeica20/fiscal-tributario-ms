// pages/api/indexar.js
// Versão otimizada para maior precisão jurídica do RAG do Oráculo Fiscal MS.
// Principais melhorias: chunking jurídico menor, subchunks para artigos longos,
// metadata enriquecido, limpeza de texto e embeddings mais focados.

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

// Ajustes finos de indexação
const EMBEDDING_MODEL = 'text-embedding-3-small'
const MAX_CHARS_EMBEDDING = 2500
const MAX_CHARS_CHUNK_ARTIGO = 2400
const MAX_LINHAS_BLOCO = 6
const OVERLAP_LINHAS_BLOCO = 1
const LOTE_EMBEDDINGS = 20

async function verificarAdmin(token) {
  if (!token) return false
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return false

  const { data: perfil } = await supabaseAdmin
    .from('perfis')
    .select('cargo')
    .eq('id', user.id)
    .single()

  return perfil?.cargo === 'Administrador'
}

async function extrairTexto(caminhoArquivo) {
  const buffer = fs.readFileSync(caminhoArquivo)
  const resultado = await mammoth.extractRawText({ buffer })
  return limparTexto(resultado.value || '')
}

function limparTexto(texto) {
  return texto
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[ \u00A0]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function detectarTipo(texto) {
  const linhas = texto.split('\n').filter(l => l.trim())
  const nArtigos = linhas.filter(l => /^Art\.\s+\d+/i.test(l.trim())).length

  if (nArtigos >= 3) return 'artigos'
  if (nArtigos === 0 && linhas.length < 100) return 'lista'
  return 'tabela'
}

function normalizarRomano(valor) {
  if (!valor) return null
  return valor.toUpperCase().replace(/[^IVXLCDM]/g, '') || null
}

function extrairMetadataBase(nomeDoc, trecho, extras = {}) {
  const fonte = nomeDoc || 'documento_sem_nome'
  const texto = `${nomeDoc || ''}\n${trecho || ''}`

  const artigo = trecho?.match(/\bArt\.\s*(\d+[\wº°]?(?:-[A-Z])?)\b/i)?.[1] || extras.artigo || null
  const paragrafo = trecho?.match(/§\s*(\d+[ºª°]?|único|unico)/i)?.[0] || null
  const inciso = trecho?.match(/^\s*([IVXLCDM]+)\s*[–—-]/mi)?.[1] || null
  const anexo = texto.match(/\bAnexo\s+([IVXLCDM]+|\d{1,3})\b/i)?.[1] || null
  const subanexo = texto.match(/\bSubanexo\s+([IVXLCDM]+|\d{1,3})\b/i)?.[1] || null
  const capitulo = texto.match(/\bCap[íi]tulo\s+([IVXLCDM]+|\d{1,3})\b/i)?.[0] || null
  const secao = extras.secao || null

  let tipoNorma = 'documento'
  if (/RICMS|Decreto\s*(n[ºo.]\s*)?9\.203|9\.203\/98/i.test(texto)) tipoNorma = 'RICMS'
  else if (/Lei\s*(n[ºo.]\s*)?1\.810|1\.810\/97/i.test(texto)) tipoNorma = 'Lei 1.810/97'
  else if (/Anexo/i.test(texto)) tipoNorma = 'Anexo/Subanexo'
  else if (/Portaria/i.test(texto)) tipoNorma = 'Portaria'
  else if (/Resolu[çc][ãa]o/i.test(texto)) tipoNorma = 'Resolução'

  const palavrasChave = extrairPalavrasChave(trecho)

  return {
    fonte,
    tipo_norma: tipoNorma,
    artigo,
    paragrafo,
    inciso,
    anexo: normalizarRomano(anexo) || anexo,
    subanexo: normalizarRomano(subanexo) || subanexo,
    capitulo,
    secao,
    palavras_chave: palavrasChave,
    tamanho_chars: trecho?.length || 0,
    ...extras
  }
}

function extrairPalavrasChave(texto) {
  const termos = [
    'ICMS', 'documento fiscal', 'inidônea', 'inidoneidade', 'MDF-e', 'NF-e', 'DANFE',
    'substituição tributária', 'benefício fiscal', 'isenção', 'redução de base',
    'alíquota', 'base de cálculo', 'multa', 'penalidade', 'FECOMP', 'PMPF', 'MVA',
    'transportador', 'remetente', 'destinatário', 'apreensão', 'fato gerador',
    'obrigação acessória', 'fiscalização volante', 'mercadoria', 'trânsito'
  ]

  const lower = texto.toLowerCase()
  return termos.filter(t => lower.includes(t.toLowerCase())).slice(0, 12)
}

function montarTrechoComCabecalho(contexto, linhas) {
  const cab = contexto.slice(-3).join(' › ')
  const corpo = linhas.join('\n')
  return cab ? `[${cab}]\n${corpo}` : corpo
}

function salvarChunk(chunks, nomeDoc, contexto, linhasArtigo, numeroArtigo, parte = 1) {
  if (!linhasArtigo.length || !numeroArtigo) return

  const trecho = montarTrechoComCabecalho(contexto, linhasArtigo)
  chunks.push({
    nome_documento: nomeDoc,
    trecho,
    metadata: extrairMetadataBase(nomeDoc, trecho, {
      tipo: 'artigo',
      artigo: numeroArtigo,
      parte,
      secao: contexto.slice(-3).join(' › ') || null
    })
  })
}

function chunkarPorArtigo(texto, nomeDoc) {
  const linhas = limparTexto(texto).split('\n').map(l => l.trim()).filter(Boolean)
  const REGEX_ARTIGO = /^Art\.\s+\d+[\wº°]?(?:-[A-Z])?\b/i
  const REGEX_SECAO = /^(LIVRO|T[ÍI]TULO|CAP[ÍI]TULO|SE[ÇC][ÃA]O|SUBSE[ÇC][ÃA]O|ANEXO|SUBANEXO)\b/i

  const chunks = []
  let artigoAtual = []
  let numeroArtigo = null
  let parteArtigo = 1
  const contexto = []

  function fecharArtigo() {
    salvarChunk(chunks, nomeDoc, contexto, artigoAtual, numeroArtigo, parteArtigo)
    artigoAtual = []
    numeroArtigo = null
    parteArtigo = 1
  }

  for (const linha of linhas) {
    if (REGEX_SECAO.test(linha) && linha.length < 180) {
      contexto.push(linha)
      if (contexto.length > 8) contexto.shift()
      continue
    }

    if (REGEX_ARTIGO.test(linha)) {
      if (artigoAtual.length) fecharArtigo()
      artigoAtual = [linha]
      const m = linha.match(/^Art\.\s+(\d+[\wº°]?(?:-[A-Z])?)/i)
      numeroArtigo = m ? m[1] : linha.slice(0, 20)
      parteArtigo = 1
      continue
    }

    if (artigoAtual.length) {
      artigoAtual.push(linha)

      // Evita chunks grandes demais: mantém o caput como âncora nos subchunks.
      const tamanhoAtual = montarTrechoComCabecalho(contexto, artigoAtual).length
      if (tamanhoAtual > MAX_CHARS_CHUNK_ARTIGO) {
        salvarChunk(chunks, nomeDoc, contexto, artigoAtual, numeroArtigo, parteArtigo)
        parteArtigo += 1
        const caput = artigoAtual[0]
        artigoAtual = [`${caput} (continuação - parte ${parteArtigo})`]
      }
    }
  }

  if (artigoAtual.length) fecharArtigo()
  return chunks
}

function chunkarBloco(texto, nomeDoc) {
  const linhas = limparTexto(texto).split('\n').map(l => l.trim()).filter(Boolean)
  const chunks = []
  const passo = Math.max(1, MAX_LINHAS_BLOCO - OVERLAP_LINHAS_BLOCO)

  for (let i = 0; i < linhas.length; i += passo) {
    const bloco = linhas.slice(i, i + MAX_LINHAS_BLOCO)
    if (!bloco.length) continue

    const trecho = `[${nomeDoc}]\n${bloco.join('\n')}`
    chunks.push({
      nome_documento: nomeDoc,
      trecho,
      metadata: extrairMetadataBase(nomeDoc, trecho, {
        tipo: 'bloco',
        bloco: Math.floor(i / passo) + 1,
        linhas_inicio: i + 1,
        linhas_fim: i + bloco.length
      })
    })
  }

  return chunks
}

function truncar(texto, maxChars = MAX_CHARS_EMBEDDING) {
  if (!texto) return ''
  if (texto.length <= maxChars) return texto

  // Corta preservando final de frase/linha, para não quebrar referência legal no meio.
  const cortado = texto.slice(0, maxChars)
  const ultimoPonto = Math.max(cortado.lastIndexOf('.'), cortado.lastIndexOf('\n'))
  return ultimoPonto > 1200 ? cortado.slice(0, ultimoPonto + 1) : cortado
}

async function gerarEmbeddings(textos) {
  const truncados = textos.map(t => truncar(t))
  const resp = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: truncados })
  })

  const data = await resp.json()
  if (!resp.ok) throw new Error(data.error?.message || 'Erro na API OpenAI')
  return data.data.map(d => d.embedding)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' })

  const form = formidable({ maxFileSize: 50 * 1024 * 1024, keepExtensions: true })
  let fields, files

  try {
    ;[fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, f, fi) => err ? reject(err) : resolve([f, fi]))
    })
  } catch (err) {
    return res.status(400).json({ error: 'Erro ao receber arquivo: ' + err.message })
  }

  const tokenHeader = req.headers.authorization?.replace('Bearer ', '')
  const tokenForm = Array.isArray(fields.token) ? fields.token[0] : fields.token
  const token = tokenHeader || tokenForm

  const isAdmin = await verificarAdmin(token)
  if (!isAdmin) return res.status(403).json({ error: 'Acesso negado' })

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
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY não configurada' })

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
      const { error: deleteError } = await supabaseAdmin
        .from('documentos_legislacao')
        .delete()
        .eq('nome_documento', nomeDoc)

      if (deleteError) throw new Error(`Erro ao limpar documento anterior: ${deleteError.message}`)
    }

    let inseridos = 0
    for (let i = 0; i < chunks.length; i += LOTE_EMBEDDINGS) {
      const lote = chunks.slice(i, i + LOTE_EMBEDDINGS)
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

    return res.status(200).json({
      ok: true,
      tipo,
      chunks: chunks.length,
      inseridos,
      documento: nomeDoc,
      modelo_embedding: EMBEDDING_MODEL,
      max_chars_embedding: MAX_CHARS_EMBEDDING
    })
  } catch (err) {
    console.error('Erro indexação:', err)
    try { if (arquivo?.filepath) fs.unlinkSync(arquivo.filepath) } catch (_) {}
    return res.status(500).json({ error: err.message || 'Erro interno' })
  }
}
