// pages/cadastro.js
import { useState } from 'react'
import { useRouter } from 'next/router'
import styles from '../styles/Login.module.css'

export default function Cadastro() {
  const router = useRouter()
  const [form, setForm] = useState({ nome: '', email: '', matricula: '', cargo: 'Fiscal Tributário', senha: '', confirmar: '' })
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [concluido, setConcluido] = useState(false)

  const set = (campo) => (e) => setForm(f => ({ ...f, [campo]: e.target.value }))

  const enviar = async (e) => {
    e.preventDefault()
    setErro('')

    if (form.senha !== form.confirmar) {
      setErro('As senhas não coincidem.')
      return
    }
    if (form.senha.length < 8) {
      setErro('A senha deve ter pelo menos 8 caracteres.')
      return
    }

    setEnviando(true)
    const resp = await fetch('/api/cadastrar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    })
    const data = await resp.json()

    if (!resp.ok) {
      setErro(data.error || 'Erro ao enviar solicitação.')
      setEnviando(false)
      return
    }

    setConcluido(true)
    setEnviando(false)
  }

  if (concluido) {
    return (
      <div className={styles.page}>
        <div className={styles.orb1} />
        <div className={styles.orb2} />
        <div className={styles.container} style={{ textAlign: 'center' }}>
          <div className={styles.logoWrap}>
            <img src="/logo.png" alt="Oráculo Fiscal MS" className={styles.logoImg} />
          </div>
          <div style={{ marginBottom: '32px' }}>
            <div style={{ fontSize: '3rem', marginBottom: '16px' }}>⏳</div>
            <h2 style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontSize: '1.5rem', fontWeight: 700,
              color: '#c9a84c', marginBottom: '12px', letterSpacing: '0.03em'
            }}>
              Solicitação enviada
            </h2>
            <div style={{ width: '48px', height: '1px', background: 'linear-gradient(90deg, transparent, #c9a84c, transparent)', margin: '0 auto 16px' }} />
            <p style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '0.88rem', color: '#5a6a7a', lineHeight: 1.8
            }}>
              Sua solicitação de acesso foi recebida.<br />
              Você será notificado assim que o administrador aprovar seu cadastro.
            </p>
          </div>
          <button
            onClick={() => router.push('/login')}
            className={styles.btn}
          >
            Voltar ao login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.orb1} />
      <div className={styles.orb2} />
      <div className={styles.orb3} />

      <div className={styles.container} style={{ maxWidth: '440px' }}>
        <div className={styles.logoWrap}>
          <img src="/logo.png" alt="Oráculo Fiscal MS" className={styles.logoImg} />
        </div>

        <div className={styles.titleBlock}>
          <h1 className={styles.titulo}>Solicitar acesso</h1>
          <div className={styles.divisor} />
          <p className={styles.subtitulo}>Oráculo Fiscal MS · SEFAZ/MS</p>
        </div>

        <form onSubmit={enviar} className={styles.form}>
          <div className={styles.fieldGroup}>
            <label className={styles.label}>Nome completo *</label>
            <input
              className={styles.input}
              value={form.nome}
              onChange={set('nome')}
              placeholder="Seu nome completo"
              required
              autoFocus
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label}>Email institucional *</label>
            <input
              type="email"
              className={styles.input}
              value={form.email}
              onChange={set('email')}
              placeholder="seu@sefaz.ms.gov.br"
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className={styles.fieldGroup}>
              <label className={styles.label}>Matrícula</label>
              <input
                className={styles.input}
                value={form.matricula}
                onChange={set('matricula')}
                placeholder="Nº matrícula"
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.label}>Cargo</label>
              <select
                className={styles.input}
                value={form.cargo}
                onChange={set('cargo')}
                style={{ cursor: 'pointer' }}
              >
                <option>Fiscal Tributário</option>
                <option>Auditor Fiscal</option>
              </select>
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label}>Senha *</label>
            <input
              type="password"
              className={styles.input}
              value={form.senha}
              onChange={set('senha')}
              placeholder="Mínimo 8 caracteres"
              required
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label}>Confirmar senha *</label>
            <input
              type="password"
              className={styles.input}
              value={form.confirmar}
              onChange={set('confirmar')}
              placeholder="Repita a senha"
              required
            />
          </div>

          {erro && (
            <div className={styles.erroBox}>
              <span className={styles.erroIcon}>⚠</span>
              <span>{erro}</span>
            </div>
          )}

          <button type="submit" className={styles.btn} disabled={enviando} style={{ marginTop: '8px' }}>
            <span className={styles.btnInner}>
              {enviando ? <><span className={styles.spinner} /> Enviando...</> : 'Solicitar acesso'}
            </span>
          </button>
        </form>

        <p className={styles.rodape} style={{ marginTop: '20px' }}>
          <button
            onClick={() => router.push('/login')}
            style={{ background: 'none', border: 'none', color: '#3a5a7a', cursor: 'pointer', fontSize: '0.72rem', letterSpacing: '0.06em', textTransform: 'uppercase', textDecoration: 'underline' }}
          >
            Já tenho acesso — fazer login
          </button>
        </p>
      </div>
    </div>
  )
}
