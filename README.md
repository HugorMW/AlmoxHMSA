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
- `SISCORE_CREDENTIALS_KEY`
- `SISCORE_BASE_URL`
- `SISCORE_EXPORTACAO_URL`
- `SISCORE_EXPORTACAO_URL_FARMACOLOGICO`
- `SISCORE_EXPORTACAO_URL_NOTAS_FISCAIS`

Observação:

- `SUPABASE_DB_URL` é necessária se o site publicado for disparar a sincronização do SISCORE via API route.
- `SISCORE_USUARIO` e `SISCORE_SENHA` podem ficar vazios no site publicado quando a senha estiver sendo salva de forma cifrada após o login.
- `SISCORE_CREDENTIALS_KEY` deve ser uma chave forte e exclusiva para cifrar as credenciais salvas no Supabase.

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

## Credencial do SISCORE

O login do site valida o usuario e a senha no SISCORE e salva a senha cifrada no Supabase para uso posterior na sincronizacao manual da base.

Fluxo atual:

1. usuario faz login no site
2. backend valida no SISCORE
3. senha e salva cifrada no Supabase
4. ao clicar em `Atualizar base`, a API route usa o usuario da sessao para localizar essa credencial e executar a importacao

Para isso funcionar em producao, configure:

- `SUPABASE_DB_URL`
- `APP_SESSION_SECRET`
- `SISCORE_CREDENTIALS_KEY`
