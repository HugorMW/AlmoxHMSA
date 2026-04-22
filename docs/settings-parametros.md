# Settings — Parâmetros Editáveis

Documento vivo. Status por item: `[ ]` aberto · `[x]` aprovado · `[~]` parcial · `[-]` descartado. Marca o que aprovar e eu aplico.

Arquivo-alvo: [settings-screen.tsx](../src/features/almox/screens/settings-screen.tsx)
Lógica que lê os parâmetros: [data.ts](../src/features/almox/data.ts)
Persistência: nova tabela `almox.configuracao_sistema` em [20260422093000_criar_configuracao_sistema.sql](../supabase/migrations/20260422093000_criar_configuracao_sistema.sql).

---

## 0. Decisões já tomadas

- [x] **Escopo = Global** (por enquanto). Um único set de parâmetros vale para todos os hospitais. Pode virar "Global + override por hospital" depois — a tabela já nasce preparada (coluna `codigo_unidade` nullable, `NULL` = global).
- [x] **Bloco de e-mail** (config SMTP, auto-send, preview de alertas, dica SMTP) — **removido** da tela em `settings-screen.tsx`.
- [x] **Permissão** — qualquer usuário autenticado pode editar por enquanto. Gate por papel fica para fase 2.
- [x] **Parâmetros técnicos (Grupo 2)** — ficam hardcoded. São tuning knobs do algoritmo, não regra de negócio.
- [x] **Regra de compra** — usar apenas "Comprar quando faltar até". Os campos separados de prazo de chegada e folga foram removidos da configuração ativa para evitar dúvida operacional.

---

## 1. Diagnóstico (o que hoje está fixo no código)

As regras abaixo saíram do hardcode de [data.ts](../src/features/almox/data.ts) e agora passam por [configuracao.ts](../src/features/almox/configuracao.ts), API e tabela `almox.configuracao_sistema`.

### Grupo 1 — Regras de negócio (candidatas a painel)

| # | Parâmetro | Valor atual | Origem |
|---|-----------|-------------|--------|
| 1 | URGENTE: estoque zerado | `estoque_atual <= 0` | permanece fixo em [data.ts](../src/features/almox/data.ts) |
| 2 | CRÍTICO (dias ≤) | `criticoDias` | [configuracao.ts](../src/features/almox/configuracao.ts) |
| 3 | ALTO (dias ≤) | `altoDias` | [configuracao.ts](../src/features/almox/configuracao.ts) |
| 4 | MÉDIO (dias ≤) | `medioDias` | [configuracao.ts](../src/features/almox/configuracao.ts) |
| 5 | BAIXO (dias ≤) | `baixoDias` | [configuracao.ts](../src/features/almox/configuracao.ts) |
| 6 | RISCO ALTO (dias ≤) | `riscoAltoDias` | [configuracao.ts](../src/features/almox/configuracao.ts) |
| 7 | RISCO MÉDIO (dias ≤) | `riscoMedioDias` | [configuracao.ts](../src/features/almox/configuracao.ts) |
| 8 | Prioridade URGENTE (dias ≤) | `prioridadeUrgenteDias` | [configuracao.ts](../src/features/almox/configuracao.ts) |
| 9 | Prioridade ALTA (dias ≤) | `prioridadeAltaDias` | [configuracao.ts](../src/features/almox/configuracao.ts) |
| 10 | Ação COMPRAR (dias ≤) | `comprarDias` | [configuracao.ts](../src/features/almox/configuracao.ts) |
| 11 | Ação PODE EMPRESTAR (dias ≥) | `podeEmprestarDias` | [configuracao.ts](../src/features/almox/configuracao.ts) |
| 12 | Hospital que empresta precisa ter mais de | `doadorSeguroDias` | [configuracao.ts](../src/features/almox/configuracao.ts) |
| 13 | Hospital que empresta deve ficar com pelo menos | `pisoDoadorAposEmprestimoDias` | [configuracao.ts](../src/features/almox/configuracao.ts) |
| 14 | Quanto o HMSA deve pegar emprestado | `alvoTransferenciaCmm` | [configuracao.ts](../src/features/almox/configuracao.ts) |
| 15 | Quantidade sugerida para compra | `mesesCompraSugerida` | [configuracao.ts](../src/features/almox/configuracao.ts) |
| 16 | Ocultar itens com consumo mensal menor que 1 | `excluirCmmMenorQueUm` | [blacklist-screen.tsx](../src/features/almox/screens/blacklist-screen.tsx) |
| 17 | ~~Níveis alvo de e-mail~~ | `URGENTE + CRÍTICO + ALTO` | [data.ts](../src/features/almox/data.ts) — **fora de escopo** |

### Grupo 2 — Técnicos (recomendação: ficar hardcoded)

| # | Parâmetro | Valor | Origem |
|---|-----------|-------|--------|
| T1 | Top-10 críticos | `10` | [data.ts:318](../src/features/almox/data.ts#L318) |
| T2 | Top-N preview e-mail | `5` | [data.ts:437](../src/features/almox/data.ts#L437) |
| T3 | Bandas do gráfico (ranges) | 0-7 / 8-15 / 16-30 / 31-60 / 60+ | [data.ts (chart_data)](../src/features/almox/data.ts) |
| T4 | Peso score transferência | `45/30/15/10` + bônus ruptura `10/6/4` | [data.ts:239-247](../src/features/almox/data.ts#L239) |
| T5 | Corte classificação score | `≥80` Alta · `≥60` Viável · resto Atenção | [data.ts:248](../src/features/almox/data.ts#L248) |
| T6 | Clamp suficiência | `[0, 365]` dias | [data.ts:143](../src/features/almox/data.ts#L143) |

### Grupo 3 — Já parcialmente existentes em Settings

| # | Item | Estado atual |
|---|------|--------------|
| S1 | SMTP (host/port/user/pass) | Removido da UI. Campos legados continuam fora de escopo. |
| S2 | E-mail destino | Removido da UI. |
| S3 | `auto_send_on_sync` | Removido da UI. |
| S4 | Filtro de categoria (material hospitalar/farmacológico) | Vive no `almox-provider` (contexto runtime) — **não é config**, é seleção de tela. Não entra aqui. |
| S5 | Exclusões manuais e automáticas | Tela própria (`blacklist-screen`). Inclui produtos bloqueados por código e filtro de consumo mensal menor que 1. |

---

## 2. Plano de implementação

### 2.1 Banco — tabela de configuração

- [x] **2.1.1 Criar migration** `supabase/migrations/20260422093000_criar_configuracao_sistema.sql`
  ```sql
  create table almox.configuracao_sistema (
    id uuid primary key default gen_random_uuid(),
    codigo_unidade text null,                      -- NULL = global; preparado p/ override por hospital
    chave text not null,
    valor jsonb not null,
    atualizado_em timestamptz not null default now(),
    atualizado_por text null
  );
  ```
  Singleton lógico: apenas linhas com `codigo_unidade IS NULL` nesta fase. A implementação usa índices únicos parciais para tratar `NULL` corretamente e `atualizado_por text` porque a sessão atual do app é o usuário SISCORE, não Supabase Auth.

- [x] **2.1.2 Seed com valores atuais** para não quebrar nada no primeiro deploy (ver tabela Grupo 1). As chaves adicionadas depois entram também pela migration [20260422103000_adicionar_configuracoes_operacionais.sql](../supabase/migrations/20260422103000_adicionar_configuracoes_operacionais.sql).

- [x] **2.1.3 RLS**: leitura liberada para usuários autenticados; escrita só via service_role (API route).

### 2.2 Back — API routes

- [x] **2.2.1 `GET /api/configuracao+api.ts`** — retorna objeto `{ criticoDias: 7, altoDias: 15, ... }` com fallback para defaults.
- [x] **2.2.2 `PUT /api/configuracao+api.ts`** — aceita patch parcial, valida tipos/ranges, salva e devolve a config resultante.
- [x] **2.2.3 Validação server-side** das ordens: `critico ≤ alto ≤ médio ≤ baixo`, `riscoAlto ≤ riscoMédio`, `prioridadeUrg ≤ prioridadeAlta`, `podeEmprestar ≥ mínimo para emprestar`, `0 ≤ quanto o HMSA deve pegar emprestado ≤ 2 meses`, `quantidade de compra > 0`.

### 2.3 Client — leitura na pipeline atual

- [x] **2.3.1 Configuração no `almox-provider`** — busca `/api/configuracao` no mount, guarda no contexto e expõe `refreshSystemConfig` / `saveSystemConfig`.
- [x] **2.3.2 Refatorar [data.ts](../src/features/almox/data.ts)** para receber `config` como parâmetro (não ler global). Trocar constantes pelas chaves equivalentes.
- [x] **2.3.3 Invalidar cache** (`cache.ts`) quando config mudar — emite `almox:config-updated`, remove cache local da base e re-deriva via estado do provider.

### 2.4 UI — nova seção em Settings

Ordem proposta na tela, de cima para baixo:

- [x] **2.4.1 Bloco "Faixas de cobertura"** — 4 inputs numéricos (Crítico ≤, Alto ≤, Médio ≤, Baixo ≤) com preview inline mostrando a tabela resultante ("Crítico: 1-7 · Alto: 8-15 ..."). Validação cruzada em tempo real.
- [x] **2.4.2 Bloco "Risco e prioridade"** — 2 inputs Risco (Alto ≤, Médio ≤) + 2 inputs Prioridade (Urgente ≤, Alta ≤).
- [x] **2.4.3 Bloco "Regras de ação"** — dividido em grupos internos: Compra e Empréstimos. Em Empréstimos, subgrupos: Para o HMSA e Estoque com folga. Campos: Comprar quando faltar até, Pode emprestar quando tiver, Hospital que empresta precisa ter mais de, Hospital que empresta deve ficar com pelo menos, Quanto o HMSA deve pegar emprestado, Quantidade sugerida para compra.
- [x] **2.4.3.1 Remover parâmetro "Estoque alto a partir de"** — o painel "Acima da faixa" agora usa o mesmo limite de **Pode emprestar quando tiver**.
- [x] **2.4.4 Estado local + dirty flag + botão "Salvar alterações"** no rodapé (disabled se não houver mudança ou se validação falhar). Feedback temporário de sucesso. Confirmação antes de salvar mudança de banda.
- [x] **2.4.5 Botão "Restaurar padrões"** — reseta o formulário para os valores seed; o usuário ainda precisa salvar para persistir.
- [x] **2.4.6 Remover blocos SMTP/e-mail/preview/dica** da Settings — feito em [settings-screen.tsx](../src/features/almox/screens/settings-screen.tsx). A tela ficou com header + banners + placeholder "Parâmetros editáveis" aguardando os blocos do item 2.4.
- [x] **2.4.7 Bloco "Filtros da base"** — removido da Settings. O toggle para ocultar itens com consumo mensal menor que 1 foi movido para a tela `blacklist-screen.tsx`, junto das demais exclusões.

### 2.5 Segurança / guard-rails

- [x] **2.5.1 Permissão** — qualquer usuário autenticado edita. Gate por papel fica para fase 2.
- [x] **2.5.2 Audit trail** — campo `atualizado_por` + `atualizado_em` já preenchidos. Histórico completo fica para fase 2.

---

## 3. Out-of-scope (registrado para não perder)

- **Alertas por e-mail / SMTP / níveis alvo do preview** — removidos da Settings. Campos e dataset (`dataset.emailPreviewItems`, `emailConfig`) continuam no provider e em `data.ts`; limpá-los fica para quando a decisão de descontinuar de vez estiver firme.
- **Override por hospital** — tabela já suporta, UI não.
- **Grupo 2 técnico** — knobs de chart/score/top-N permanecem no código.
- **Histórico de mudanças de configuração** — fora da fase 1.

## 3.1 Ideias registradas para depois

- **Estoque mínimo em unidades** — marcar urgente antes de zerar quando `estoque_atual <= estoqueMinimoUnidades`.
- **Quantidade mínima para transferência** — evitar sugerir remanejamentos muito pequenos.
- **Compra mínima por item** — garantir quantidade mínima quando a sugestão por CMM ficar muito baixa.
- **Compra máxima por item** — limitar sugestões exageradas quando o CMM vier distorcido.
- **CMM mínimo para cálculo** — tratar CMM muito baixo como análise manual em vez de cálculo automático.
- **Dias sem entrada para alerta** — destacar itens sem entrada recente mesmo quando a suficiência ainda parece confortável.
- **Estoque parado por tempo** — combinar suficiência alta com última entrada/movimentação antiga.
- **Itens que nunca podem emprestar** — produto continua visível, mas nunca entra como doador.
- **Itens críticos sempre monitorados** — whitelist de produtos sensíveis que aparecem em acompanhamento mesmo com boa suficiência.
- **Notificações** — destinatários, níveis que disparam alerta e frequência de envio.

---

## 4. Perguntas em aberto

- [x] Grupo 2 — fica hardcoded mesmo.
