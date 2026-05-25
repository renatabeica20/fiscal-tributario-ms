// pages/api/pendentes.js
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function verificarAdmin(req) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return false
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return false
  const { data: perfil } = await supabaseAdmin.from('perfis').select('cargo').eq('id', user.id).single()
  return perfil?.cargo === 'Administrador'
}

export default async function handler(req, res) {
  const isAdmin = await verificarAdmin(req)
  if (!isAdmin) return res.status(403).json({ error: 'Acesso negado' })

  // GET — lista pendentes
  if (req.method === 'GET') {
    const { data } = await supabaseAdmin
      .from('perfis')
      .select('*')
      .eq('status', 'pendente')
      .order('criado_em')
    return res.status(200).json({ pendentes: data || [] })
  }

  // POST — aprovar ou rejeitar
  if (req.method === 'POST') {
    const { id, acao } = req.body
    if (!id || !['aprovar', 'rejeitar'].includes(acao)) {
      return res.status(400).json({ error: 'Dados inválidos' })
    }

    const update = acao === 'aprovar'
      ? { status: 'aprovado', ativo: true }
      : { status: 'rejeitado', ativo: false }

    const { error } = await supabaseAdmin.from('perfis').update(update).eq('id', id)
    if (error) return res.status(500).json({ error: error.message })

    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Método não permitido' })
}
