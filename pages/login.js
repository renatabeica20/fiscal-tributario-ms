import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import styles from '../styles/Login.module.css'

const DOMINIO = '@fazenda.ms.gov.br'
const STORAGE_KEY = 'oraculo_usuario'

export default function Login() {
  const router = useRouter()

  const [usuario, setUsuario] = useState('')
  const [senha, setSenha] = useState('')
  const [lembrar, setLembrar] = useState(false)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  // Carrega usuário salvo ao montar
  useEffect(() => {
    const salvo = localStorage.getItem(STORAGE_KEY)
    if (salvo) {
      setUsuario(salvo)
      setLembrar(true)
    }
  }, [])

  const entrar = async (e) => {
    e.preventDefault()
    setErro('')
    setCarregando(true)

    const usuarioLimpo = usuario.trim().toLowerCase().replace(/@.*$/, '') // remove @ se colou email inteiro
    const emailNormalizado = usuarioLimpo + DOMINIO

    // Salva ou remove do localStorage conforme checkbox
    if (lembrar) {
      localStorage.setItem(STORAGE_KEY, usuarioLimpo)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailNormalizado,
        password: senha
      })

      if (error || !data?.user) {
        console.error('Erro Supabase Auth:', error)
        setErro('Email ou senha incorretos.')
        setCarregando(false)
        return
      }

      const userId = data.user.id
      let perfil = null

      const { data: perfilPorId, error: erroPerfilId } = await supabase
        .from('perfis')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      if (erroPerfilId) {
        console.error('Erro ao buscar perfil por ID:', erroPerfilId)
      }

      perfil = perfilPorId

      if (!perfil) {
        const { data: adminPerfil, error: erroAdminPerfil } = await supabase
          .from('perfis')
          .select('*')
          .eq('cargo', 'Administrador')
          .eq('ativo', true)
          .maybeSingle()

        if (erroAdminPerfil) {
          console.error('Erro ao buscar perfil administrador:', erroAdminPerfil)
        }

        perfil = adminPerfil
      }

      if (!perfil) {
        await supabase.auth.signOut()
        setErro('Usuário sem perfil autorizado.')
        setCarregando(false)
        return
      }

      if (!perfil.ativo) {
        await supabase.auth.signOut()
        setErro('Conta inativa. Contate o administrador.')
        setCarregando(false)
        return
      }

      if (perfil.status && perfil.status !== 'aprovado') {
        await supabase.auth.signOut()
        setErro('Cadastro ainda não aprovado.')
        setCarregando(false)
        return
      }

      window.location.assign('/')
    } catch (err) {
      console.error('Erro interno no login:', err)
      setErro('Erro interno de autenticação.')
      setCarregando(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.orb1} />
      <div className={styles.orb2} />
      <div className={styles.orb3} />

      <div className={styles.container}>
        <div className={styles.logoWrap}>
          <img
            src="/logo.png"
            alt="Oráculo Fiscal MS"
            className={styles.logoImg}
          />
        </div>

        <div className={styles.titleBlock}>
          <h1 className={styles.titulo}>Oráculo Fiscal MS</h1>
          <div className={styles.divisor} />
          <p className={styles.subtitulo}>
            Conhecimento que orienta. Fiscalização que transforma.
          </p>
        </div>

        <form onSubmit={entrar} className={styles.form}>
          <div className={styles.fieldGroup}>
            <label className={styles.label}>Usuário</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
              <input
                type="text"
                className={styles.input}
                style={{ borderRadius: '8px 0 0 8px', flex: 1 }}
                value={usuario}
                onChange={e => setUsuario(e.target.value)}
                placeholder="seu.nome"
                required
                autoFocus={!usuario}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
              />
              <span style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(201,168,76,0.2)',
                borderLeft: 'none',
                borderRadius: '0 8px 8px 0',
                padding: '0 12px',
                height: '44px',
                display: 'flex',
                alignItems: 'center',
                fontSize: '0.78rem',
                color: '#4a6a8a',
                whiteSpace: 'nowrap',
                userSelect: 'none'
              }}>
                {DOMINIO}
              </span>
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label}>Senha</label>
            <input
              type="password"
              className={styles.input}
              value={senha}
              onChange={e => setSenha(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              autoFocus={!!usuario}
            />
          </div>

          {/* Lembrar usuário */}
          <div
            onClick={() => setLembrar(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              cursor: 'pointer', userSelect: 'none', marginBottom: '4px'
            }}
          >
            <div style={{
              width: '18px', height: '18px', flexShrink: 0,
              borderRadius: '4px',
              border: lembrar ? '2px solid #c9a84c' : '2px solid rgba(255,255,255,0.2)',
              background: lembrar ? '#c9a84c' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.2s'
            }}>
              {lembrar && (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="#0d2f5e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <span style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '0.72rem', color: '#4a6a8a',
              letterSpacing: '0.04em'
            }}>
              Lembrar meu usuário
            </span>
          </div>

          {erro && (
            <div className={styles.erroBox}>
              <span className={styles.erroIcon}>⚠</span>
              <span>{erro}</span>
            </div>
          )}

          <button type="submit" className={styles.btn} disabled={carregando}>
            {carregando ? (
              <span className={styles.btnInner}>
                <span className={styles.spinner} />
                Verificando...
              </span>
            ) : (
              <span className={styles.btnInner}>Acessar sistema</span>
            )}
          </button>
        </form>

        <p
          className={styles.rodape}
          style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}
        >
          <span>Acesso restrito · SEFAZ/MS</span>
          <button
            onClick={() => router.push('/cadastro')}
            style={{
              background: 'none', border: 'none', color: '#3a5a7a',
              cursor: 'pointer', fontSize: '0.65rem',
              letterSpacing: '0.08em', textTransform: 'uppercase',
              textDecoration: 'underline'
            }}
          >
            Primeiro acesso? Solicitar cadastro
          </button>
        </p>
      </div>
    </div>
  )
}
