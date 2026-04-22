# Settings — Parâmetros Editáveis

Documento vivo. Status por item: `[ ]` aberto · `[x]` aprovado · `[~]` parcial · `[-]` descartado. Marca o que aprovar e eu aplico.

Arquivo-alvo: [settings-screen.tsx](../src/features/almox/screens/settings-screen.tsx)
Lógica que lê os parâmetros: [data.ts](../src/features/almox/data.ts)
Persistência: nova tabela `almox.configuracao_sistema` (a criar).

---

## 0. Decisões já tomadas

- [x] **Escopo = Global** (por enquanto). Um único set de parâmetros vale para todos os hospitais. Pode virar "Global + override por hospital" depois — a tabela já nasce preparada (coluna `codigo_unidade` nullable, `NULL` = global).
- [x] **Bloco de e-mail** (config SMTP, auto-send, preview de alertas, dica SMTP) — **removido** da tela em `settings-screen.tsx`.
- [x] **Permissão** — qualquer usuário autenticado pode editar por enquanto. Gate por papel fica para fase 2.
- [ ] **Parâmetros técnicos (Grupo 2)** — pendente decidir se entram no painel ou ficam hardcoded. Recomendação: **manter hardcoded** (são tuning knobs do algoritmo, não regra de negócio).

---

## 1. Diagnóstico (o que hoje está fixo no código)

Tudo que a tela de Settings deveria regular está hardcoded em [data.ts](../src/features/almox/data.ts). Hoje a tela só configura SMTP (sem persistência real).

### Grupo 1 — Regras de negócio (candidatas a painel)

| # | Parâmetro | Valor atual | Origem |
|---|-----------|-------------|--------|
| 1 | URGENTE: estoque zerado | `estoque_atual <= 0` | [data.ts:115](../src/features/almox/data.ts#L115) |
| 2 | CRÍTICO (dias ≤) | `7` | [data.ts:116](../src/features/almox/data.ts#L116) |
| 3 | ALTO (dias ≤) | `15` | [data.ts:117](../src/features/almox/data.ts#L117) |
| 4 | MÉDIO (dias ≤) | `30` | [data.ts:118](../src/features/almox/data.ts#L118) |
| 5 | BAIXO (dias ≤) | `60` | [data.ts:119](../src/features/almox/data.ts#L119) |
| 6 | RISCO ALTO (dias ≤) | `10` | [data.ts:124](../src/features/almox/data.ts#L124) |
| 7 | RISCO MÉDIO (dias ≤) | `25` | [data.ts:125](../src/features/almox/data.ts#L125) |
| 8 | Prioridade URGENTE (dias ≤) | `7` | [data.ts:130](../src/features/almox/data.ts#L130) |
| 9 | Prioridade ALTA (dias ≤) | `15` | [data.ts:131](../src/features/almox/data.ts#L131) |
| 10 | Ação COMPRAR (dias ≤) — não-HMSA | `15` | [data.ts:152](../src/features/almox/data.ts#L152) |
| 11 | Ação PODE EMPRESTAR (dias ≥) | `120` | [data.ts:154, 255, 387, 495](../src/features/almox/data.ts#L154) |
| 12 | Doador seguro para transferência (dias >) | `100` | [data.ts:233, 235](../src/features/almox/data.ts#L233) |
| 13 | Alvo de transferência (× CMM mensal) | `0.75` | [data.ts:230](../src/features/almox/data.ts#L230) |
| 14 | Meses de compra sugerida (× CMM mensal) | `2` | [data.ts:261, 394, 428](../src/features/almox/data.ts#L261) |
| 15 | Idle / acima da faixa (dias ≥) | `120` | [data.ts:387](../src/features/almox/data.ts#L387) |
| 16 | ~~Níveis alvo de e-mail~~ | `URGENTE + CRÍTICO + ALTO` | [data.ts:435](../src/features/almox/data.ts#L435) — **fora de escopo** |

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
| S1 | SMTP (host/port/user/pass) | Tem UI, **não persiste** — `useState` local |
| S2 | E-mail destino | Tem UI, **não persiste** |
| S3 | `auto_send_on_sync` | Tem toggle, **não persiste** |
| S4 | Filtro de categoria (material hospitalar/farmacológico) | Vive no `almox-provider` (contexto runtime) — **não é config**, é seleção de tela. Não entra aqui. |
| S5 | Blacklist de produtos | Tela própria (`blacklist-screen`). Não entra aqui. |

---

## 2. Plano de implementação

### 2.1 Banco — tabela de configuração

- [ ] **2.1.1 Criar migration** `supabase/migrations/YYYYMMDDHHMMSS_criar_configuracao_sistema.sql`
  ```sql
  create table almox.configuracao_sistema (
    id uuid primary key default gen_random_uuid(),
    codigo_unidade text null,                      -- NULL = global; preparado p/ override por hospital
    chave text not null,
    valor jsonb not null,
    atualizado_em timestamptz not null default now(),
    atualizado_por uuid null references auth.users(id),
    unique (codigo_unidade, chave)
  );
  ```
  Singleton lógico: apenas linhas com `codigo_unidade IS NULL` nesta fase.

- [ ] **2.1.2 Seed com valores atuais** para não quebrar nada no primeiro deploy (ver tabela Grupo 1).

- [ ] **2.1.3 RLS**: leitura liberada para usuários autenticados; escrita só via service_role (API route).

### 2.2 Back — API routes

- [ ] **2.2.1 `GET /api/configuracao+api.ts`** — retorna objeto `{ criticoDias: 7, altoDias: 15, ... }` com fallback para defaults.
- [ ] **2.2.2 `PUT /api/configuracao+api.ts`** — aceita patch parcial, valida tipos/ranges, salva e devolve a config resultante.
- [ ] **2.2.3 Validação server-side** das ordens: `critico ≤ alto ≤ médio ≤ baixo`, `riscoAlto ≤ riscoMédio`, `prioridadeUrg ≤ prioridadeAlta`, `podeEmprestar ≥ doadorSeguro`, `0 ≤ alvoTransferencia ≤ 1`, `mesesCompra > 0`.

### 2.3 Client — leitura na pipeline atual

- [ ] **2.3.1 Hook** `useConfiguracaoSistema()` dentro do `almox-provider` — busca `/api/configuracao` no mount, cacheia no contexto.
- [ ] **2.3.2 Refatorar [data.ts](../src/features/almox/data.ts)** para receber `config` como parâmetro (não ler global). Trocar constantes pelas chaves equivalentes. As helpers `getLevel`, `getRuptureRisk`, `getPriority`, `baseActionForHospital`, `buildEnrichedHmsaProducts`, `buildEmailPreviewItems` viram fechaduras que capturam `config`.
- [ ] **2.3.3 Invalidar cache** (`cache.ts`) quando config mudar — emitir evento `almox:config-updated` e re-derivar.

### 2.4 UI — nova seção em Settings

Ordem proposta na tela, de cima para baixo:

- [ ] **2.4.1 Bloco "Faixas de cobertura"** — 4 inputs numéricos (Crítico ≤, Alto ≤, Médio ≤, Baixo ≤) com preview inline mostrando a tabela resultante ("Crítico: 1-7 · Alto: 8-15 ..."). Validação cruzada em tempo real.
- [ ] **2.4.2 Bloco "Risco e prioridade"** — 2 inputs Risco (Alto ≤, Médio ≤) + 2 inputs Prioridade (Urgente ≤, Alta ≤).
- [ ] **2.4.3 Bloco "Regras de ação"** — 5 campos: Comprar ≤, Pode emprestar ≥, Doador seguro >, Alvo de transferência (× CMM), Meses de compra (× CMM), Idle ≥.
- [ ] **2.4.4 Estado local + dirty flag + botão "Salvar alterações"** no rodapé (disabled se não houver mudança ou se validação falhar). Toast de sucesso. Confirmação antes de salvar mudança de banda ("isso vai reclassificar X produtos — continuar?").
- [ ] **2.4.5 Botão "Restaurar padrões"** — reseta para os valores seed.
- [x] **2.4.6 Remover blocos SMTP/e-mail/preview/dica** da Settings — feito em [settings-screen.tsx](../src/features/almox/screens/settings-screen.tsx). A tela ficou com header + banners + placeholder "Parâmetros editáveis" aguardando os blocos do item 2.4.

### 2.5 Segurança / guard-rails

- [x] **2.5.1 Permissão** — qualquer usuário autenticado edita. Gate por papel fica para fase 2.
- [ ] **2.5.2 Audit trail** — campo `atualizado_por` + `atualizado_em` já preenchidos. Histórico completo fica para fase 2.

---

## 3. Out-of-scope (registrado para não perder)

- **Alertas por e-mail / SMTP / níveis alvo do preview** — removidos da Settings. Campos e dataset (`dataset.emailPreviewItems`, `emailConfig`) continuam no provider e em `data.ts`; limpá-los fica para quando a decisão de descontinuar de vez estiver firme.
- **Override por hospital** — tabela já suporta, UI não.
- **Grupo 2 técnico** — knobs de chart/score/top-N permanecem no código.
- **Histórico de mudanças de configuração** — fora da fase 1.

---

## 4. Perguntas em aberto

- [ ] Grupo 2 — fica hardcoded mesmo? (recomendação: sim)
