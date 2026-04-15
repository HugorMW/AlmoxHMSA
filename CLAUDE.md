# AlmoxHMSA — Guia para Claude

## Visão Geral

Sistema web de **gestão de almoxarifado hospitalar** para o HMSA (Hospital Municipal de Salvador e afins). Integra com o SISCORE (sistema legado do governo) para sincronizar estoque, notas fiscais e redistribuições entre hospitais.

## Tech Stack

| Camada | Tecnologia |
|--------|-----------|
| Framework | Expo 55 + React Native 0.83.4 + React 19 |
| Roteamento | Expo Router 55 (file-based, server output mode) |
| Backend | Expo Router API Routes (`+api.ts`) |
| Banco | PostgreSQL via Supabase (`@supabase/supabase-js`) |
| Migrations | SQL em `supabase/migrations/` |
| Build/Deploy | EAS (Expo Application Services) |
| CI/CD | GitHub Actions + EAS Workflows |
| Package manager | npm |
| TypeScript | 5.9.2, strict mode |

## Estrutura de Diretórios

```
src/
  app/
    (app)/            # Rotas protegidas (autenticado)
    api/              # API Routes server-side (+api.ts)
    _layout.tsx       # Layout raiz com providers
    login.tsx         # Tela de login
  features/
    almox/            # Feature principal: estoque, produtos, notas, empréstimos
      almox-provider.tsx    # Context global de dados + cache
      data.ts               # Transformações e cálculos
      screens/              # Telas da feature
      components/           # Componentes UI
      types.ts              # Tipos TypeScript
      tokens.ts             # Design tokens
      cache.ts              # Cache client-side (TTL 5min)
      excel.ts              # Exportação Excel (client-side, lib xlsx)
    auth/             # AuthProvider context
  server/             # Utilitários server-side (não exposto ao client)
    siscore-auth.ts               # Cliente HTTP do SISCORE
    siscore-credential-store.ts   # Criptografia AES-GCM de credenciais
    siscore-sync-core.ts          # Lógica de sincronização
    session-cookie.ts             # Gerenciamento de sessão (HTTP-only cookie)
    github-actions.ts             # Disparo de workflows GitHub Actions
    supabase-admin.ts             # Cliente Supabase com service_role
  lib/
    supabase.ts       # Cliente Supabase público (client-side)
  hooks/              # Custom hooks React
  components/         # Componentes compartilhados
  constants/          # Tema e constantes

supabase/migrations/  # Schema do banco (PostgreSQL)
scripts/              # Scripts utilitários Node.js
.github/workflows/    # CI: siscore-sync.yml, siscore-sync-notas.yml
.eas/workflows/       # deploy-web.yml (auto-deploy no push para master)
```

## Comandos Essenciais

```bash
npm run start              # Servidor de desenvolvimento Expo
npx expo start --web       # Web específico
npm run lint               # Linting (expo lint)
npm run db:apply           # Aplicar migrations Supabase
npm run siscore:import     # Importar dados do SISCORE via CLI
npm run web:export         # Bundle web otimizado
npm run web:deploy         # Deploy preview EAS Hosting
npm run web:deploy:prod    # Deploy produção EAS Hosting
```

## Path Aliases (tsconfig)

- `@/*` → `./src/*`
- `@/assets/*` → `./assets/*`

## Variáveis de Ambiente

Arquivo modelo: `.env.local.example`

**Client (prefixo `EXPO_PUBLIC_`):**
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

**Server only:**
- `APP_SESSION_SECRET` — secret para cookies de sessão
- `SUPABASE_SERVICE_ROLE_KEY` — admin Supabase
- `SUPABASE_DB_URL` — connection string PostgreSQL
- `SISCORE_CREDENTIALS_KEY` — chave AES-GCM para credenciais
- `SISCORE_BASE_URL` — URL base do SISCORE
- `SISCORE_EXPORTACAO_URL*` — endpoints de exportação por categoria
- `SISCORE_USUARIO` / `SISCORE_SENHA` — credenciais CLI (opcional)
- `GITHUB_ACTIONS_REPOSITORY` — repo para trigger de workflow
- `GITHUB_ACTIONS_TRIGGER_TOKEN` — PAT GitHub com permissão workflow

## API Routes

| Método | Rota | Função |
|--------|------|--------|
| POST | `/api/auth/login` | Valida credenciais SISCORE, cria sessão |
| POST | `/api/auth/logout` | Encerra sessão |
| GET | `/api/auth/session` | Verifica sessão ativa |
| POST | `/api/siscore/sync` | Dispara sincronização (GitHub Actions ou inline) |
| GET | `/api/siscore/sync?trackingId=X` | Polling do status do job |

## Schema do Banco (schema: `almox`)

| Tabela | Propósito |
|--------|-----------|
| `lote_importacao` | Controle de batches de importação |
| `unidade` | Unidades hospitalares (HMSA, HEC, HDDS, HABF) |
| `produto_referencia` | Cadastro master de produtos |
| `produto_unidade` | Variantes por unidade |
| `estoque_importado` | Níveis de estoque atual |
| `exclusao_produto_hmsa` | Blacklist de produtos |
| `notas_fiscais_hmsa` | Notas fiscais e itens |
| `siscore_credencial_usuario` | Credenciais criptografadas do usuário |
| `sincronizacao_siscore_rastreador` | Rastreamento e status de jobs de sync |

View principal: `almox_estoque_atual` — estoque atual por produto/unidade.

## Fluxo de Autenticação

1. Usuário insere credenciais SISCORE na tela de login
2. POST `/api/auth/login` valida no SISCORE, criptografa e salva no Supabase
3. Sessão criada via HTTP-only cookie (sem JWT em localStorage)
4. `AuthProvider` verifica sessão ao carregar o app

## Fluxo de Sincronização

1. Usuário clica "Atualizar base" em Settings
2. POST `/api/siscore/sync` com escopo (estoque, notas, etc.)
3. Se `GITHUB_ACTIONS_*` configurado → enfileira GitHub Actions workflow
4. Caso contrário → importa inline no processo EAS Hosting
5. Frontend faz polling em `/api/siscore/sync?trackingId=X`
6. Ao concluir → emite evento `almox:sync-completed`

## Decisões Arquiteturais Importantes

- **Server output mode:** Expo Router com `output: "server"` permite API routes reais no EAS Hosting
- **React Compiler:** habilitado (experimental) — evitar mutações diretas de state
- **Cache com TTL:** `cache.ts` usa TTL de 5 minutos + flags de sessão para evitar re-fetches
- **Criptografia AES-GCM:** credenciais SISCORE armazenadas cifradas no Supabase (nunca em plain text)
- **Sync via GitHub Actions:** operações longas de sync são delegadas ao GH Actions para confiabilidade
- **Export Excel client-side:** geração de Excel/CSV ocorre no browser via lib `xlsx`, sem backend
- **Multi-hospital:** dados filtrados pelo contexto do hospital ativo no provider
- **Typed Routes:** habilitado no Expo Router — usar tipagem de rotas ao navegar

## Convenções do Projeto

- Arquivos de tela em `src/features/almox/screens/`
- Componentes da feature em `src/features/almox/components/`
- Lógica server-side exclusivamente em `src/server/` — nunca importar em componentes client
- API routes seguem padrão `src/app/api/[caminho]+api.ts`
- Migrations SQL nomeadas com timestamp: `YYYYMMDDHHMMSS_descricao.sql`
