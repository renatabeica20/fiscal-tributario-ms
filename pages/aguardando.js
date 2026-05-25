// pages/aguardando.js
import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import styles from '../styles/Login.module.css'

export default function Aguardando() {
  const router = useRouter()

  useEffect(() => {
    const verificar = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: perfil } = await supabase
        .from('perfis')
        .select('status, ativo')
        .eq('id', user.id)
        .single()

      // Se foi aprovado, vai para o sistema
      if (perfil?.status === 'aprovado' && perfil?.ativo) {
        router.push('/')
      }
    }

    verificar()
    // Verifica a cada 30 segundos
    const intervalo = setInterval(verificar, 30000)
    return () => clearInterval(intervalo)
  }, [])

  const sair = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className={styles.page}>
      <div className={styles.orb1} />
      <div className={styles.orb2} />
      <div className={styles.container} style={{ textAlign: 'center' }}>
        <div className={styles.logoWrap}>
          <img src="/logo.png" alt="Oráculo Fiscal MS" className={styles.logoImg} />
        </div>

        <div style={{ marginBottom: '32px' }}>
          <div style={{
            width: '64px', height: '64px', margin: '0 auto 20px',
            border: '2px solid rgba(201,168,76,0.2)',
            borderTop: '2px solid #c9a84c',
            borderRadius: '50%',
            animation: 'spin 2s linear infinite'
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

          <h2 style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: '1.6rem', fontWeight: 700,
            color: '#c9a84c', marginBottom: '12px', letterSpacing: '0.03em'
          }}>
            Aguardando aprovação
          </h2>
          <div style={{ width: '48px', height: '1px', background: 'linear-gradient(90deg, transparent, #c9a84c, transparent)', margin: '0 auto 16px' }} />
          <p style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '0.88rem', color: '#5a6a7a', lineHeight: 1.9, maxWidth: '320px', margin: '0 auto'
          }}>
            Sua solicitação está em análise.<br />
            O administrador será notificado e aprovará seu acesso em breve.<br />
            <span style={{ fontSize: '0.75rem', color: '#2a3a4a' }}>Esta página verifica automaticamente a cada 30 segundos.</span>
          </p>
        </div>

        <button onClick={sair} style={{
          background: 'transparent',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '8px',
          color: '#3a4a5a',
          padding: '10px 24px',
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '0.78rem',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          transition: 'all 0.2s'
        }}>
          Sair
        </button>
      </div>
    </div>
  )
}
