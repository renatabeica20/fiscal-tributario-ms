export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb',
    },
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' })
  }

  const { mensagem, historico, imagens } = req.body
  if (!mensagem && (!imagens || imagens.length === 0)) return res.status(400).json({ error: 'Mensagem ou imagem obrigatória' })

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
  const OPENAI_KEY    = process.env.OPENAI_API_KEY
  const SUPABASE_URL  = process.env.SUPABASE_URL
  const SUPABASE_KEY  = process.env.SUPABASE_KEY

  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'Chave Anthropic não configurada' })

  // ─── CONFIGURAÇÕES ────────────────────────────────────────────────────────
  const RAG_MATCH_COUNT   = 15   // trechos recuperados antes do filtro
  const RAG_THRESHOLD     = 0.70 // similaridade mínima (0 a 1) — abaixo disso descarta
  const RAG_MIN_RESULTS   = 3    // se menos que isso passar no threshold, aceita os melhores mesmo assim
  const MAX_HISTORICO     = 10   // máximo de turnos do histórico para não estourar contexto

  // ─── BASE LEGAL ESTRUTURADA (fallback + âncora sempre presente) ───────────
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
28% — bebidas alcoólicas, fumo, cigarros e derivados do fumo, operações internas ou importação (art. 41, VIII, RICMS/MS, Decreto nº 9.203/98).
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

## TABELA DE FATOS — LEI Nº 6.439/2025 (vigente a partir de 01/07/2025)
ATENÇÃO: os códigos abaixo substituem os anteriores. Use SEMPRE os códigos novos para fatos ocorridos a partir de 01/07/2025.

### OPERAÇÃO DESACOMPANHADA DE DOCUMENTAÇÃO FISCAL
Cód. Fato 576 
Descrição: entrega, remessa, transporte, recebimento, estocagem, depósito, posse ou propriedade de mercadoria ou bem desacompanhados de documentação fiscal — TRIBUTADAS INTERNAMENTE.
Fundamentação infração: Art. 5º, I, §2º, III; Art. 13, XVII; Art. 14, I, "b"; Art. 45, II; Art. 61; Art. 90, I; Art. 92, Lei 1.810/97; Art. 98, parágrafo único, RICMS (Dec. 9.203/98).
Fundamentação multa: Art. 117, III, "a", item 1; §16, I, "a", Lei 1.810/97.
Multa: 100% do valor do imposto. NÃO permitir redução no termo.
Observação: quando existir exigência do imposto, deve incidir também a multa moratória dos incisos I a VII do art. 119, Lei 1.810/97, sem prejuízo da multa do art. 117, III, "a".
Fato antigo: 532

Cód. Fato 577
Descrição: entrega, remessa, transporte, recebimento, estocagem, depósito, posse ou propriedade de mercadoria ou bem desacompanhados de documentação fiscal — NÃO TRIBUTADAS INTERNAMENTE.
Fundamentação infração: Art. 5º, I, §2º, III; Art. 13, XVII; Art. 14, I, "b"; Art. 45, II; Art. 61; Art. 90, I; Art. 92, Lei 1.810/97; Art. 98, parágrafo único, RICMS (Dec. 9.203/98).
Fundamentação multa: Art. 117, III, "a", item 2; §16, II, "a" e "b"; §17, Lei 1.810/97.
Multa: 5% do valor da operação, não inferior a 20 UFERMS nem superior a 200 UFERMS. Informar somente campo da base de cálculo.
Fato antigo: 533

Cód. Fato 580
Descrição: entrega, remessa, transporte, recebimento, estocagem, depósito, posse ou propriedade de mercadoria ou bem desacompanhados de documentação fiscal — PARCIALMENTE TRIBUTADAS INTERNAMENTE.
Fundamentação infração: Art. 5º, I, §2º, III; Art. 13, XVII; Art. 14, I, "b"; Art. 45, II; Art. 61; Art. 90, I; Art. 92, Lei 1.810/97; Art. 98, parágrafo único, RICMS (Dec. 9.203/98).
Fundamentação multa: Art. 117, III, "a", itens 1 e 2; §16, I, "b", Lei 1.810/97.
Multa: 100% do valor do imposto (parte tributada) + 5% do valor da redução não inferior a 20 UFERMS nem superior a 200 UFERMS. Permitir redução no termo.
Fato antigo: 534

### OPERAÇÃO ACOMPANHADA DE DOC. FISCAL INIDÔNEA — FRAUDE COMPROVADA (art. 93, II)
Cód. Fato 581 — TRIBUTADAS INTERNAMENTE (fato antigo: 511)
Cód. Fato 582 — NÃO TRIBUTADAS INTERNAMENTE (fato antigo: 512)
Cód. Fato 583 — PARCIALMENTE TRIBUTADAS INTERNAMENTE (fato antigo: 513)
Fundamentação infração: Art. 5º, I, §2º, III; Art. 13, XVII; Art. 14, I, "b"; Art. 45, II; Art. 61; Art. 90, I; Art. 92; Art. 93, II, Lei 1.810/97; Art. 98, parágrafo único, RICMS.

### OPERAÇÃO ACOMPANHADA DE DOC. FISCAL INIDÔNEA — TRANSMITENTE FICTÍCIO (art. 93, III)
Cód. Fato 584 — TRIBUTADAS INTERNAMENTE (fato antigo: 514)
Cód. Fato 585 — NÃO TRIBUTADAS INTERNAMENTE (fato antigo: 515)
Cód. Fato 586 — PARCIALMENTE TRIBUTADAS INTERNAMENTE (fato antigo: 516)
Fundamentação infração: Art. 5º, I, §2º, III; Art. 13, XVII; Art. 14, I, "b"; Art. 45, II; Art. 61; Art. 90, I; Art. 92; Art. 93, III, Lei 1.810/97; Art. 98, parágrafo único, RICMS.

### OPERAÇÃO ACOMPANHADA DE DOC. FISCAL INIDÔNEA — DESTINATÁRIO DIVERSO (art. 93, IV)
Cód. Fato 587 — TRIBUTADAS INTERNAMENTE (fato antigo: 517)
Cód. Fato 588 — Enquadramento 179 — NÃO TRIBUTADAS INTERNAMENTE (fato antigo: 518)
Cód. Fato 589 — PARCIALMENTE TRIBUTADAS INTERNAMENTE (fato antigo: 519)
Fundamentação infração: Art. 5º, I, §2º, III; Art. 13, XVII; Art. 14, I, "b"; Art. 45, II; Art. 61; Art. 90, I; Art. 92; Art. 93, IV, Lei 1.810/97; Art. 98, parágrafo único, RICMS.

### OPERAÇÃO ACOMPANHADA DE DOC. FISCAL INIDÔNEA — CANCELAMENTO DA IE (art. 93, V)
Cód. Fato 590 — TRIBUTADAS INTERNAMENTE (fato antigo: 520)
Cód. Fato 591 — NÃO TRIBUTADAS INTERNAMENTE (fato antigo: 521)
Cód. Fato 592 — PARCIALMENTE TRIBUTADAS INTERNAMENTE (fato antigo: 522)
Fundamentação infração: Art. 5º, I, §2º, III; Art. 13, XVII; Art. 14, I, "b"; Art. 45, II; Art. 61; Art. 90, I; Art. 92; Art. 93, V, Lei 1.810/97; Art. 98, parágrafo único, RICMS.

### OPERAÇÃO ACOMPANHADA DE DOC. FISCAL INIDÔNEA — INOBSERVÂNCIA DE OBRIGAÇÃO ACESSÓRIA (art. 93, VI)
Cód. Fato 593 — TRIBUTADAS INTERNAMENTE (fato antigo: 523)
Cód. Fato 594 — NÃO TRIBUTADAS INTERNAMENTE (fato antigo: 524)
Cód. Fato 595 — PARCIALMENTE TRIBUTADAS INTERNAMENTE (fato antigo: 525)
Fundamentação infração: Art. 5º, I, §2º, III; Art. 13, XVII; Art. 14, I, "b"; Art. 45, II; Art. 61; Art. 90, I; Art. 92; Art. 93, VI, Lei 1.810/97; Art. 98, parágrafo único, RICMS.

### MULTA — DOCUMENTAÇÃO FISCAL VENCIDA (art. 93, VII)
Cód. Fato 596 — TRIBUTADAS INTERNAMENTE (fato antigo: 529)
Cód. Fato 597 — NÃO TRIBUTADAS INTERNAMENTE (fato antigo: 530)
Cód. Fato 598 — PARCIALMENTE TRIBUTADAS INTERNAMENTE (fato antigo: 531)
Fundamentação: Art. 5º, I, §2º e §6º; Art. 93, VII e parágrafo único, Lei 1.810/97 c/c Art. 2º, §2º, Anexo XV; Art. 1º e Art. 3º, §1º, Subanexo V ao Anexo XV, RICMS (Dec. 9.203/98).

### TRANSPORTE — CONHECIMENTO DE TRANSPORTE
Cód. Fato 578
Prestação de serviço de transporte acompanhada de doc. fiscal inidônea — Conhecimento de Transporte Inidôneo.
Multa: Art. 117, IV, "b", Lei 1.810/97.

Cód. Fato 579
Falta de emissão do Conhecimento de Transporte Eletrônico — imposto e multa de 10% sobre o valor do serviço.
Multa: Art. 117, III, "c", Lei 1.810/97.

### REGRA GERAL DE MULTAS (Lei 6.439/2025)
Fatos 576, 581, 584, 587, 590, 593, 596 → MULTA 100% DO VALOR DO IMPOSTO.
Fatos 577, 582, 585, 588, 591, 594, 597 → MULTA 5% DO VALOR DA OPERAÇÃO, não inferior a 20 UFERMS nem superior a 200 UFERMS.
Fatos 580, 583, 586, 589, 592, 595, 598 → MULTA 100% DO IMPOSTO (parte tributada) + 5% DO VALOR DA REDUÇÃO.

### COMO ESCOLHER O CÓDIGO CORRETO
1. A mercadoria está DESACOMPANHADA de qualquer documento? → Fatos 576/577/580
2. Há documento, mas é INIDÔNEO? Identificar o inciso do art. 93:
   - Fraude comprovada (inc. II) → 581/582/583
   - Transmitente fictício (inc. III) → 584/585/586
   - Destinatário diverso (inc. IV) → 587/588/589
   - IE cancelada do emitente (inc. V) → 590/591/592
   - Inobservância de obrigação acessória (inc. VI) → 593/594/595
   - Documento vencido (inc. VII) → 596/597/598
3. Dentro de cada grupo, escolher pela tributação:
   - Tributada internamente → primeiro código do grupo (ex: 576, 581, 584...)
   - Não tributada internamente → segundo código (ex: 577, 582, 585...)
   - Parcialmente tributada → terceiro código (ex: 580, 583, 586...)
`

  // ─── RAG — busca híbrida (vetorial + textual) ────────────────────────────
  let contextoRAG = ''
  let ragStatus   = 'desabilitado'

  // Extrai termos de busca textual da mensagem (artigos, parágrafos, palavras-chave)
  function extrairTermosBusca(texto) {
    if (!texto) return []
    const termos = []
    // Artigos: "art. 41", "artigo 93", "art 117"
    const artigoMatches = texto.match(/art(?:igo)?\.?\s*\d+[\w-]*/gi) || []
    termos.push(...artigoMatches)
    // Parágrafos: "§2º", "§ 1"
    const paraMatches = texto.match(/§\s*\d+[ºª°]?/g) || []
    termos.push(...paraMatches)
    // Palavras relevantes longas (mais de 5 chars, exceto stopwords)
    const stopwords = new Set(['como','para','quando','sobre','quais','qual','que','não','sim','uma','uns'])
    const palavras = texto.toLowerCase().split(/\s+/)
      .filter(p => p.length > 5 && !stopwords.has(p))
      .slice(0, 5)
    termos.push(...palavras)
    return [...new Set(termos)].slice(0, 8)
  }

  if (OPENAI_KEY && SUPABASE_URL && SUPABASE_KEY) {
    try {
      const textoConsulta = mensagem || 'análise de documentos fiscais'

      // ── 1. BUSCA VETORIAL (por similaridade semântica) ──────────────────
      const embResp = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: textoConsulta.substring(0, 8000) })
      })

      let trechosVetoriais = []
      if (embResp.ok) {
        const embData = await embResp.json()
        const embedding = embData.data[0].embedding

        const sbResp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/buscar_legislacao`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
          body: JSON.stringify({ query_embedding: embedding, match_count: RAG_MATCH_COUNT })
        })

        if (sbResp.ok) {
          const todos = await sbResp.json()
          if (Array.isArray(todos) && todos.length > 0) {
            trechosVetoriais = todos.filter(t => t.similarity >= RAG_THRESHOLD)
            if (trechosVetoriais.length < RAG_MIN_RESULTS) {
              trechosVetoriais = todos.sort((a, b) => b.similarity - a.similarity).slice(0, RAG_MIN_RESULTS)
            }
          }
        }
      }

      // ── 2. BUSCA TEXTUAL (por artigo/palavra-chave exata) ───────────────
      let trechosTextuais = []
      const termos = extrairTermosBusca(textoConsulta)

      if (termos.length > 0) {
        const textResp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/buscar_legislacao_texto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
          body: JSON.stringify({ termos, max_results: 10 })
        })
        if (textResp.ok) {
          const textData = await textResp.json()
          if (Array.isArray(textData)) {
            trechosTextuais = textData.map(t => ({ ...t, similarity: 0.85, fonte: 'textual' }))
          }
        }
      }

      // ── 3. COMBINAR E DEDUPLICAR ────────────────────────────────────────
      const vistos = new Set()
      const trechosCombinados = []

      // Textuais primeiro — são mais precisos para artigos específicos
      for (const t of trechosTextuais) {
        const chave = t.trecho?.substring(0, 80)
        if (chave && !vistos.has(chave)) {
          vistos.add(chave)
          trechosCombinados.push({ ...t, fonte: 'textual' })
        }
      }
      // Depois os vetoriais
      for (const t of trechosVetoriais) {
        const chave = t.trecho?.substring(0, 80)
        if (chave && !vistos.has(chave)) {
          vistos.add(chave)
          trechosCombinados.push({ ...t, fonte: 'vetorial' })
        }
      }

      if (trechosCombinados.length === 0) {
        ragStatus = 'sem_resultados'
        contextoRAG = `\n\n## ⚠️ AVISO INTERNO — NENHUM TRECHO ENCONTRADO NA BASE\n`
          + `A busca híbrida (vetorial + textual) não retornou resultados para esta consulta. `
          + `Informe ao fiscal: "Não encontrei esse dispositivo na base indexada. Consulte o PDF da legislação para confirmação."`
      } else {
        ragStatus = `ok:${trechosCombinados.length}_trechos(${trechosTextuais.length}txt+${trechosVetoriais.length}vec)`
        contextoRAG = '\n\n## LEGISLAÇÃO RECUPERADA DA BASE\n'
          + '(Fonte primária. Cite apenas o que estiver aqui ou na BASE_LEI acima.)\n\n'
          + trechosCombinados.slice(0, 12).map((t, i) => {
              const label = t.fonte === 'textual' ? 'busca exata' : `similaridade ${(t.similarity * 100).toFixed(0)}%`
              return `[TRECHO ${i + 1} — ${t.nome_documento} — ${label}]\n${t.trecho}`
            }).join('\n\n---\n\n')
      }

    } catch (e) {
      console.error('RAG falhou:', e.message)
      ragStatus = `erro:${e.message}`
      contextoRAG = `\n\n## ⚠️ AVISO INTERNO — BASE VETORIAL INDISPONÍVEL\n`
        + `Erro: ${e.message}. Responda com a BASE_LEI. Sinalize ao fiscal que a base está indisponível nesta consulta.`
    }
  } else {
    contextoRAG = `\n\n## ⚠️ AVISO INTERNO — RAG NÃO CONFIGURADO\n`
      + `Variáveis ausentes. Responda apenas com a BASE_LEI e sinalize ao fiscal.`
  }

  // ─── CORTAR HISTÓRICO PARA NÃO ESTOURAR CONTEXTO ─────────────────────────
  // Mantém os últimos N turnos (cada turno = 1 user + 1 assistant)
  // Filtra mensagens com conteúdo vazio ou nulo para evitar erro da API
  const historicoTratado = (Array.isArray(historico) ? historico : [])
    .slice(-(MAX_HISTORICO * 2))
    .filter(msg => {
      if (!msg || !msg.role) return false
      if (typeof msg.content === 'string') return msg.content.trim() !== ''
      if (Array.isArray(msg.content)) return msg.content.length > 0
      return false
    })

  // ─── SYSTEM PROMPT ────────────────────────────────────────────────────────
  const SYSTEM_PROMPT = `Você é o ORÁCULO FISCAL MS — especialista jurídico-tributário com 20 anos de experiência na fiscalização volante da SEFAZ-MS. Domina a Lei nº 1.810/97, o RICMS/MS (Decreto nº 9.203/98) e toda a legislação complementar do Estado de Mato Grosso do Sul.

════════════════════════════════════════
REGRA ABSOLUTA SOBRE DISPOSITIVOS LEGAIS
════════════════════════════════════════
Você SOMENTE pode citar artigos, incisos, parágrafos e alíneas que:
  a) constem nos TRECHOS RECUPERADOS DA BASE VETORIAL abaixo, OU
  b) estejam expressamente listados na BASE_LEI hardcoded abaixo.

Se um dispositivo não estiver em nenhuma dessas duas fontes, você NÃO o cita.
Em vez disso, escreva: "dispositivo aplicável — verificar na legislação vigente".
Inventar ou presumir artigos é o erro mais grave possível neste sistema.

════════════════════════════════════════
IDENTIDADE E POSTURA
════════════════════════════════════════
Você é uma autoridade jurídica, não um assistente que busca aprovação.

Quando você conclui um enquadramento com base na legislação, ele é sustentado com firmeza. Você só reconsidera diante de:
  - FATO NOVO que você desconhecia, ou
  - ARGUMENTO LEGAL concreto com citação de dispositivo não considerado.

Discordância sem fundamento legal NÃO é motivo para reconsiderar. Nesse caso, mantenha o enquadramento, reforce com mais detalhe e pergunte: "Qual o fundamento legal da sua discordância? Se houver fato ou dispositivo que não considerei, apresente para que eu reavalie."

NUNCA faça, após discordância sem fundamento:
  - Abandonar enquadramento correto
  - Sugerir regime especial inexistente na lei
  - Ceder para validar a visão do fiscal sem base legal

A capitulação fácil é o erro mais grave — um enquadramento errado pode ser anulado em impugnação e prejudica o crédito tributário do Estado.

════════════════════════════════════════
MISSÃO
════════════════════════════════════════
1. Detectar o que o fiscal precisa e agir no modo certo — sem burocracia desnecessária
2. No modo consulta: analisar, enquadrar, ensinar, defender o crédito tributário
3. No modo redação: elaborar a matéria tributária direto, sem validações, sem perguntas extras
4. Citar apenas dispositivos legais das fontes autorizadas (base vetorial ou BASE_LEI)

════════════════════════════════════════
DETECÇÃO AUTOMÁTICA DE MODO
════════════════════════════════════════
Ao receber a primeira mensagem do fiscal, identifique o modo ANTES de responder:

MODO REDAÇÃO — ative quando a mensagem contiver dados concretos da abordagem:
Sinais: data, hora, local, IE ou CNPJ, mercadoria identificada, placa, condutor, valores.
Exemplo: "mercadoria sem nota, IE 28.341.089-2, CNPJ 08.092.246/0001-42, rua X, dia Y, hora Z"
Ação: elabore a matéria tributária DIRETAMENTE. Não pergunte, não valide, não peça confirmação.
Se algum dado menor estiver faltando (ex: valor exato), use "a apurar" ou "conforme arbitramento" e sinalize ao final em UMA linha: "Dado ausente: [o que falta] — ajuste antes de inserir no sistema."

MODO CONSULTA — ative quando a mensagem descrever uma situação sem dados de abordagem:
Sinais: dúvida sobre enquadramento, descrição de cenário, pergunta sobre legislação, "o que fazer", "como proceder".
Exemplo: "o condutor disse que a mercadoria é dele, como enquadro?"
Ação: analise, enquadre, ensine. Faça perguntas se necessário. Ao concluir, pergunte se quer o documento.

EM CASO DE DÚVIDA: prefira o MODO REDAÇÃO se houver dados suficientes para redigir.

════════════════════════════════════════
MODO REDAÇÃO — REGRAS DE EXECUÇÃO
════════════════════════════════════════
Elabore a matéria tributária com os dados fornecidos. Estrutura obrigatória em 5 parágrafos corridos:

1. ABORDAGEM: data, hora, local exato, veículo (placa), condutor (nome/CPF), empresa transportadora
2. DOCUMENTAÇÃO: NF apresentada (número, série, emitente, destinatário) ou ausência total de documento
3. MERCADORIA: descrição, quantidade, valor declarado ou arbitrado
4. IRREGULARIDADE + ENQUADRAMENTO: o que está errado + artigo aplicável + sujeito passivo responsável
5. CRÉDITO TRIBUTÁRIO: BC, alíquota, ICMS, multa (art. 117), total e reduções do art. 118

Regras de redação:
- Português formal, sem caixa alta excessiva, sem subtítulos, sem negrito — texto corrido
- Datas e horas SEMPRE no formato: "24 de abril de 2026, às 14h35min" — nunca por extenso ("vinte e quatro de abril")
- Cada informação aparece uma única vez
- Cite apenas artigos das fontes autorizadas (base vetorial ou BASE_LEI)
- Delimite a matéria com:
    ===MATERIA_INICIO===
    [texto]
    ===MATERIA_FIM===
- Se dado estiver ausente, use "a apurar" no corpo e liste os ausentes em UMA linha após o delimitador final

════════════════════════════════════════
MODO CONSULTA — REGRAS DE EXECUÇÃO
════════════════════════════════════════
PROIBIÇÃO ABSOLUTA DE PRESUMIR FATOS:
- Nunca presuma origem, destino ou trajeto sem que o fiscal informe expressamente
- Nunca enquadre infração de MDF-e sem confirmar se o transporte é intermunicipal ou interestadual
- Nunca presuma natureza da operação (interna, interestadual, importação) sem informação expressa
- Se dado essencial estiver faltando, faça UMA pergunta objetiva — nunca interrogatório

VALIDAÇÃO DE PLACA:
Padrão antigo: 3 letras + 4 números (ex: ABC1234)
Padrão Mercosul: 3 letras + 1 número + 1 letra + 2 números (ex: ABC1D23)
NUNCA rejeite placa Mercosul. Questione só se não se encaixar em nenhum dos dois padrões.

SEQUÊNCIA DE ANÁLISE:
  a) Infração e enquadramento legal (art. 93, MDF-e, ST, etc.)
  b) Sujeito passivo responsável
  c) IE no MS → TVF ou TA e em nome de quem
  d) Benefício fiscal aplicável (ST, redução de BC, isenção)
  e) Base de cálculo (NF, arbitramento, MVA, PMPF)
  f) Alíquota correta
  g) ICMS, multa, crédito total
  h) Reduções do art. 118

Ao concluir: apresente com firmeza. Pergunte se quer o documento — e se sim, passe para MODO REDAÇÃO com os dados já discutidos, sem pedir nada que já foi informado.

Se discordância COM argumento legal → analise com seriedade.
Se discordância SEM argumento legal → mantenha, reforce, peça o fundamento legal.

════════════════════════════════════════
FORMATO DAS RESPOSTAS
════════════════════════════════════════
Modo consulta: parágrafos e tópicos com "-". Completo, didático, firme.
Modo redação: direto ao documento. Nada antes do ===MATERIA_INICIO=== exceto o dado ausente se houver.
Nunca use listas numeradas fora da matéria tributária.

════════════════════════════════════════
BASE DE CONHECIMENTO JURÍDICO (SEMPRE DISPONÍVEL)
════════════════════════════════════════
${BASE_LEI}

════════════════════════════════════════
LEGISLAÇÃO DA BASE VETORIAL (FONTE PRIMÁRIA PARA ESTE CASO)
════════════════════════════════════════
${contextoRAG}

════════════════════════════════════════
REGRAS FINAIS INVIOLÁVEIS
════════════════════════════════════════
- NUNCA invente dispositivos legais
- NUNCA ceda enquadramento correto por pressão sem fundamento legal
- NUNCA faça perguntas desnecessárias antes de analisar
- Mantenha o contexto de toda a conversa
- Quando o produto tiver alíquota ou BC diferenciada (GLP, ovos, cesta básica, ST, FECOMP), aplique o tratamento correto
- Se a base vetorial estiver indisponível, sinalize ao fiscal`

  // ─── MONTAR MENSAGEM DO USUÁRIO (com ou sem imagens) ────────────────────
  let conteudoUsuario
  if (imagens && imagens.length > 0) {
    // Mensagem multimodal: busca cada arquivo pela URL assinada e monta o conteúdo
    const partes = []
    for (const img of imagens) {
      try {
        const fileResp = await fetch(img.signedUrl)
        if (!fileResp.ok) throw new Error(`Falha ao buscar arquivo: ${fileResp.status}`)
        const arrayBuffer = await fileResp.arrayBuffer()
        const base64 = Buffer.from(arrayBuffer).toString('base64')

        partes.push({
          type: 'image',
          source: { type: 'base64', media_type: img.mediaType || 'image/jpeg', data: base64 }
        })
      } catch (e) {
        console.error('Erro ao buscar arquivo do Storage:', e.message)
      }
    }
    if (mensagem && mensagem.trim()) {
      partes.push({ type: 'text', text: mensagem })
    } else {
      partes.push({ type: 'text', text: 'Analise os documentos anexados, extraia todas as informações relevantes para a fiscalização e me informe o que ainda precisa ser complementado para elaborar o TVF ou TA.' })
    }
    conteudoUsuario = partes
  } else {
    conteudoUsuario = mensagem
  }

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
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages: [
          ...historicoTratado,
          { role: 'user', content: conteudoUsuario }
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
      // Metadados úteis para debug — remova em produção se quiser
      _debug: {
        ragStatus,
        modelo: 'claude-sonnet-4-6',
        inputTokens: antData.usage?.input_tokens,
        outputTokens: antData.usage?.output_tokens,
        historicoTurnos: historicoTratado.length / 2
      }
    })

  } catch (err) {
    console.error('Erro no agente:', err)
    return res.status(500).json({ error: err.message })
  }
}
