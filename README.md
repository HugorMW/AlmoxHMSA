# Almox HMSA

Aplicação web em Expo Router com:

- interface operacional do almoxarifado
- autenticação via SISCORE
- rotas de API server-side
- leitura de dados no Supabase

## Desenvolvimento local

1. Instale as dependências:

```bash
npm install
```

2. Crie o `.env.local` a partir de `.env.local.example`.

3. Rode o projeto:

```bash
npx expo start --web
```

## Deploy web

Este projeto usa `expo.web.output = "server"` e rotas `+api`, então o caminho recomendado é **EAS Hosting**.

### Pré-requisitos

1. Ter conta no Expo
2. Fazer login no CLI:

```bash
npx eas-cli login
```

3. Configurar as variáveis de ambiente no Expo Dashboard ou via CLI

### Variáveis importantes para produção

Cliente web:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Servidor/API routes:

- `APP_SESSION_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SISCORE_CREDENTIALS_KEY`
- `SISCORE_BASE_URL`
- `SISCORE_EXPORTACAO_URL`
- `SISCORE_EXPORTACAO_URL_FARMACOLOGICO`
- `SISCORE_EXPORTACAO_URL_NOTAS_FISCAIS`
- `GITHUB_ACTIONS_REPOSITORY`
- `GITHUB_ACTIONS_SYNC_WORKFLOW`
- `GITHUB_ACTIONS_SYNC_REF`
- `GITHUB_ACTIONS_TRIGGER_TOKEN`

Observação:

- `SUPABASE_DB_URL` continua sendo necessária para o importador CLI e para o GitHub Actions.
- `SISCORE_USUARIO` e `SISCORE_SENHA` podem ficar vazios no site publicado quando a senha estiver sendo salva de forma cifrada após o login.
- `SISCORE_CREDENTIALS_KEY` deve ser uma chave forte e exclusiva para cifrar as credenciais salvas no Supabase.
- `GITHUB_ACTIONS_TRIGGER_TOKEN` deve ser um token do GitHub com permissão para disparar workflows no repositório.

### Comandos

Preview:

```bash
npm run web:deploy
```

Produção:

```bash
npm run web:deploy:prod
```

Os scripts fazem:

1. `expo export --platform web`
2. `eas deploy`

## Deploy automático pelo GitHub

O projeto já está preparado com EAS Workflows em:

- [.eas/workflows/deploy-web.yml](c:/Users/hugor/Projetos/SiteAlmoxHMSA/v1/AlmoxHMSA/.eas/workflows/deploy-web.yml)

Fluxo:

1. push na branch `master`
2. EAS Workflows roda no GitHub conectado ao projeto
3. o site é publicado em produção automaticamente

Se preferir um primeiro teste controlado, faça um deploy manual primeiro. Depois disso, basta continuar publicando no GitHub que o deploy de produção passa a seguir o fluxo automático.

## Credencial do SISCORE

O login do site valida o usuario e a senha no SISCORE e salva a senha cifrada no Supabase para uso posterior na sincronizacao manual da base.

Fluxo atual:

1. usuario faz login no site
2. backend valida no SISCORE
3. senha e salva cifrada no Supabase
4. ao clicar em `Atualizar base`, a API route usa o usuario da sessao para localizar essa credencial e disparar o GitHub Actions de sincronizacao

Para isso funcionar em producao, configure:

- `SUPABASE_DB_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_SESSION_SECRET`
- `SISCORE_CREDENTIALS_KEY`

## Sincronizacao via GitHub Actions

Quando `GITHUB_ACTIONS_REPOSITORY` e `GITHUB_ACTIONS_TRIGGER_TOKEN` estao definidos no ambiente do site publicado, o botao `Atualizar base` deixa de processar a importacao dentro do EAS Hosting e passa a apenas enfileirar a sincronizacao no GitHub Actions.

Workflow incluido:

- `.github/workflows/siscore-sync.yml`

Secrets necessarios no repositório do GitHub:

- `SUPABASE_DB_URL`
- `SISCORE_BASE_URL`
- `SISCORE_EXPORTACAO_URL`
- `SISCORE_EXPORTACAO_URL_FARMACOLOGICO`
- `SISCORE_EXPORTACAO_URL_NOTAS_FISCAIS`
- `SISCORE_CREDENTIALS_KEY`
