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

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: senha
    })

    if (error) {
      setErro('Email ou senha incorretos.')
      setCarregando(false)
      return
    }

    const { data: perfil } = await supabase
      .from('perfis')
      .select('cargo, ativo')
      .eq('id', data.user.id)
      .single()

    if (!perfil?.ativo) {
      await supabase.auth.signOut()
      setErro('Conta inativa. Contate o administrador.')
      setCarregando(false)
      return
    }

    router.push('/')
  }

  return (
    <div className={styles.page}>
      {/* Partículas decorativas */}
      <div className={styles.orb1} />
      <div className={styles.orb2} />
      <div className={styles.orb3} />

      <div className={styles.container}>
        {/* Logo */}
        <div className={styles.logoWrap}>
          <img
            src="/logo.png"
            alt="Oráculo Fiscal MS"
            className={styles.logoImg}
          />
        </div>

        {/* Título */}
        <div className={styles.titleBlock}>
          <h1 className={styles.titulo}>Oráculo Fiscal MS</h1>
          <div className={styles.divisor} />
          <p className={styles.subtitulo}>Conhecimento que orienta. Fiscalização que transforma.</p>
        </div>

        {/* Formulário */}
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

        <p className={styles.rodape}>
          Acesso restrito · SEFAZ/MS
        </p>
      </div>
    </div>
  )
}
