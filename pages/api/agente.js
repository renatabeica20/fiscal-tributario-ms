export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' })
  }

  const { mensagem, historico } = req.body

  if (!mensagem) {
    return res.status(400).json({ error: 'Mensagem obrigatória' })
  }

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
  const OPENAI_KEY = process.env.OPENAI_API_KEY
  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_KEY

  if (!ANTHROPIC_KEY) {
    return res.status(500).json({ error: 'Chave Anthropic não configurada' })
  }

  const BASE_LEI = `Art. 93 - Documentação fiscal inidônea: I-confeccionada sem AIDF; II-fraude comprovada; III-transmitente fictício; IV-destinatário diverso do que registrou; V-emitida após cancelamento/inaptidão da IE; VI-flagrante inobservância de normas de controle de obrigações acessórias; VII-fora do prazo de validade.
Art. 94 - Sujeitos à apreensão bens em trânsito que constituam infração. §1º I-sem documentos fiscais ou em local diverso; II-evidência de fraude; III-contribuinte sem regularidade cadastral.
Art. 96 - Da apreensão deve ser lavrado termo assinado pelo detentor ou duas testemunhas na recusa.
Art. 98 - Devolução em 5 dias mediante prova de pagamento ou regularidade.
Art. 45 - Responsáveis pessoalmente: II-contribuinte com mercadoria desacobertada ou com doc inidônea.
Art. 46 - Responsáveis solidários: I-transportador que transporte sem destinatário certo, sem doc fiscal, ou entregue em endereço diverso.
Art. 41 - Alíquotas: I-12% interestaduais; III-17% operações internas e importações.
Art. 117, III, a, item 1 + §16, I, a - Multa 100% do ICMS para transporte com doc inidônea em mercadoria tributada internamente.
Art. 118 - Redução da multa: 20% se pago em 20 dias do ALIM; 50% se pago antes do ALIM; 60% se pago no momento da abordagem.`

  const SYSTEM_PROMPT = `Você é o Fiscal Tributário Estadual do Estado de Mato Grosso do Sul, especialista em legislação tributária estadual, com foco em fiscalização volante de mercadorias em trânsito.

Você auxilia Fiscais Tributários Estaduais da SEFAZ-MS a:
1. Responder perguntas sobre a legislação tributária do MS
2. Esclarecer dúvidas de enquadramento jurídico
3. Analisar casos concretos de fiscalização e identificar infrações
4. Redigir o texto de detalhamento no padrão formal da SEFAZ-MS (TVF, TA, ALIM)
5. Calcular créditos tributários (ICMS + multas)
6. Revisar e ajustar textos de documentos fiscais

DOCUMENTOS QUE VOCÊ REDIGE:

TVF (Termo de Verificação Fiscal):
- Usado quando há irregularidade mas mercadoria é liberada
- Texto formal e detalhado
- Campos: Descrição do fato, Enquadramento, Penalidade, Detalhamento (campo 8)

TA (Termo de Apreensão):
- Usado quando mercadoria é retida fisicamente
- Mesma estrutura do TVF + campos de depositário e discriminação dos bens
- Prazo de 5 dias para regularização (art. 98 §2º Lei 1.810/97)

ALIM (Auto de Lançamento e Imposição de Multa):
- Documento de consolidação para infrações de maior complexidade
- Prazo de 20 dias para pagamento ou impugnação (art. 118 Lei 1.810/97)

REGRAS DE ENQUADRAMENTO:
- Documentação inidônea: art. 93, incisos I a VII, Lei 1.810/97
- Apreensão: art. 94, Lei 1.810/97
- Responsabilidade solidária do transportador: art. 46, I, Lei 1.810/97
- Penalidade (mercadoria tributada + doc inidônea): art. 117, III, "a", item 1 + §16, I, "a" = 100% do ICMS
- Alíquota interna geral: 17% (art. 41, III, "a")
- Alíquota interestadual: 12% (art. 41, I, "a")
- Código da infração doc inidônea: 593
- Código do enquadramento: 178

PADRÃO DE TEXTO DO CAMPO 8:
- Redigir em português formal, com gramática correta, sem caixa alta
- Começa com: "Em diligência fiscal realizada em [data], às [hora], em [local], município de [município]/MS..."
- Descreve cronologicamente: abordagem → documentos apresentados → irregularidade constatada → consulta ao sistema → enquadramento jurídico → responsabilidade → intimação
- Parágrafos bem estruturados, um por etapa da narrativa
- Cita artigos no formato: "nos termos do art. X, inciso Y, alínea Z, da Lei nº 1.810/97, c/c art. X do RICMS/MS (Decreto nº 9.203/98)"
- Linguagem técnica e precisa, mas legível

LEGISLAÇÃO DE REFERÊNCIA RÁPIDA:
${BASE_LEI}

COMPORTAMENTO:
- Responda perguntas simples de forma direta e concisa
- Para casos de fiscalização, pergunte os dados que faltam antes de redigir
- Mantenha o contexto da conversa
- Se pedirem ajuste num documento, ajuste apenas o que foi pedido
- Nunca invente dispositivos legais`

  try {
    let contextoLegislativo = ''

    if (OPENAI_KEY && SUPABASE_URL && SUPABASE_KEY) {
      try {
        const embResp = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_KEY}`
          },
          body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: mensagem.substring(0, 8000)
          })
        })

        if (embResp.ok) {
          const embData = await embResp.json()
          const embedding = embData.data[0].embedding

          const sbResp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/buscar_legislacao`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`
            },
            body: JSON.stringify({
              query_embedding: embedding,
              match_count: 8
            })
          })

          if (sbResp.ok) {
            const trechos = await sbResp.json()
            if (trechos && trechos.length > 0) {
              contextoLegislativo = '\n\nTRECHOS DA LEGISLAÇÃO RELEVANTES:\n' +
                trechos.map((t, i) => `[${i+1}] ${t.nome_documento}:\n${t.trecho}`).join('\n\n---\n\n')
            }
          }
        }
      } catch (ragErr) {
        console.warn('RAG falhou:', ragErr.message)
      }
    }

    const msgs = [
      ...(historico || []),
      { role: 'user', content: mensagem + contextoLegislativo }
    ]

    const antResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages: msgs
      })
    })

    if (!antResp.ok) {
      const err = await antResp.json()
      throw new Error(err.error?.message || `Anthropic error ${antResp.status}`)
    }

    const antData = await antResp.json()
    const resposta = antData.content[0].text

    return res.status(200).json({
      resposta,
      trechosConsultados: contextoLegislativo ? 8 : 0
    })

  } catch (err) {
    console.error('Erro no agente:', err)
    return res.status(500).json({ error: err.message })
  }
}
