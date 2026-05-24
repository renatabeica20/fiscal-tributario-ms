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

    // Verifica se é admin
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

    if (perfil?.cargo === 'Administrador') {
      router.push('/admin')
    } else {
      router.push('/')
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>§</div>
        <h1 className={styles.titulo}>Oráculo Fiscal MS</h1>
        <p className={styles.subtitulo}>Especialista em legislação tributária do Estado de Mato Grosso do Sul</p>

        <form onSubmit={entrar} className={styles.form}>
          <label className={styles.label}>Email institucional</label>
          <input
            type="email"
            className={styles.input}
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="fiscal@sefaz.ms.gov.br"
            required
            autoFocus
          />

          <label className={styles.label}>Senha</label>
          <input
            type="password"
            className={styles.input}
            value={senha}
            onChange={e => setSenha(e.target.value)}
            placeholder="••••••••"
            required
          />

          {erro && <p className={styles.erro}>{erro}</p>}

          <button type="submit" className={styles.btn} disabled={carregando}>
            {carregando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className={styles.rodape}>
          Acesso restrito. Ferramenta de apoio operacional.
        </p>
      </div>
    </div>
  )
}
