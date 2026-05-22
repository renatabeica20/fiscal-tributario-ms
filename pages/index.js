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

  const copiarTexto = (texto) => {
    navigator.clipboard.writeText(texto)
      .then(() => alert('Texto copiado!'))
      .catch(() => {
        const el = document.createElement('textarea')
        el.value = texto
        document.body.appendChild(el)
        el.select()
        document.execCommand('copy')
        document.body.removeChild(el)
        alert('Texto copiado!')
      })
  }

  const sugestoes = [
    'Mercadoria sem nota fiscal — como enquadrar?',
    'Nota fiscal com destinatário diverso do local de entrega',
    'Qual a alíquota interna de bebidas no MS?',
    'Quando lavrar TA em vez de TVF?',
    'Responsabilidade solidária do transportador'
  ]

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.logo}>§</div>
          <div>
            <h1 className={styles.titulo}>Fiscal Tributário Estadual - MS</h1>
            <p className={styles.subtitulo}>SEFAZ-MS · Lei 1.810/97 · RICMS/MS · Decreto 9.203/98</p>
          </div>
        </div>
      </header>

      <div className={styles.chat} ref={chatRef}>
        {mensagens.length === 0 && (
          <div className={styles.welcome}>
            <h2>Fiscal Tributário Estadual — MS</h2>
            <p>Especialista em legislação tributária estadual do MS.<br />
            Analisa casos de fiscalização volante, enquadra infrações e redige documentos fiscais.</p>
            <div className={styles.caps}>
              {[
                { icon: '⚖️', titulo: 'Enquadramento jurídico', desc: 'Lei 1.810/97 + RICMS/MS' },
                { icon: '📄', titulo: 'Redação de documentos', desc: 'TVF, TA e ALIM' },
                { icon: '🔢', titulo: 'Cálculo do crédito', desc: 'ICMS + multas' },
                { icon: '💬', titulo: 'Consultas livres', desc: 'Tire dúvidas sobre a legislação' },
              ].map((c, i) => (
                <div key={i} className={styles.cap}>
                  <div className={styles.capIcon}>{c.icon}</div>
                  <div className={styles.capTitulo}>{c.titulo}</div>
                  <div className={styles.capDesc}>{c.desc}</div>
                </div>
              ))}
            </div>
            <div className={styles.sugestoes}>
              {sugestoes.map((s, i) => (
                <button key={i} className={styles.sugestao} onClick={() => usarSugestao(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {mensagens.map((msg, msgIdx) => (
          <div key={msgIdx} className={`${styles.msg} ${msg.tipo === 'user' ? styles.msgUser : styles.msgAgent}`}>
            {msg.tipo === 'agent' && <div className={styles.avatar}>§</div>}
            <div className={`${styles.bubble} ${msg.erro ? styles.bubbleErro : ''}`}>
              {msg.tipo === 'agent' && msg.trechos > 0 && (
                <div className={styles.contextoBar}>📚 {msg.trechos} trechos da legislação consultados</div>
              )}
              {msg.tipo === 'agent' ? (
                <>
                  {respostasAtivas[msgIdx] ? (
                    <div className={styles.formulario}>
                      <p className={styles.formularioIntro}>
                        {msg.texto.split('\n')[0]}
                      </p>
                      {respostasAtivas[msgIdx].map((perg, pi) => (
                        <div key={pi} className={styles.campo}>
                          <label className={styles.campoLabel}>
                            {perg.numero}. {perg.texto}
                          </label>
                          <textarea
                            className={styles.campoInput}
                            value={perg.resposta}
                            onChange={e => atualizarResposta(msgIdx, pi, e.target.value)}
                            placeholder="Digite sua resposta..."
                            rows={2}
                          />
                        </div>
                      ))}
                      <button
                        className={styles.btnEnviarRespostas}
                        onClick={() => enviarRespostas(msgIdx)}
                        disabled={carregando}
                      >
                        ✓ Enviar respostas e gerar documento
                      </button>
                    </div>
                  ) : (
                    <>
                      <div dangerouslySetInnerHTML={{ __html: formatarTexto(msg.texto) }} />
                      <button onClick={() => copiarTexto(msg.texto)} className={styles.btnCopiar}>
                        📋 Copiar texto
                      </button>
                    </>
                  )}
                </>
              ) : (
                <span style={{ whiteSpace: 'pre-wrap' }}>{msg.texto}</span>
              )}
            </div>
          </div>
        ))}

        {carregando && (
          <div className={`${styles.msg} ${styles.msgAgent}`}>
            <div className={styles.avatar}>§</div>
            <div className={styles.bubble}>
              <div className={styles.typing}><span></span><span></span><span></span></div>
            </div>
          </div>
        )}
      </div>

      <div className={styles.inputArea}>
        <div className={styles.inputWrapper}>
          <textarea
            ref={inputRef}
            className={styles.textarea}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={tecla}
            placeholder="Descreva o caso ou faça uma pergunta sobre a legislação tributária do MS..."
            rows={1}
          />
          <button className={styles.btnEnviar} onClick={() => enviar()} disabled={carregando || !input.trim()}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
        <p className={styles.hint}>Enter para enviar · Shift+Enter para nova linha</p>
      </div>
    </div>
  )
}

function formatarTexto(txt) {
  let html = txt
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/## (.+)/g, '<h3 style="color:#d4a843;font-size:0.82rem;text-transform:uppercase;letter-spacing:0.08em;margin:16px 0 6px;font-family:monospace">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#d4a843">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')

  const paragrafos = html.split('\n\n')
  html = paragrafos.map(p => {
    if (p.startsWith('<h3') || p.trim() === '') return p
    return '<p style="margin-bottom:8px">' + p.replace(/\n/g, '<br>') + '</p>'
  }).join('\n')

  return html
}
