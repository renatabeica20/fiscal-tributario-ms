import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import styles from '../styles/Admin.module.css'

export default function Admin() {
  const router = useRouter()
  const [fiscais, setFiscais] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')
  const [form, setForm] = useState({ nome: '', email: '', matricula: '', cargo: 'Fiscal Tributário', senha: '' })
  const [aba, setAba] = useState('fiscais') // fiscais | novo | legislacao

  // Estado da aba de legislação
  const [arquivos, setArquivos] = useState([])
  const [indexando, setIndexando] = useState(false)
  const [progresso, setProgresso] = useState([])
  const [limparAntes, setLimparAntes] = useState(false)
  const [pendentes, setPendentes] = useState([])
  const [logs, setLogs] = useState([])
  const [periodoLogs, setPeriodoLogs] = useState('7')
  const inputRef = useRef(null)

  useEffect(() => { verificarAdmin() }, [])

  const verificarAdmin = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: perfil } = await supabase.from('perfis').select('cargo').eq('id', user.id).single()
    if (perfil?.cargo !== 'Administrador') { router.push('/'); return }
    carregarFiscais()
  }

  const carregarFiscais = async () => {
    setCarregando(true)
    const { data } = await supabase.from('perfis').select('*').order('nome')
    setFiscais(data || [])
    setCarregando(false)
  }

  const carregarLogs = async (dias) => {
    setPeriodoLogs(dias)
    const desde = new Date()
    desde.setDate(desde.getDate() - parseInt(dias))
    const { data } = await supabase
      .from('logs_uso')
      .select('*')
      .gte('criado_em', desde.toISOString())
      .order('criado_em', { ascending: false })
    setLogs(data || [])
  }

  const carregarPendentes = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const resp = await fetch('/api/pendentes', {
      headers: { Authorization: `Bearer ${session?.access_token}` }
    })
    const data = await resp.json()
    setPendentes(data.pendentes || [])
  }

  const aprovar = async (fiscal) => {
    const { data: { session } } = await supabase.auth.getSession()
    await fetch('/api/pendentes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ id: fiscal.id, acao: 'aprovar' })
    })
    setSucesso(`${fiscal.nome} aprovado com sucesso.`)
    carregarPendentes()
    carregarFiscais()
  }

  const rejeitar = async (fiscal) => {
    const { data: { session } } = await supabase.auth.getSession()
    await fetch('/api/pendentes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ id: fiscal.id, acao: 'rejeitar' })
    })
    setSucesso(`Solicitação de ${fiscal.nome} rejeitada.`)
    carregarPendentes()
  }

  const criarFiscal = async (e) => {
    e.preventDefault()
    setSalvando(true)
    setErro('')
    setSucesso('')
    const resp = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    })
    const data = await resp.json()
    if (!resp.ok) {
      setErro(data.error || 'Erro ao criar fiscal.')
    } else {
      setSucesso(`Fiscal ${form.nome} criado com sucesso.`)
      setForm({ nome: '', email: '', matricula: '', cargo: 'Fiscal Tributário', senha: '' })
      carregarFiscais()
      setAba('fiscais')
    }
    setSalvando(false)
  }

  const alternarAtivo = async (fiscal) => {
    await supabase.from('perfis').update({ ativo: !fiscal.ativo }).eq('id', fiscal.id)
    carregarFiscais()
  }

  const sair = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // ── Legislação ──────────────────────────────────────────────────────────────
  const selecionarArquivos = (e) => {
    const lista = Array.from(e.target.files || [])
    setArquivos(lista)
    setProgresso([])
    setErro('')
    setSucesso('')
  }

  const indexarArquivos = async () => {
    if (!arquivos.length) return
    setIndexando(true)
    setErro('')
    setSucesso('')

    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token

    const resultados = []
    for (let i = 0; i < arquivos.length; i++) {
      const arq = arquivos[i]
      const nomeBase = arq.name.replace(/\.(docx?|DOC)$/i, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim()

      setProgresso(prev => [...prev, { nome: arq.name, status: 'indexando' }])

      const formData = new FormData()
      formData.append('arquivo', arq)
      formData.append('nome', nomeBase)
      formData.append('token', token)
      formData.append('limpar', limparAntes ? 'true' : 'false')

      try {
        const resp = await fetch('/api/indexar', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData
        })
        const data = await resp.json()

        if (!resp.ok) throw new Error(data.error || 'Erro desconhecido')

        resultados.push({ nome: arq.name, ok: true, chunks: data.chunks })
        setProgresso(prev => prev.map(p =>
          p.nome === arq.name ? { ...p, status: 'ok', chunks: data.chunks } : p
        ))
      } catch (err) {
        resultados.push({ nome: arq.name, ok: false, erro: err.message })
        setProgresso(prev => prev.map(p =>
          p.nome === arq.name ? { ...p, status: 'erro', erro: err.message } : p
        ))
      }
    }

    const ok = resultados.filter(r => r.ok).length
    const total = resultados.length
    setSucesso(`${ok} de ${total} arquivo(s) indexado(s) com sucesso.`)
    setIndexando(false)
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.logo} style={{ background: 'transparent', boxShadow: 'none', width: 'auto', height: 'auto', padding: 0 }}>
            <img src="/logo.png" alt="Oráculo Fiscal MS" style={{ width: '48px', height: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.3))' }} />
          </div>
          <div>
            <h1 className={styles.titulo}>Administração — Oráculo Fiscal MS</h1>
            <p className={styles.subtitulo}>Ferramenta de apoio operacional</p>
          </div>
          <div className={styles.headerAcoes}>
            <button className={styles.btnVoltar} onClick={() => router.push('/')}>Ir ao agente</button>
            <button className={styles.btnSair} onClick={sair}>Sair</button>
          </div>
        </div>
      </header>

      <div className={styles.conteudo}>
        <div className={styles.abas}>
          <button className={`${styles.aba} ${aba === 'fiscais' ? styles.abaAtiva : ''}`} onClick={() => setAba('fiscais')}>
            Fiscais cadastrados ({fiscais.length})
          </button>
          <button className={`${styles.aba} ${aba === 'novo' ? styles.abaAtiva : ''}`} onClick={() => { setAba('novo'); setErro(''); setSucesso('') }}>
            + Novo fiscal
          </button>
          <button className={`${styles.aba} ${aba === 'legislacao' ? styles.abaAtiva : ''}`} onClick={() => { setAba('legislacao'); setErro(''); setSucesso('') }}>
            📄 Indexar legislação
          </button>
          <button className={`${styles.aba} ${aba === 'pendentes' ? styles.abaAtiva : ''}`} onClick={() => { setAba('pendentes'); carregarPendentes(); setErro(''); setSucesso('') }}>
            ⏳ Solicitações {pendentes.length > 0 ? `(${pendentes.length})` : ''}
          </button>
          <button className={`${styles.aba} ${aba === 'uso' ? styles.abaAtiva : ''}`} onClick={() => { setAba('uso'); carregarLogs('7'); setErro(''); setSucesso('') }}>
            📊 Uso
          </button>
        </div>

        {/* ── Fiscais cadastrados ── */}
        {aba === 'fiscais' && (
          <div className={styles.card}>
            {carregando ? (
              <p className={styles.vazio}>Carregando...</p>
            ) : fiscais.length === 0 ? (
              <p className={styles.vazio}>Nenhum fiscal cadastrado.</p>
            ) : (
              <table className={styles.tabela}>
                <thead>
                  <tr><th>Nome</th><th>Matrícula</th><th>Cargo</th><th>Status</th><th>Ação</th></tr>
                </thead>
                <tbody>
                  {fiscais.map(f => (
                    <tr key={f.id} className={!f.ativo ? styles.inativo : ''}>
                      <td>{f.nome}</td>
                      <td>{f.matricula || '—'}</td>
                      <td>{f.cargo}</td>
                      <td>
                        <span className={`${styles.badge} ${f.ativo ? styles.badgeAtivo : styles.badgeInativo}`}>
                          {f.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td>
                        <button className={`${styles.btnAcao} ${f.ativo ? styles.btnDesativar : styles.btnAtivar}`} onClick={() => alternarAtivo(f)}>
                          {f.ativo ? 'Desativar' : 'Ativar'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Novo fiscal ── */}
        {aba === 'novo' && (
          <div className={styles.card}>
            <h2 className={styles.cardTitulo}>Cadastrar novo fiscal</h2>
            <form onSubmit={criarFiscal} className={styles.form}>
              <div className={styles.grid2}>
                <div>
                  <label className={styles.label}>Nome completo *</label>
                  <input className={styles.input} value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Nome do fiscal" required />
                </div>
                <div>
                  <label className={styles.label}>Matrícula</label>
                  <input className={styles.input} value={form.matricula} onChange={e => setForm(f => ({ ...f, matricula: e.target.value }))} placeholder="Nº matrícula" />
                </div>
              </div>
              <div className={styles.grid2}>
                <div>
                  <label className={styles.label}>Email institucional *</label>
                  <input type="email" className={styles.input} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="fiscal@sefaz.ms.gov.br" required />
                </div>
                <div>
                  <label className={styles.label}>Cargo</label>
                  <select className={styles.input} value={form.cargo} onChange={e => setForm(f => ({ ...f, cargo: e.target.value }))}>
                    <option>Fiscal Tributário</option>
                    <option>Auditor Fiscal</option>
                    <option>Administrador</option>
                  </select>
                </div>
              </div>
              <div>
                <label className={styles.label}>Senha inicial *</label>
                <input type="password" className={styles.input} value={form.senha} onChange={e => setForm(f => ({ ...f, senha: e.target.value }))} placeholder="Mínimo 8 caracteres" minLength={8} required />
                <p className={styles.dica}>O fiscal poderá alterar a senha após o primeiro acesso.</p>
              </div>
              {erro && <p className={styles.erro}>{erro}</p>}
              {sucesso && <p className={styles.sucesso}>{sucesso}</p>}
              <button type="submit" className={styles.btnSalvar} disabled={salvando}>{salvando ? 'Cadastrando...' : 'Cadastrar fiscal'}</button>
            </form>
          </div>
        )}

        {/* ── Monitoramento de uso ── */}
        {aba === 'uso' && (() => {
          const porFiscal = {}
          for (const log of logs) {
            const nome = log.fiscal_nome || 'Desconhecido'
            if (!porFiscal[nome]) porFiscal[nome] = { consultas: 0, tokens: 0, custo: 0 }
            porFiscal[nome].consultas++
            porFiscal[nome].tokens += (log.tokens_entrada || 0) + (log.tokens_saida || 0)
            porFiscal[nome].custo += parseFloat(log.custo_estimado || 0)
          }
          const totalConsultas = logs.length
          const totalCusto = logs.reduce((s, l) => s + parseFloat(l.custo_estimado || 0), 0)
          const totalTokens = logs.reduce((s, l) => s + (l.tokens_entrada || 0) + (l.tokens_saida || 0), 0)

          return (
            <div className={styles.card}>
              <h2 className={styles.cardTitulo}>Monitoramento de uso</h2>

              {/* Filtro período */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
                {['7', '30', '90'].map(d => (
                  <button key={d}
                    onClick={() => carregarLogs(d)}
                    style={{
                      padding: '6px 16px', borderRadius: '6px', cursor: 'pointer',
                      fontFamily: "'DM Sans', sans-serif", fontSize: '0.78rem',
                      background: periodoLogs === d ? 'rgba(201,168,76,0.2)' : 'rgba(255,255,255,0.04)',
                      border: periodoLogs === d ? '1px solid rgba(201,168,76,0.4)' : '1px solid rgba(255,255,255,0.08)',
                      color: periodoLogs === d ? '#c9a84c' : '#5a6a7a'
                    }}
                  >
                    {d === '7' ? 'Últimos 7 dias' : d === '30' ? 'Últimos 30 dias' : 'Últimos 90 dias'}
                  </button>
                ))}
              </div>

              {/* Totais */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '28px' }}>
                {[
                  { label: 'Total de consultas', valor: totalConsultas, icone: '💬' },
                  { label: 'Total de tokens', valor: totalTokens.toLocaleString('pt-BR'), icone: '⚡' },
                  { label: 'Custo estimado (USD)', valor: `$ ${totalCusto.toFixed(4)}`, icone: '💰' }
                ].map((item, i) => (
                  <div key={i} style={{
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(201,168,76,0.12)',
                    borderRadius: '10px', padding: '18px', textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>{item.icone}</div>
                    <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '1.4rem', color: '#c9a84c', fontWeight: 700 }}>{item.valor}</div>
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.68rem', color: '#3a4a5a', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '4px' }}>{item.label}</div>
                  </div>
                ))}
              </div>

              {/* Por fiscal */}
              {Object.keys(porFiscal).length === 0 ? (
                <p className={styles.vazio}>Nenhuma consulta no período.</p>
              ) : (
                <table className={styles.tabela}>
                  <thead>
                    <tr><th>Fiscal</th><th>Consultas</th><th>Tokens</th><th>Custo (USD)</th></tr>
                  </thead>
                  <tbody>
                    {Object.entries(porFiscal)
                      .sort((a, b) => b[1].consultas - a[1].consultas)
                      .map(([nome, dados]) => (
                        <tr key={nome}>
                          <td>{nome}</td>
                          <td>{dados.consultas}</td>
                          <td>{dados.tokens.toLocaleString('pt-BR')}</td>
                          <td>$ {dados.custo.toFixed(4)}</td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              )}
            </div>
          )
        })()}

        {/* ── Solicitações pendentes ── */}
        {aba === 'pendentes' && (
          <div className={styles.card}>
            <h2 className={styles.cardTitulo}>Solicitações de acesso pendentes</h2>
            {pendentes.length === 0 ? (
              <p className={styles.vazio}>Nenhuma solicitação pendente.</p>
            ) : (
              <table className={styles.tabela}>
                <thead>
                  <tr><th>Nome</th><th>Matrícula</th><th>Cargo</th><th>Solicitado em</th><th>Ações</th></tr>
                </thead>
                <tbody>
                  {pendentes.map(f => (
                    <tr key={f.id}>
                      <td>{f.nome}</td>
                      <td>{f.matricula || '—'}</td>
                      <td>{f.cargo}</td>
                      <td>{new Date(f.criado_em).toLocaleDateString('pt-BR')}</td>
                      <td style={{ display: 'flex', gap: '8px' }}>
                        <button className={`${styles.btnAcao} ${styles.btnAtivar}`} onClick={() => aprovar(f)}>✓ Aprovar</button>
                        <button className={`${styles.btnAcao} ${styles.btnDesativar}`} onClick={() => rejeitar(f)}>✗ Rejeitar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {sucesso && <p className={styles.sucesso}>{sucesso}</p>}
          </div>
        )}

        {/* ── Indexar legislação ── */}
        {aba === 'legislacao' && (
          <div className={styles.card}>
            <h2 className={styles.cardTitulo}>Indexar documentos de legislação</h2>
            <p className={styles.dica}>
              Selecione um ou mais arquivos Word (.docx) para indexar na base vetorial. O sistema detecta automaticamente o tipo de documento (articulado, tabela ou lista) e chunkiza de forma adequada.
            </p>

            {/* Upload */}
            <div style={{ marginTop: '1.5rem' }}>
              <input
                ref={inputRef}
                type="file"
                accept=".docx,.doc"
                multiple
                onChange={selecionarArquivos}
                style={{ display: 'none' }}
              />
              <button
                className={styles.btnSalvar}
                onClick={() => inputRef.current?.click()}
                disabled={indexando}
                style={{ marginBottom: '1rem' }}
              >
                Selecionar arquivos (.docx)
              </button>

              {arquivos.length > 0 && (
                <p className={styles.dica}>{arquivos.length} arquivo(s) selecionado(s)</p>
              )}
            </div>

            {/* Lista de arquivos selecionados */}
            {arquivos.length > 0 && (
              <div style={{ margin: '1rem 0', maxHeight: '200px', overflowY: 'auto' }}>
                {arquivos.map((arq, i) => {
                  const prog = progresso.find(p => p.nome === arq.name)
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.4rem 0', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                      <span style={{ fontSize: '0.85rem', color: '#a8c8e8', flex: 1 }}>{arq.name}</span>
                      {prog && (
                        <span style={{
                          fontSize: '0.75rem', fontWeight: 700,
                          color: prog.status === 'ok' ? '#4ade80' : prog.status === 'erro' ? '#f87171' : '#e8a000'
                        }}>
                          {prog.status === 'indexando' && '⏳ indexando...'}
                          {prog.status === 'ok' && `✓ ${prog.chunks} chunks`}
                          {prog.status === 'erro' && `✗ ${prog.erro}`}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Opção limpar */}
            {arquivos.length > 0 && (
              <div
                onClick={() => setLimparAntes(v => !v)}
                style={{
                  margin: '1rem 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.75rem 1rem',
                  background: limparAntes ? 'rgba(232,160,0,0.12)' : 'rgba(255,255,255,0.04)',
                  border: limparAntes ? '1px solid rgba(232,160,0,0.4)' : '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  userSelect: 'none',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{
                  width: '20px', height: '20px', flexShrink: 0,
                  borderRadius: '4px',
                  border: limparAntes ? '2px solid #e8a000' : '2px solid rgba(255,255,255,0.3)',
                  background: limparAntes ? '#e8a000' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.2s'
                }}>
                  {limparAntes && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="#0d2f5e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: limparAntes ? '#e8a000' : '#ffffff' }}>
                    Apagar indexação anterior antes de reinserir
                  </p>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#a8c8e8', marginTop: '2px' }}>
                    Recomendado ao atualizar documentos já indexados
                  </p>
                </div>
              </div>
            )}

            {/* Botão indexar */}
            {arquivos.length > 0 && !indexando && (
              <button className={styles.btnSalvar} onClick={indexarArquivos}>
                Indexar {arquivos.length} arquivo(s)
              </button>
            )}

            {indexando && (
              <p style={{ color: '#e8a000', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                ⏳ Indexando... não feche esta página.
              </p>
            )}

            {sucesso && !indexando && <p className={styles.sucesso}>{sucesso}</p>}
            {erro && <p className={styles.erro}>{erro}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
