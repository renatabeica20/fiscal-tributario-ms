// pages/api/cadastrar.js
// Cadastro público — fiscal cria sua própria conta, fica com status 'pendente'

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

  if (senha.length < 8) {
    return res.status(400).json({ error: 'A senha deve ter pelo menos 8 caracteres.' })
  }

  // Valida domínio de email institucional
  const DOMINIOS_PERMITIDOS = ['sefaz.ms.gov.br', 'fazenda.ms.gov.br', 'ms.gov.br']
  const dominio = email.trim().split('@')[1]?.toLowerCase()
  if (!dominio || !DOMINIOS_PERMITIDOS.some(d => dominio === d || dominio.endsWith('.' + d))) {
    return res.status(400).json({ error: 'Use seu email institucional (@sefaz.ms.gov.br ou @ms.gov.br).' })
  }

  // Validações básicas anti-spam
  if (nome.trim().length < 5) {
    return res.status(400).json({ error: 'Nome muito curto.' })
  }
  if (nome.trim().length > 100) {
    return res.status(400).json({ error: 'Nome muito longo.' })
  }

  // Verifica se email já existe
  const { data: existente } = await supabaseAdmin
    .from('perfis')
    .select('id')
    .eq('id', (await supabaseAdmin.auth.admin.listUsers()).data?.users?.find(u => u.email === email.trim())?.id || 'nenhum')
    .single()

  // Cria usuário no Supabase Auth
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: email.trim(),
    password: senha,
    email_confirm: true
  })

  if (authError) {
    if (authError.message.includes('already registered')) {
      return res.status(400).json({ error: 'Este email já está cadastrado.' })
    }
    return res.status(400).json({ error: authError.message })
  }

  // Cria perfil com status pendente e ativo = false
  const { error: perfilError } = await supabaseAdmin
    .from('perfis')
    .insert({
      id: authData.user.id,
      nome: nome.trim(),
      matricula: matricula?.trim() || null,
      cargo: cargo || 'Fiscal Tributário',
      ativo: false,
      status: 'pendente'
    })

  if (perfilError) {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
    return res.status(500).json({ error: 'Erro ao criar perfil.' })
  }

  return res.status(200).json({ ok: true })
}
