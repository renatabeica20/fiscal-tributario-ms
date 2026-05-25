import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { supabase } from '../lib/supabase'
import '../styles/globals.css'

const ROTAS_PUBLICAS = ['/login', '/cadastro', '/aguardando']

export default function App({ Component, pageProps }) {
  const router = useRouter()
  const [verificando, setVerificando] = useState(true)
  const [atualizacaoPendente, setAtualizacaoPendente] = useState(false)

  useEffect(() => {
    const handleChunkError = (event) => {
      const msg = event?.reason?.message || event?.message || ''
      if (
        msg.includes('Loading chunk') ||
        msg.includes('ChunkLoadError') ||
        msg.includes('Failed to fetch') ||
        msg.includes('Unexpected token') ||
        msg.includes('Loading CSS chunk')
      ) {
        setAtualizacaoPendente(true)
      }
    }

    window.addEventListener('unhandledrejection', handleChunkError)
    window.addEventListener('error', handleChunkError)

    return () => {
      window.removeEventListener('unhandledrejection', handleChunkError)
      window.removeEventListener('error', handleChunkError)
    }
  }, [])

  useEffect(() => {
    const verificar = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const rotaPublica = ROTAS_PUBLICAS.includes(router.pathname)

      if (!session && !rotaPublica) {
        router.push('/login')
      } else if (session && rotaPublica) {
        // Verifica status do perfil antes de redirecionar
        const { createClient } = await import('@supabase/supabase-js')
        const sb = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        )
        const { data: perfil } = await sb.from('perfis').select('status, ativo').eq('id', session.user.id).single()
        if (perfil?.status === 'pendente' || !perfil?.ativo) {
          router.push('/aguardando')
        } else {
          router.push('/')
        }
      } else if (session && !rotaPublica) {
        // Verifica se fiscal pendente está tentando acessar área restrita
        const { createClient } = await import('@supabase/supabase-js')
        const sb = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        )
        const { data: perfil } = await sb.from('perfis').select('status, ativo').eq('id', session.user.id).single()
        if (perfil?.status === 'pendente' && router.pathname !== '/aguardando') {
          router.push('/aguardando')
        } else {
          setVerificando(false)
        }
      } else {
        setVerificando(false)
      }
    }

    verificar()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session && !ROTAS_PUBLICAS.includes(router.pathname)) {
        router.push('/login')
      }
    })

    return () => subscription.unsubscribe()
  }, [router.pathname])

  if (verificando && !ROTAS_PUBLICAS.includes(router.pathname)) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0d2f5e 0%, #1a4a8a 100%)',
        color: '#fff',
        fontFamily: 'monospace',
        fontSize: '0.9rem',
        letterSpacing: '0.05em'
      }}>
        Verificando acesso...
      </div>
    )
  }

  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </Head>

      {atualizacaoPendente && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 9999,
          background: 'linear-gradient(135deg, #0d2f5e, #1a4a8a)',
          borderBottom: '3px solid #e8a000',
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.2rem' }}>🔄</span>
            <div>
              <p style={{
                margin: 0,
                color: '#ffffff',
                fontSize: '0.85rem',
                fontWeight: 700,
                letterSpacing: '0.02em'
              }}>
                Nova versão disponível
              </p>
              <p style={{
                margin: 0,
                color: '#a8c8e8',
                fontSize: '0.72rem',
                fontFamily: 'monospace'
              }}>
                Recarregue para aplicar as atualizações
              </p>
            </div>
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#e8a000',
              color: '#0d2f5e',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 18px',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: '0.04em',
              fontFamily: 'monospace',
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            ATUALIZAR AGORA
          </button>
        </div>
      )}

      <Component {...pageProps} />
    </>
  )
}
