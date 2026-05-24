import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { supabase } from '../lib/supabase'
import '../styles/globals.css'

const ROTAS_PUBLICAS = ['/login']

export default function App({ Component, pageProps }) {
  const router = useRouter()
  const [verificando, setVerificando] = useState(true)

  useEffect(() => {
    const verificar = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const rotaPublica = ROTAS_PUBLICAS.includes(router.pathname)

      if (!session && !rotaPublica) {
        router.push('/login')
      } else if (session && rotaPublica) {
        router.push('/')
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
      <Component {...pageProps} />
    </>
  )
}
