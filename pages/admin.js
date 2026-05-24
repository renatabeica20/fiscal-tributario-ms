import { useState, useEffect } from 'react'
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
  const [aba, setAba] = useState('fiscais') // fiscais | novo

  useEffect(() => {
    verificarAdmin()
  }, [])

  const verificarAdmin = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: perfil } = await supabase
      .from('perfis')
      .select('cargo')
      .eq('id', user.id)
      .single()

    if (perfil?.cargo !== 'Administrador') {
      router.push('/')
      return
    }

    carregarFiscais()
  }

  const carregarFiscais = async () => {
    setCarregando(true)
    const { data } = await supabase
      .from('perfis')
      .select('*')
      .order('nome')
    setFiscais(data || [])
    setCarregando(false)
  }

  const criarFiscal = async (e) => {
    e.preventDefault()
    setSalvando(true)
    setErro('')
    setSucesso('')

    // Cria usuário via API interna (usa service_role)
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
    await supabase
      .from('perfis')
      .update({ ativo: !fiscal.ativo })
      .eq('id', fiscal.id)
    carregarFiscais()
  }

  const sair = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.logo}>§</div>
          <div>
            <h1 className={styles.titulo}>Administração — Oráculo Fiscal MS</h1>
            <p className={styles.subtitulo}>Gerenciamento de fiscais e acessos</p>
          </div>
          <div className={styles.headerAcoes}>
            <button className={styles.btnVoltar} onClick={() => router.push('/')}>Ir ao agente</button>
            <button className={styles.btnSair} onClick={sair}>Sair</button>
          </div>
        </div>
      </header>

      <div className={styles.conteudo}>
        <div className={styles.abas}>
          <button
            className={`${styles.aba} ${aba === 'fiscais' ? styles.abaAtiva : ''}`}
            onClick={() => setAba('fiscais')}
          >
            Fiscais cadastrados ({fiscais.length})
          </button>
          <button
            className={`${styles.aba} ${aba === 'novo' ? styles.abaAtiva : ''}`}
            onClick={() => { setAba('novo'); setErro(''); setSucesso('') }}
          >
            + Novo fiscal
          </button>
        </div>

        {aba === 'fiscais' && (
          <div className={styles.card}>
            {carregando ? (
              <p className={styles.vazio}>Carregando...</p>
            ) : fiscais.length === 0 ? (
              <p className={styles.vazio}>Nenhum fiscal cadastrado.</p>
            ) : (
              <table className={styles.tabela}>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Matrícula</th>
                    <th>Cargo</th>
                    <th>Status</th>
                    <th>Ação</th>
                  </tr>
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
                        <button
                          className={`${styles.btnAcao} ${f.ativo ? styles.btnDesativar : styles.btnAtivar}`}
                          onClick={() => alternarAtivo(f)}
                        >
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

        {aba === 'novo' && (
          <div className={styles.card}>
            <h2 className={styles.cardTitulo}>Cadastrar novo fiscal</h2>
            <form onSubmit={criarFiscal} className={styles.form}>
              <div className={styles.grid2}>
                <div>
                  <label className={styles.label}>Nome completo *</label>
                  <input
                    className={styles.input}
                    value={form.nome}
                    onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                    placeholder="Nome do fiscal"
                    required
                  />
                </div>
                <div>
                  <label className={styles.label}>Matrícula</label>
                  <input
                    className={styles.input}
                    value={form.matricula}
                    onChange={e => setForm(f => ({ ...f, matricula: e.target.value }))}
                    placeholder="Nº matrícula"
                  />
                </div>
              </div>

              <div className={styles.grid2}>
                <div>
                  <label className={styles.label}>Email institucional *</label>
                  <input
                    type="email"
                    className={styles.input}
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="fiscal@sefaz.ms.gov.br"
                    required
                  />
                </div>
                <div>
                  <label className={styles.label}>Cargo</label>
                  <select
                    className={styles.input}
                    value={form.cargo}
                    onChange={e => setForm(f => ({ ...f, cargo: e.target.value }))}
                  >
                    <option>Fiscal Tributário</option>
                    <option>Auditor Fiscal</option>
                    <option>Administrador</option>
                  </select>
                </div>
              </div>

              <div>
                <label className={styles.label}>Senha inicial *</label>
                <input
                  type="password"
                  className={styles.input}
                  value={form.senha}
                  onChange={e => setForm(f => ({ ...f, senha: e.target.value }))}
                  placeholder="Mínimo 8 caracteres"
                  minLength={8}
                  required
                />
                <p className={styles.dica}>O fiscal poderá alterar a senha após o primeiro acesso.</p>
              </div>

              {erro && <p className={styles.erro}>{erro}</p>}
              {sucesso && <p className={styles.sucesso}>{sucesso}</p>}

              <button type="submit" className={styles.btnSalvar} disabled={salvando}>
                {salvando ? 'Cadastrando...' : 'Cadastrar fiscal'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
