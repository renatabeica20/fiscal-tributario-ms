# Fiscal Tributário Estadual - MS

Agente especialista em legislação tributária do Estado de Mato Grosso do Sul, desenvolvido para auxiliar Fiscais Tributários Estaduais da SEFAZ-MS na fiscalização volante de mercadorias em trânsito.

## Funcionalidades

- Enquadramento jurídico de casos de fiscalização
- Redação de TVF, TA e ALIM no padrão SEFAZ-MS
- Cálculo de crédito tributário (ICMS + multas)
- Consultas sobre Lei 1.810/97 e RICMS/MS (Decreto 9.203/98)
- Busca vetorial em toda a legislação indexada (RAG)

## Variáveis de Ambiente (configurar no Vercel)

```
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://...supabase.co
SUPABASE_KEY=sb_secret_...
```

## Stack

- Next.js 14
- Anthropic Claude (geração de texto)
- OpenAI text-embedding-3-small (embeddings)
- Supabase + pgvector (banco vetorial da legislação)
- Vercel (hospedagem)
