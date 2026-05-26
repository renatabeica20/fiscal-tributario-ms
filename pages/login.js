import { useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import styles from '../styles/Login.module.css'

export default function Login() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  const entrar = async (e) => {
    e.preventDefault()

    setErro('')
    setCarregando(true)

    const emailNormalizado = email.trim().toLowerCase()

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

      // 1. Busca principal: perfil vinculado ao UID do usuário autenticado
      const { data: perfilPorId, error: erroPerfilId } = await supabase
        .from('perfis')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      if (erroPerfilId) {
        console.error('Erro ao buscar perfil por ID:', erroPerfilId)
      }

      perfil = perfilPorId

      // 2. Fallback controlado: permite acesso se houver perfil Administrador ativo
      // Útil no ambiente de teste quando o UID do Auth foi recriado.
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

      // Redirecionamento com reload completo para evitar erro de fetchComponent do Next.js em Preview.
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
            <label className={styles.label}>Email de acesso</label>
            <input
              type="email"
              className={styles.input}
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              autoFocus
              autoComplete="email"
            />
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
            />
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
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            alignItems: 'center'
          }}
        >
          <span>Acesso restrito · SEFAZ/MS</span>

          <button
            onClick={() => router.push('/cadastro')}
            style={{
              background: 'none',
              border: 'none',
              color: '#3a5a7a',
              cursor: 'pointer',
              fontSize: '0.65rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
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
