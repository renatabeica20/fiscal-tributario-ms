import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' })

  const { nome, email, senha, matricula, cargo } = req.body

  if (!nome || !email || !senha) {
    return res.status(400).json({ error: 'Nome, email e senha são obrigatórios.' })
  }

  // Cria usuário no Supabase Auth
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true
  })

  if (authError) {
    return res.status(400).json({ error: authError.message })
  }

  // Cria perfil vinculado
  const { error: perfilError } = await supabaseAdmin
    .from('perfis')
    .insert({
      id: authData.user.id,
      nome,
      matricula: matricula || null,
      cargo: cargo || 'Fiscal Tributário',
      ativo: true
    })

  if (perfilError) {
    // Rollback: remove o usuário criado
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
    return res.status(500).json({ error: 'Erro ao criar perfil do fiscal.' })
  }

  return res.status(200).json({ ok: true, id: authData.user.id })
}
