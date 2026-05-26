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

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: senha
      })

      if (error || !data?.user) {
        setErro('Email ou senha incorretos.')
        setCarregando(false)
        return
      }

      let perfil = null

      // tenta localizar por ID
      const { data: perfilPorId } = await supabase
        .from('perfis')
        .select('*')
        .eq('id', data.user.id)
        .maybeSingle()

      perfil = perfilPorId

      // fallback ADMIN
      if (!perfil) {
        const { data: adminPerfil } = await supabase
          .from('perfis')
          .select('*')
          .eq('cargo', 'Administrador')
          .maybeSingle()

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

      router.push('/')

    } catch (err) {
      console.error(err)

      setErro('Erro interno de autenticação.')
    }

    setCarregando(false)
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
            />
          </div>

          {erro && (
            <div className={styles.erroBox}>
              <span className={styles.erroIcon}>⚠</span>
              <span>{erro}</span>
            </div>
          )}

          <button
            type="submit"
            className={styles.btn}
            disabled={carregando}
          >
            {carregando ? (
              <span className={styles.btnInner}>
                <span className={styles.spinner} />
                Verificando...
              </span>
            ) : (
              <span className={styles.btnInner}>
                Acessar sistema
              </span>
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
