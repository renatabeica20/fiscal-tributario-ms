import { useState, useRef, useEffect } from 'react'
import styles from '../styles/Home.module.css'

function detectarPerguntas(texto) {
  const linhas = texto.split('\n')
  const perguntas = []
  const regex = /^(\d+)\.\s+(.+)/
  for (const linha of linhas) {
    const match = linha.match(regex)
    if (match) {
      perguntas.push({ numero: match[1], texto: match[2].trim(), resposta: '' })
    }
  }
  return perguntas
}

function temPerguntas(texto) {
  return detectarPerguntas(texto).length >= 2
}

function formatarRespostas(perguntas) {
  return perguntas
    .map(p => `${p.numero}. ${p.texto}\nResposta: ${p.resposta}`)
    .join('\n\n')
}

export default function Home() {
  const [mensagens, setMensagens] = useState([])
  const [input, setInput] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [historico, setHistorico] = useState([])
  const [respostasAtivas, setRespostasAtivas] = useState({})
  const chatRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight
    }
  }, [mensagens, carregando])

  const enviar = async (msgCustom) => {
    const msg = msgCustom || input.trim()
    if (!msg || carregando) return

    if (!msgCustom) setInput('')
    setCarregando(true)

    const novaMsgUser = { role: 'user', content: msg }
    setMensagens(prev => [...prev, { tipo: 'user', texto: msg }])
    const novoHistorico = [...historico, novaMsgUser]

    try {
      const resp = await fetch('/api/agente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensagem: msg, historico: historico })
      })

      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Erro desconhecido')

      const novaMsgAgent = { role: 'assistant', content: data.resposta }
      setHistorico([...novoHistorico, novaMsgAgent].slice(-20))

      const novaMsg = {
        tipo: 'agent',
        texto: data.resposta,
        trechos: data.trechosConsultados,
        temFormulario: temPerguntas(data.resposta)
      }

      setMensagens(prev => {
        const novo = [...prev, novaMsg]
        if (novaMsg.temFormulario) {
          const idx = novo.length - 1
          const perguntas = detectarPerguntas(data.resposta)
          setRespostasAtivas(r => ({ ...r, [idx]: perguntas }))
        }
        return novo
      })

    } catch (err) {
      setMensagens(prev => [...prev, {
        tipo: 'agent',
        texto: `Erro: ${err.message}`,
        erro: true
      }])
    }

    setCarregando(false)
    inputRef.current?.focus()
  }

  const enviarRespostas = (msgIdx) => {
    const perguntas = respostasAtivas[msgIdx]
    if (!perguntas) return

    const todasPreenchidas = perguntas.every(p => p.resposta.trim())
    if (!todasPreenchidas) {
      alert('Preencha todas as respostas antes de enviar.')
      return
    }

    const msgFormatada = formatarRespostas(perguntas)

    setRespostasAtivas(r => {
      const novo = { ...r }
      delete novo[msgIdx]
      return novo
    })

    enviar(msgFormatada)
  }

  const atualizarResposta = (msgIdx, perguntaIdx, valor) => {
    setRespostasAtivas(r => {
      const perguntas = [...(r[msgIdx] || [])]
      perguntas[perguntaIdx] = { ...perguntas[perguntaIdx], resposta: valor }
      return { ...r, [msgIdx]: perguntas }
    })
  }

  const tecla = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      enviar()
    }
  }

  const usarSugestao = (texto) => {
    setInput(texto)
    inputRef.current?.focus()
  }

  const copiarTexto
