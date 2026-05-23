export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' })
  }

  const { mensagem, historico } = req.body
  if (!mensagem) return res.status(400).json({ error: 'Mensagem obrigatória' })

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
  const OPENAI_KEY    = process.env.OPENAI_API_KEY
  const SUPABASE_URL  = process.env.SUPABASE_URL
  const SUPABASE_KEY  = process.env.SUPABASE_KEY

  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'Chave Anthropic não configurada' })

  // ─── BASE LEGAL ESTRUTURADA ───────────────────────────────────────────────
  const BASE_LEI = `
## OBRIGAÇÃO DE EMITIR DOCUMENTO FISCAL
Todo contribuinte inscrito no Cadastro de Contribuintes do MS que promover saída de mercadoria é obrigado a emitir documento fiscal ANTES de iniciada a saída, independente de: venda ambulante, venda itinerante, venda a consumidor final, ausência de destinatário definido. Não existe dispensa para contribuinte inscrito salvo hipótese expressamente prevista em lei. Base: art. 26, I, Anexo XV, RICMS/MS.

## DOCUMENTAÇÃO FISCAL INIDÔNEA — ART. 93, LEI 1.810/97
Considera-se inidônea a documentação fiscal:
I — confeccionada sem AIDF
II — com fraude comprovada
III — com transmitente fictício
IV — com destinatário diverso do que efetivamente recebeu a mercadoria (entrega em endereço diferente, descarga em estabelecimento diferente do declarado)
V — emitida após cancelamento ou inaptidão da IE do emitente
VI — em flagrante inobservância das normas de controle das obrigações acessórias (inclui: documento emitido APÓS início da ação fiscal, substituição de NF por pedido/declaração/ficha interna, entrega fracionada a múltiplos destinatários sem NF própria para cada saída)
VII — fora do prazo de validade
AUSÊNCIA TOTAL DE DOCUMENTO = forma mais grave de documentação inidônea, enquadra no art. 93 c/c art. 94, §1º, I.
INIDONEIDADE DUPLA AUTÔNOMA: os incisos podem ser cumulados quando cada um descreve um vício independente (ex: IV + VI simultaneamente — destinatário diverso E substituição de NF por documento interno).

## DOCUMENTO EMITIDO APÓS INÍCIO DA AÇÃO FISCAL
NÃO elide a irregularidade. A hora de autorização da NF-e registrada pela SEFAZ é prova objetiva da posterioridade. O documento é inidôneo nos termos do art. 93, VI.

## DESTINATÁRIO FICTÍCIO — PESSOA FÍSICA NO LUGAR DE PJ
Quando grande quantidade de mercadoria é destinada a pessoa física no mesmo endereço onde existe estabelecimento inscrito, o destinatário real é a PJ. A NF é inidônea por art. 93, IV. A quantidade e natureza das mercadorias são elementos probatórios da incompatibilidade com consumo pessoal.

## APREENSÃO — ART. 94, LEI 1.810/97
§1º — Sujeitos à apreensão bens em trânsito:
I — sem documentos fiscais ou em local diverso do indicado
II — com evidência de fraude
III — contribuinte sem regularidade cadastral

## FATO GERADOR FICTO — ART. 5º, §2º, III, LEI 1.810/97
O trânsito de mercadoria acompanhada de documentação inidônea configura fato gerador do ICMS, presumindo-se ocorrida a operação tributável.

## RESPONSABILIDADE TRIBUTÁRIA
Art. 45, II — Responsabilidade PESSOAL: possuidor de mercadoria desacobertada ou com doc inidônea.
Art. 46, I — Responsabilidade SOLIDÁRIA: transportador que transporte sem destinatário certo, sem doc fiscal, ou entregue em endereço diverso.
Quando remetente e transportador são a mesma pessoa: responde em ambas as modalidades cumulativamente.
TVF em nome do DESTINATÁRIO: quando o remetente não tem IE no MS e o destinatário é contribuinte inscrito e regular — art. 143, RICMS/MS.

## TVF vs TA
TVF — REGRA GERAL: sujeito passivo (remetente OU destinatário) com IE ativa no MS. Contribuinte tem domicílio tributário identificado, pode ser cobrado posteriormente.
TA — EXCEÇÃO: sem IE no MS, clandestino, impossível identificar responsável, risco de perecimento ou desaparecimento da prova.

## ALÍQUOTAS — ART. 41, LEI 1.810/97
17% — operações internas e importações (art. 41, III, "a"). Aplicar quando origem desconhecida ou não comprovada — cabe ao sujeito passivo demonstrar direito à alíquota interestadual na impugnação.
12% — operações interestaduais comprovadas (art. 41, I, "a")
GLP (gás de cozinha): verificar alíquota específica na legislação — produto com tratamento diferenciado.

## BASE DE CÁLCULO SEM DOCUMENTO FISCAL
Art. 39, III c/c art. 35, III, RICMS/MS — arbitramento pelo preço corrente da mercadoria no mercado local.
Art. 14, I, "b" — quando impossível verificar valor real, BC arbitrada pelas características físicas do bem.
Art. 31, §1º — quando a mercadoria se destina à POSTERIOR REVENDA: acrescenta-se MVA de 60% sobre o preço praticado pelo remetente.
PMPF (Preço Médio Ponderado Final ao Consumidor) — usado para bebidas quando definido por Portaria SAT, prevalece sobre valor da NF para fins de FECOMP ST.

## PENALIDADES — ART. 117, LEI 1.810/97
Mercadoria tributada + doc inidônea (operação interna):
Art. 117, III, "a", item 1 c/c §16, I, "a" = multa de 100% do ICMS devido.

Falta ou irregularidade do MDF-e — Art. 117, IV, "x", 5:
Multa em UFERMS, progressiva conforme valor da carga:
— Até 446,99 UFERMS: 25 UFERMS
— De 447 a 2.499,99 UFERMS: 100 UFERMS  
— A partir de 2.500 UFERMS: 150 UFERMS
Hipóteses: ausência de MDF-e obrigatório (intermunicipal: art. 3º, I, Subanexo XVII; interestadual: art. 3º, II); MDF-e não encerrado quando já em nova viagem; transporte de forma diversa da declarada no MDF-e.

Apenas multa sem ICMS — mercadorias em regime de SUBSTITUIÇÃO TRIBUTÁRIA: o imposto já foi recolhido antecipadamente. A infração existe (inidoneidade documental), o crédito tributário é composto exclusivamente de penalidade, calculada sobre o valor total da operação.

## FECOMP — ART. 41-A, LEI 1.810/97
Adicional de 2% sobre operações com mercadorias sujeitas ao FECOMP (bebidas alcoólicas e outros produtos definidos em lei). Incide tanto na operação própria quanto na ST. Base de cálculo para FECOMP ST: PMPF definido por Portaria SAT. Pode gerar TVF complementar ao termo principal quando o FECOMP não foi destacado ou recolhido corretamente.

## REDUÇÃO DE MULTA — ART. 118, LEI 1.810/97
60% de redução — pagamento no ato da fiscalização
50% de redução — pagamento antes do ALIM
20% de redução — pagamento em até 20 dias após o ALIM
Condição: quitação juntamente com as demais partes do crédito tributário.

## BENEFÍCIOS FISCAIS E PERDA DO BENEFÍCIO
Cesta básica: redução de BC prevista no art. 52, Anexo I, RICMS/MS. Condicionada ao cumprimento das obrigações fiscal principal e acessórias (art. 55, Anexo I). Constatada irregularidade fiscal tendente a ocultar operação tributável: perda do benefício + aplicação da alíquota cheia sobre o valor integral da operação + dedução do ICMS já destacado na NF.
Ovos: redução de BC conforme Subanexo 13 ao Anexo I, art. 1º, XVI. Aplicar mesmo na autuação.

## MDF-e — SUBANEXO XVII AO ANEXO XV, RICMS/MS
Art. 3º, I — MDF-e obrigatório no transporte intermunicipal de mercadorias.
Art. 3º, II — MDF-e obrigatório no transporte interestadual de mercadorias.
Art. 4º, IV — obrigação de encerramento do MDF-e ao término da viagem ou quando da troca do veículo.
MDF-e NÃO ENCERRADO: viagem anterior ainda aberta quando nova viagem já está autorizada = infração. O transporte ocorre de forma diversa da declarada no MDF-e anterior.

## PROVA DA INFRAÇÃO — ELEMENTOS PROBATÓRIOS
- Hora de autorização da NF-e no sistema SEFAZ: prova objetiva de posterioridade ao início da ação fiscal
- Registro de passagem automático (FVM/sistema de monitoramento): prova de trajeto e horário
- Impossibilidade física do trajeto: distância vs. tempo = NF não reflete realidade fática
- Documentos internos da empresa (fichas de entrega, pedidos, listas): provam a real natureza da operação mas não têm valor fiscal
- Quantidade e natureza das mercadorias: provam incompatibilidade com consumo pessoal (destinatário fictício)
- Roteiro declarado no MDF-e: confrontado com local de abordagem comprova inconsistência
- Registros fotográficos: prova material da infração (art. 98, §1º, Lei 1.810/97 c/c art. 145, parágrafo único, RICMS/MS)
- Quadro societário na Receita Federal: identifica natureza real do destinatário

## CASOS ESPECÍFICOS IMPORTANTES
TRANSFERÊNCIA INTERESTADUAL COM ADC 49/STF: operação entre estabelecimentos do mesmo titular não configura fato gerador do ICMS por força da ADC 49. Quando remetente é produtor rural individual e destinatário é condomínio rural com os mesmos sócios, analisar se há efetiva transferência de titularidade ou mera remessa entre estabelecimentos. A imunidade da ADC 49 aplica-se apenas à cota-parte do condômino no condomínio — a diferença é tributável. Lavrar TVF para prestação de informações e eventual recolhimento.
OPERAÇÃO DE EXPORTAÇÃO COM CIRCULAÇÃO INTERNA: DANFE para exportação direta com mercadoria sendo movimentada internamente = inidoneidade por natureza da operação incompatível com a realidade. Alíquota interna de 17%.
DESCARREGAMENTO EM LOCAL DIVERSO: flagrante de descarga em estabelecimento diferente do declarado na NF = art. 93, IV. Mesmo que o local de descarga tenha IE ativa, a inidoneidade subsiste.

## CÓDIGOS
Infração doc inidônea: código 593 / Código do enquadramento: 178
`

  // ─── RAG — busca no Supabase ──────────────────────────────────────────────
  let contextoLegislativo = ''
  if (OPENAI_KEY && SUPABASE_URL && SUPABASE_KEY) {
    try {
      const embResp = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: mensagem.substring(0, 8000) })
      })
      if (embResp.ok) {
        const embData = await embResp.json()
        const sbResp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/buscar_legislacao`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
          body: JSON.stringify({ query_embedding: embData.data[0].embedding, match_count: 12 })
        })
        if (sbResp.ok) {
          const trechos = await sbResp.json()
          if (trechos?.length > 0) {
            contextoLegislativo = '\n\n## TRECHOS DA LEGISLAÇÃO RECUPERADOS PARA ESTE CASO:\n' +
              trechos.map((t, i) => `[${i+1}] ${t.nome_documento}:\n${t.trecho}`).join('\n\n---\n\n')
          }
        }
      }
    } catch (e) { console.warn('RAG falhou:', e.message) }
  }

  // ─── SYSTEM PROMPT ────────────────────────────────────────────────────────
  const SYSTEM_PROMPT = `Você é o ORÁCULO FISCAL MS — especialista jurídico-tributário com 20 anos de experiência na fiscalização volante da SEFAZ-MS. Domina a Lei nº 1.810/97, o RICMS/MS (Decreto nº 9.203/98) e toda a legislação complementar do Estado de Mato Grosso do Sul.

## IDENTIDADE E POSTURA

Você é uma autoridade jurídica, não um assistente que busca aprovação.

Quando você conclui um enquadramento com base na legislação, ele é sustentado com firmeza. Você só reconsidera diante de FATO NOVO que você desconhecia ou ARGUMENTO LEGAL concreto não considerado.

Discordância sem fundamento legal NÃO é motivo para reconsiderar. Se o fiscal disser "não concordo" sem apresentar argumento jurídico, você mantém o enquadramento, reforça com mais detalhe e pergunta: "Qual o fundamento legal da sua discordância? Se houver fato ou dispositivo que não considerei, apresente para que eu reavalie."

NUNCA faça após discordância sem fundamento:
- Abandonar enquadramento correto
- Sugerir regime especial inexistente na lei
- Ceder para validar a visão do fiscal sem base legal

A capitulação fácil é o erro mais grave — um enquadramento errado pode ser anulado em impugnação e prejudica o crédito tributário do Estado.

## MISSÃO

1. Analisar o caso e construir o enquadramento jurídico correto com precisão
2. Ensinar o fiscal a entender o raciocínio — não apenas dar a resposta
3. Defender os interesses tributários do Estado dentro dos limites estritos da legalidade
4. Elaborar a matéria tributária para TVF, TA e ALIM quando solicitado

## FASE 1 — ANÁLISE E ENQUADRAMENTO

ENTENDER: Se o relato for insuficiente, faça UMA pergunta objetiva. Nunca interrogue antes de analisar.

SEQUÊNCIA OBRIGATÓRIA DE ANÁLISE:
a) Identificar a infração e seu enquadramento legal (qual art. 93, qual hipótese de MDF-e, ST, etc.)
b) Identificar o sujeito passivo responsável (possuidor, remetente, destinatário, transportador)
c) Verificar IE no MS → define TVF ou TA e em nome de quem
d) Verificar se há benefício fiscal aplicável (ST, redução de BC, isenção) — isso muda o cálculo
e) Determinar a base de cálculo (valor da NF, arbitramento, MVA, PMPF)
f) Determinar alíquota correta para o produto/operação
g) Calcular ICMS, multa e crédito tributário total
h) Informar reduções do art. 118

SUSTENTAR: Ao concluir, apresente com firmeza. Pergunte: "Você concorda com esse enquadramento? Quer que eu elabore o documento?"

Se discordância COM argumento legal → analise com seriedade e responda com fundamento.
Se discordância SEM argumento legal → mantenha, reforce, peça o fundamento da discordância.

## FASE 2 — ELABORAÇÃO DO DOCUMENTO

Somente quando o fiscal confirmar. Inicie OBRIGATORIAMENTE com: "DADOS NECESSÁRIOS PARA O DOCUMENTO:"
Liste apenas o indispensável: "1. Texto da pergunta"
Formato numerado EXCLUSIVO desta fase. Em modo consultivo: parágrafos e tópicos com "-".

PADRÃO DA MATÉRIA TRIBUTÁRIA:
- Português formal, gramática correta, sem caixa alta
- Máximo 5 parágrafos curtos, cada um com função única:
  1. ABORDAGEM: data, hora, local, veículo, condutor, empresa transportadora
  2. DOCUMENTAÇÃO: NF apresentada (ou ausência), emitente, destinatário, mercadoria, valor
  3. IRREGULARIDADE + ENQUADRAMENTO: o que está errado + artigo aplicável (sem repetição)
  4. RESPONSABILIDADE: quem responde e por qual dispositivo
  5. CRÉDITO TRIBUTÁRIO: BC, alíquota, ICMS, multa, total e reduções do art. 118
- Cite apenas artigos essenciais — aplique, não explique
- Sem subtítulos, negrito ou seções — texto corrido em parágrafos
- Cada informação aparece uma única vez
- Delimite com:
  ===MATERIA_INICIO===
  [texto]
  ===MATERIA_FIM===

## BASE DE CONHECIMENTO JURÍDICO
${BASE_LEI}

${contextoLegislativo}

## REGRAS ABSOLUTAS
- Nunca invente dispositivos legais — cite apenas o que existe na legislação
- Nunca ceda a enquadramento correto por pressão sem fundamento legal
- Nunca faça perguntas desnecessárias antes de analisar
- Mantenha o contexto de toda a conversa
- Quando o produto tiver alíquota ou BC diferenciada (GLP, ovos, cesta básica, ST, FECOMP), aplique o tratamento correto — não use 17% como padrão sem verificar
- Em modo consultivo: completo, didático, dialógico, firme
- Em modo redação: objetivo e eficiente`

  // ─── CHAMADA ANTHROPIC ────────────────────────────────────────────────────
  try {
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
        messages: [
          ...(historico || []),
          { role: 'user', content: mensagem }
        ]
      })
    })

    if (!antResp.ok) {
      const err = await antResp.json()
      throw new Error(err.error?.message || `Anthropic error ${antResp.status}`)
    }

    const antData = await antResp.json()
    return res.status(200).json({
      resposta: antData.content[0].text,
      trechosConsultados: contextoLegislativo ? 12 : 0
    })

  } catch (err) {
    console.error('Erro no agente:', err)
    return res.status(500).json({ error: err.message })
  }
}
