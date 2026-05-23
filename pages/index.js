import { useState, useRef, useEffect } from 'react'
import styles from '../styles/Home.module.css'

// Detecta tipo de campo pela pergunta
function detectarTipoCampo(texto) {
  const t = texto.toLowerCase()
  if (t.includes('nome') || t.includes('razão social') || t.includes('razao social')) return 'texto'
  if ((t === 'data da abordagem' || t === 'data da fiscalização' || 
       t === 'data' || t === 'quando ocorreu') ) return 'date'
  if (t.includes('data') && t.length < 35 && !t.includes(' e ') && 
      !t.includes('hora') && !t.includes('número') && !t.includes('nota')) return 'date'
  if (t.includes('cpf') && !t.includes('nome') && !t.includes('condutor') && !t.includes('motorista')) return 'cpf'
  if (t.includes('cnpj') && !t.includes(' e ') && !t.includes('inscrição') && !t.includes('ie') &&
      !t.includes('razão') && !t.includes('razao') && !t.includes('empresa') && 
      !t.includes('transportadora') && !t.includes('destinatária') && 
      !t.includes('destinatario') && !t.includes('remetente') && !t.includes('endereço')) return 'cnpj'
  if ((t.includes('inscrição estadual') || t.includes('ie/')) && !t.includes(' e ') && !t.includes('cnpj')) return 'ie'
  if (t.includes('valor') || t.includes('r$') || t.includes('preço') || t.includes('base de cálculo')) return 'valor'
  if (t.includes('placa')) return 'placa'
  if (t.includes('cep')) return 'cep'
  if (t.includes('telefone') || t.includes('fone')) return 'telefone'
  return 'texto'
}

// Máscaras
function aplicarMascara(valor, tipo) {
  const n = valor.replace(/\D/g, '')
  switch (tipo) {
    case 'cpf':
      return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4').substring(0, 14)
    case 'cnpj':
      return n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5').substring(0, 18)
    case 'ie':
      return n.substring(0, 12).replace(/(\d{2})(\d{3})(\d{3})(\d{1,})/, '$1.$2.$3-$4')
    case 'placa':
      const p = valor.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 7)
      if (/^[A-Z]{3}\d[A-Z]\d{2}$/.test(p)) return p.substring(0,3) + p.substring(3)
      return p.replace(/([A-Z]{3})(\d+)/, '$1-$2')
    case 'cep':
      return n.replace(/(\d{5})(\d{3})/, '$1-$2').substring(0, 9)
    case 'telefone':
      return n.length <= 10
        ? n.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3').substring(0, 14)
        : n.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3').substring(0, 15)
    case 'valor':
      const num = parseFloat(n) / 100
      return isNaN(num) ? '' : num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    default:
      return valor
  }
}

function detectarPerguntas(texto) {
  const linhas = texto.split('\n')
  const perguntas = []
  const regex = /^(\d+)\.\s+\*{0,2}(.+?)\*{0,2}$/

  for (const linha of linhas) {
    const match = linha.trim().match(regex)
    if (match) {
      const textoPergunta = match[2].trim()
      perguntas.push({
        numero: match[1],
        texto: textoPergunta,
        resposta: '',
        tipo: detectarTipoCampo(textoPergunta)
      })
    }
  }
  return perguntas
}

function temPerguntas(texto) {
  const gatilhos = [
    'DADOS NECESSÁRIOS PARA O DOCUMENTO:',
    'DADOS NECESSÁRIOS:',
    'PRECISO DOS SEGUINTES DADOS:',
  ]
  const temGatilho = gatilhos.some(g => texto.toUpperCase().includes(g))
  if (!temGatilho) return false
  return detectarPerguntas(texto).length >= 1
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
  const [fontSize, setFontSize] = useState(14)
  const chatRef = useRef(null)
  const inputRef = useRef(null)

  const FONT_MIN = 11
  const FONT_MAX = 20

  useEffect(() => {
    if (!chatRef.current) return

    // Quando o agente terminar de responder, rola até o INÍCIO da resposta
    if (!carregando && mensagens.length > 0) {
      const ultima = mensagens[mensagens.length - 1]
      if (ultima.tipo === 'agent') {
        setTimeout(() => {
          const msgs = chatRef.current.querySelectorAll('[data-tipo="agent"]')
          if (msgs.length > 0) {
            const ultimaMsg = msgs[msgs.length - 1]
            // offsetTop é relativo ao chatRef (position: relative implícito por overflow)
            const offset = ultimaMsg.offsetTop - 16
            chatRef.current.scrollTo({ top: offset, behavior: 'smooth' })
          }
        }, 120)
        return
      }
    }

    // Durante carregamento ou após mensagem do usuário, scroll para o fim
    chatRef.current.scrollTop = chatRef.current.scrollHeight
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

    const msgFormatada = formatarRespostas(perguntas)

    setRespostasAtivas(r => {
      const novo = { ...r }
      delete novo[msgIdx]
      return novo
    })

    enviar(msgFormatada)
  }

  const atualizarResposta = (msgIdx, perguntaIdx, valor, tipo) => {
    const valorFormatado = aplicarMascara(valor, tipo)
    setRespostasAtivas(r => {
      const perguntas = [...(r[msgIdx] || [])]
      perguntas[perguntaIdx] = { ...perguntas[perguntaIdx], resposta: valorFormatado }
      return { ...r, [msgIdx]: perguntas }
    })
  }

  const tecla = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      enviar()
    }
  }

  const copiarTexto = (texto, btnEl) => {
    let textoCopiar = texto
    const inicio = texto.indexOf('===MATERIA_INICIO===')
    const fim = texto.indexOf('===MATERIA_FIM===')
    if (inicio !== -1 && fim !== -1) {
      textoCopiar = texto.substring(inicio + 20, fim).trim()
    }

    const feedback = (btn) => {
      if (btn) {
        const original = btn.textContent
        btn.textContent = '✓ Copiado!'
        btn.style.borderColor = '#3fb950'
        btn.style.color = '#3fb950'
        setTimeout(() => {
          btn.textContent = original
          btn.style.borderColor = ''
          btn.style.color = ''
        }, 2000)
      }
    }

    navigator.clipboard.writeText(textoCopiar)
      .then(() => feedback(btnEl))
      .catch(() => {
        const el = document.createElement('textarea')
        el.value = textoCopiar
        document.body.appendChild(el)
        el.select()
        document.execCommand('copy')
        document.body.removeChild(el)
        feedback(btnEl)
      })
  }

  const renderCampo = (perg, msgIdx, pi) => {
    const valor = perg.resposta || ''

    if (perg.tipo === 'date') {
      return (
        <input
          type="date"
          className={styles.campoInput}
          value={valor}
          onChange={e => atualizarResposta(msgIdx, pi, e.target.value, 'date')}
        />
      )
    }

    if (['cpf', 'cnpj', 'ie', 'placa', 'cep', 'telefone', 'valor'].includes(perg.tipo)) {
      return (
        <input
          type="text"
          className={styles.campoInput}
          value={valor}
          onChange={e => atualizarResposta(msgIdx, pi, e.target.value, perg.tipo)}
          placeholder={
            perg.tipo === 'cpf' ? '000.000.000-00' :
            perg.tipo === 'cnpj' ? '00.000.000/0000-00' :
            perg.tipo === 'ie' ? '00.000.000-0' :
            perg.tipo === 'placa' ? 'ABC-1234' :
            perg.tipo === 'cep' ? '00000-000' :
            perg.tipo === 'telefone' ? '(67) 99999-9999' :
            perg.tipo === 'valor' ? 'R$ 0,00' : ''
          }
          inputMode={perg.tipo === 'valor' ? 'numeric' : 'text'}
        />
      )
    }

    return (
      <textarea
        className={styles.campoInput}
        value={valor}
        onChange={e => {
          atualizarResposta(msgIdx, pi, e.target.value, 'texto')
          e.target.style.height = 'auto'
          e.target.style.height = e.target.scrollHeight + 'px'
        }}
        placeholder="Digite sua resposta..."
        rows={2}
        style={{ overflow: 'hidden', resize: 'none' }}
      />
    )
  }

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.logo}>§</div>
          <div className={styles.headerTexto}>
            <h1 className={styles.titulo}>Oráculo Fiscal MS</h1>
            <p className={styles.subtitulo}>Consultoria Jurídico-Tributária e Apoio à Fiscalização Volante — SEFAZ-MS</p>
          </div>
          <div className={styles.headerBadge}>Lei 1.810/97 · RICMS/MS</div>
          {/* Controles de tamanho de fonte */}
          <div className={styles.fontControls}>
            <button
              className={styles.btnFont}
              onClick={() => setFontSize(f => Math.max(FONT_MIN, f - 1))}
              disabled={fontSize <= FONT_MIN}
              title="Diminuir letra"
            >A−</button>
            <span className={styles.fontLabel}>{fontSize}px</span>
            <button
              className={styles.btnFont}
              onClick={() => setFontSize(f => Math.min(FONT_MAX, f + 1))}
              disabled={fontSize >= FONT_MAX}
              title="Aumentar letra"
            >A+</button>
          </div>
        </div>
      </header>

      <div className={styles.chat} ref={chatRef}>
        {mensagens.length === 0 && (
          <div className={styles.welcome}>
            <h2>Oráculo Fiscal MS</h2>
            <p>Consultoria jurídico-tributária especializada em legislação do MS.<br />
            Análise de casos, enquadramento legal e elaboração de documentos fiscais.</p>
          </div>
        )}

        {mensagens.map((msg, msgIdx) => (
          <div key={msgIdx} data-tipo={msg.tipo} className={`${styles.msg} ${msg.tipo === 'user' ? styles.msgUser : styles.msgAgent}`}>

            {msg.tipo === 'user' ? (
              <div>
                <div className={styles.msgUserLabel}>👮 Fiscal</div>
                <div className={styles.bubble}>
                  <span style={{ whiteSpace: 'pre-wrap', fontSize: `${fontSize}px` }}>{msg.texto}</span>
                </div>
              </div>
            ) : (
              <>
                <div className={styles.avatar}>§</div>
                <div className={styles.msgAgentInner}>
                  <div className={styles.msgAgentLabel}>⚖ Oráculo Fiscal MS</div>
                  <div className={`${styles.bubble} ${msg.erro ? styles.bubbleErro : ''}`} style={{ fontSize: `${fontSize}px` }}>
                    {msg.trechos > 0 && (
                      <div className={styles.contextoBar}>📚 {msg.trechos} trechos da legislação consultados</div>
                    )}
                    {respostasAtivas[msgIdx] ? (
                      <div className={styles.formulario}>
                        <p className={styles.formularioIntro}>
                          {msg.texto.split('\n')[0].replace(/[#*]/g, '').trim()}
                        </p>
                        {respostasAtivas[msgIdx].map((perg, pi) => (
                          <div key={pi} className={styles.campo}>
                            <label className={styles.campoLabel}>
                              {perg.numero}. {perg.texto}
                            </label>
                            {renderCampo(perg, msgIdx, pi)}
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
                        <button onClick={(e) => copiarTexto(msg.texto, e.currentTarget)} className={styles.btnCopiar}>
                          📋 Copiar matéria
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </>
            )}
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
            onChange={e => {
              setInput(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = e.target.scrollHeight + 'px'
            }}
            onKeyDown={tecla}
            placeholder="Descreva o caso ou faça uma pergunta sobre a legislação tributária do MS..."
            rows={1}
            spellCheck={true}
            lang="pt-BR"
            autoCorrect="on"
            autoCapitalize="sentences"
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
  // 1. Escapar HTML primeiro (texto puro)
  let html = txt
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // 2. Substituir marcadores da matéria tributária
  html = html
    .replace(/===MATERIA_INICIO===/g, '<div style="border-left:3px solid #1a4a8a;padding:12px 16px;margin:10px 0;background:#f0f4f8;border-radius:0 6px 6px 0">')
    .replace(/===MATERIA_FIM===/g, '</div>')

  // 3. Markdown
  html = html
    .replace(/^## (.+)$/gm, '<h3 style="color:#1a4a8a;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.08em;margin:16px 0 6px;font-family:monospace;font-weight:700">$1</h3>')
    .replace(/^# (.+)$/gm, '<h3 style="color:#1a4a8a;font-size:0.92rem;margin:16px 0 8px;font-weight:700">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#1a4a8a">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')

  // 4. Parágrafos
  const paragrafos = html.split('\n\n')
  html = paragrafos.map(p => {
    if (p.startsWith('<h3') || p.startsWith('<div') || p.trim() === '') return p
    return '<p style="margin-bottom:8px">' + p.replace(/\n/g, '<br>') + '</p>'
  }).join('\n')

  return html
}
