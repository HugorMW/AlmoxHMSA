# Tela de Desenvolvedor — Monitorar Uso do Supabase Free

Documento vivo. Status por item: `[ ]` aberto · `[x]` aprovado · `[~]` parcial · `[-]` descartado.

Objetivo: criar uma tela visível apenas para `hugorwagemacher` que mostra, em tempo real, o quanto o projeto está consumindo dos limites do **Supabase Free Plan** — para detectar cedo quando estamos perto de bater 500 MB de banco, 5 GB de egress ou filas de realtime.

Referências:
- [supabase-free-plan-impactos.md](./supabase-free-plan-impactos.md) — limites oficiais do Free Plan
- [slqEditor.md](./slqEditor.md) — exemplo do tipo de diagnóstico que a tela precisa sustentar
- [settings-parametros.md](./settings-parametros.md) — precedente de bloco "avançado" liberado só para `hugorwagemacher`

---

## 0. Decisões já tomadas

- [x] **Visibilidade** — tela só aparece para `session.usuario === 'hugorwagemacher'`. Mesmo gate dos parâmetros avançados.
- [x] **Escopo** — monitorar Free Plan do Supabase: banco, egress, realtime, storage, funções.
- [x] **Fase 1 entregue** — tela `/dev` com métricas SQL via RPC `security definer`, ícone de monitor no header só para o dev, botão para painel Supabase (link externo).
- [x] **Auto-refresh** — desligado por padrão (refresh é manual).
- [-] **Exposição de token da Management API** — adiado. Opção 3 (botão para o painel) em uso.
- [ ] **Alertas automáticos** — fora da fase 1.

---

## 1. O que a documentação do Supabase diz que dá para medir

Dividido entre **o que conseguimos ver só com SQL** (gratuito, inline, sem token extra) e **o que só aparece via Management API ou painel web**.

### 1.1 Dá para ver por SQL direto (fácil, barato, exato)

Todos são `SELECT` contra `pg_*` / catálogos do Postgres. Custo de egress desprezível.

| Métrica | Fonte | Uso |
|---|---|---|
| Tamanho total do banco | `pg_database_size(current_database())` | Gauge principal vs. 500 MB |
| Tamanho por tabela | `pg_total_relation_size('schema.tabela')` em `pg_tables` | Ranking das maiores tabelas |
| Tamanho por schema | Somatório de `pg_total_relation_size` agrupado | Ver se `almox` ou `public` domina |
| Linhas por tabela | `pg_stat_user_tables.n_live_tup` | Detectar tabelas que crescem sem limite |
| Índices vs. heap | `pg_relation_size` (tabela) vs. `pg_indexes_size` | Identificar índices gordos |
| Cache hit ratio do Postgres | `pg_stat_database.blks_hit / (blks_hit + blks_read)` | Saúde do cache — se despenca, tem consulta fazendo IO frio |
| Conexões ativas | `pg_stat_activity` | Ver se está estourando pool (15 conexões no Free) |
| Queries em execução | `pg_stat_activity WHERE state = 'active'` | Detectar consulta travada |
| Queries mais lentas | `pg_stat_statements` (se extensão habilitada) | Top consumidores de tempo/IO |
| Bloat por tabela | `pgstattuple` ou heurística de `n_dead_tup / n_live_tup` | Detectar necessidade de VACUUM |
| Última atualização de estatística | `pg_stat_all_tables.last_analyze` | Saber se o `ANALYZE` está em dia |

**Pré-requisitos:**
- `pg_stat_statements` precisa estar habilitado. No Supabase Free geralmente já está, mas confirmar com `SHOW shared_preload_libraries`.
- Nada disso vem via cliente `EXPO_PUBLIC_*` (anon key não enxerga catálogos). **Tem que ser API route server-side com `SUPABASE_SERVICE_ROLE_KEY`.**

### 1.2 NÃO dá para ver por SQL — só via Management API ou painel

Esses são os números que o próprio doc [supabase-free-plan-impactos.md](./supabase-free-plan-impactos.md) marca como mais sensíveis.

| Métrica | Onde vive | Como acessar programaticamente |
|---|---|---|
| **Egress acumulado do mês** (DB + Storage + Auth + Functions + Realtime) | Billing/Usage | Supabase Management API `GET /v1/projects/{ref}/usage` — requer **Personal Access Token (PAT)** |
| Mensagens de Realtime consumidas | Billing/Usage | Mesma API |
| Invocações de Edge Functions | Billing/Usage | Mesma API |
| Monthly Active Users (Auth) | Billing/Usage | Mesma API |
| Storage utilizado (bytes) | Billing/Usage | Mesma API (ou `SELECT sum(metadata->>'size') FROM storage.objects`) |

**Problema prático**: o PAT da Management API é credencial sensível. Ela dá acesso a **tudo** do projeto — se vazar, quem tiver a PAT pode deletar o projeto. Não pode ir para o bundle do cliente. Duas opções no item 2.4.

### 1.3 O que a doc do Supabase mostra além disso

- **"Database size" guide** confirma que `pg_database_size` é a métrica oficial cobrada.
- **"Manage your egress"** documenta que egress é consolidado por organização (não só por projeto) e que cache conta separado do não-cacheado.
- **"Advisor"** do Supabase (painel web) tem lints automáticos de performance e segurança. Esses não são expostos por SQL, só pelo painel ou pela Management API endpoint `/v1/projects/{ref}/advisors`.

---

## 2. Plano de implementação (fases)

### 2.1 Fase 1 — Tela com métricas SQL only (alta prioridade, baixo risco)

Traz tudo do item 1.1 — já cobre **~80% do valor** sem depender de PAT. **Entregue**.

- [x] **2.1.1 Nova rota `src/app/(app)/dev.tsx`** — reexport fino; tela completa em `src/features/almox/screens/dev-screen.tsx`.
- [x] **2.1.2 Gate de visibilidade** — hook `useIsDeveloper()` em [src/features/auth/use-is-developer.ts](../src/features/auth/use-is-developer.ts). Redirect para `/` se não for dev. Ícone no header só aparece para o dev.
- [x] **2.1.3 API route `src/app/api/dev/db-usage+api.ts`** — double gate (rejeita 401/403), chama RPC via service_role. Responde com `dbUsage + queryStats + painelUrl`.
- [x] **2.1.4 RPCs `almox_dev_db_usage` e `almox_dev_query_stats`** — ambas `security definer` em [supabase/migrations/20260423235000_criar_funcoes_monitoramento_dev.sql](../supabase/migrations/20260423235000_criar_funcoes_monitoramento_dev.sql). `grant execute` só para `service_role`.
- [x] **2.1.5 UI entregue** — gauge de banco (cor progressiva verde/laranja/vermelho), barras de schemas, top-10 tabelas (com ratio de índice vs heap e linhas mortas), cache hit %, lista de conexões, top queries.
- [x] **2.1.6 Refresh manual** — botão "Atualizar" no header da página. **Auto-refresh não implementado** (decisão: sempre manual para não sangrar egress).
- [x] **2.1.7 Componentes reusados** — `SectionCard`, `SectionTitle`, `ActionButton`, `InfoBanner`, `EmptyState`, `PageHeader`, `ScreenScrollView`.

### 2.2 Fase 2 — Egress + limites do billing (requer decisão sobre PAT)

- [ ] **2.2.1 Se seguir pela Management API**: ver item 2.4 para opções de token.
- [ ] **2.2.2 API route `src/app/api/dev/billing-usage+api.ts`** — chama `GET /v1/projects/{ref}/usage`, normaliza e cacheia a resposta por 5 minutos (evitar rate limit da MgmtAPI).
- [ ] **2.2.3 UI — bloco "Consumo do mês"** com 5 gauges: egress (cache/non-cache), realtime msgs, function invocations, storage, MAU.

### 2.3 Fase 3 — Histórico e alertas (opcional, só se a Fase 1 + 2 sustentar)

- [ ] **2.3.1 Tabela `almox.dev_usage_snapshot`** gravada por cron diário com os números do momento.
- [ ] **2.3.2 Sparklines de 30 dias** em cada card da Fase 1/2.
- [ ] **2.3.3 Alerta por e-mail** quando `DB size > 400 MB` ou `egress > 4 GB`. (Depende do bloco de e-mail que foi congelado — reativar só para envio administrativo.)

### 2.4 Pergunta crítica — onde o PAT da Management API vai morar

Três opções, com trade-offs:

1. **Guardar como env server-side `SUPABASE_MANAGEMENT_PAT`**
   - Prós: simples, nunca vai pro cliente.
   - Contras: precisa rotacionar manualmente, quem tem acesso ao EAS Hosting env vê a chave.
2. **Pedir que o usuário cole a PAT no próprio dev screen**, criptografar e guardar em `almox.configuracao_sistema` (igual ao fluxo SISCORE).
   - Prós: cada dev usa a própria PAT, audit trail por usuário, rotação é responsabilidade do dono.
   - Contras: UI extra, risco se a chave AES-GCM vazar.
3. **Pular Management API**, colocar só um **botão "Abrir no painel do Supabase"** que linka `https://supabase.com/dashboard/project/{ref}/reports/usage`.
   - Prós: zero risco, zero manutenção.
   - Contras: usuário precisa sair do app para ver egress.

**Recomendação**: começar pela **Fase 1 (SQL only)** + opção **3** (botão para o painel). Só promover para opção 1 ou 2 se a Fase 1 não for suficiente.

---

## 3. Risco do próprio monitoramento

A tela de monitoramento **também consome egress**. Precisa ser cuidadosa para não virar exatamente o problema que está tentando diagnosticar.

- [ ] Limitar tamanho das respostas (top-10, top-20 — nunca listas completas).
- [ ] Não fazer auto-refresh agressivo (default desligado).
- [ ] Cachear por 60s nas API routes (`Cache-Control: private, max-age=60`).
- [ ] Deixar explícito no rodapé da tela o custo aproximado de cada refresh (`~50 KB de egress`).

---

## 4. Fora de escopo (registrado para não perder)

- Advisor lints do Supabase — exige Management API.
- Logs de Postgres (erros, slow queries pre-agregadas) — só via painel/logs.
- Monitoramento de workflows do GitHub Actions do sync — outro problema, outra tela.
- Tela de administração de usuários / papéis — planejada em [tarefas-pendentes.md](./tarefas-pendentes.md#permissões).

---

## 5. Perguntas em aberto

- [ ] Confirmar: começamos pela **Fase 1 + botão externo** (opção 3 do 2.4)? Ou já querendo Management API na primeira entrega?
- [ ] A tela deve aparecer no header (ícone de engrenagem/terminal visível só para você) ou fica "escondida" só via URL `/dev`?
- [ ] Auto-refresh default desligado, certo?
