# Supabase Free Plan — Impactos no AlmoxHMSA

Documento de contexto operacional para lembrar quais limites do plano gratuito do Supabase precisam entrar na analise tecnica do AlmoxHMSA quando forem pertinentes.

Verificado em: **23/04/2026**

Fontes oficiais consultadas:

- Billing overview: https://supabase.com/docs/guides/platform/billing-on-supabase
- Database size: https://supabase.com/docs/guides/platform/database-size
- Egress: https://supabase.com/docs/guides/platform/manage-your-usage/egress
- Storage pricing: https://supabase.com/docs/guides/storage/management/pricing
- Storage file limits: https://supabase.com/docs/guides/storage/uploads/file-limits
- Realtime limits: https://supabase.com/docs/guides/realtime/rate-limits
- Edge Functions limits: https://supabase.com/docs/guides/functions/limits

---

## 1. Limites do Free Plan que mais importam aqui

### 1.1 Banco de dados

- **500 MB de database size por projeto**
- Se passar disso, o projeto pode entrar em **modo somente leitura**

Impacto no AlmoxHMSA:

- esse e o limite mais perigoso para o historico importado do SISCORE;
- se a base crescer sem controle, o site pode continuar lendo, mas gravacoes e importacoes podem falhar.

### 1.2 Egress

- **5 GB de egress nao cacheado**
- **5 GB de egress cacheado**
- a conta e unificada por organizacao e soma trafego de database, storage, auth, functions e realtime

Impacto no AlmoxHMSA:

- esse hoje parece ser o limite mais sensivel no uso diario do app;
- a leitura inicial da base operacional sai direto do Supabase para o cliente;
- cada carregamento completo da `almox_estoque_atual` consome egress de banco.

### 1.3 Storage

- **1 GB de storage**
- **50 MB de tamanho maximo por arquivo** no Free Plan

Impacto no AlmoxHMSA:

- baixo no fluxo atual, desde que o projeto nao comece a guardar anexos, PDFs ou arquivos de apoio em bucket.

### 1.4 Realtime

- **2 milhoes de mensagens**
- **200 conexoes de pico**

Impacto no AlmoxHMSA:

- hoje o uso parece baixo;
- o ponto relevante e o monitoramento de sincronizacao com canal realtime;
- ainda nao parece ser o gargalo principal, mas precisa entrar na conta se varios usuarios ficarem conectados ao mesmo tempo.

### 1.5 Edge Functions

- **500.000 invocacoes**
- limite de execucao menor no Free Plan

Impacto no AlmoxHMSA:

- so importa se o projeto passar a mover mais carga para Edge Functions;
- no fluxo atual descrito nos docs de login e primeira carga, isso nao parece ser o ponto dominante.

### 1.6 Pausa por inatividade

- projetos Free podem ser pausados por inatividade

Impacto no AlmoxHMSA:

- se o projeto ficar um periodo sem uso, o primeiro acesso depois pode sofrer retomada mais lenta;
- isso tambem deve ser lembrado ao analisar indisponibilidade esporadica fora do horario de uso.

---

## 2. O que pesa mais no desenho atual do AlmoxHMSA

### 2.1 Maior risco atual: egress de banco

Hoje o app:

- busca `almox_estoque_atual` direto no frontend;
- usa `.select('*')`;
- faz paginacao de 1000 em 1000;
- recarrega a base inteira no `refresh()`.

Isso e bom para simplicidade, mas no Free Plan aumenta:

- trafego total de saida;
- tempo de primeira carga;
- chance de reconsultas completas repetidas ao longo do dia.

### 2.2 Segundo maior risco: crescimento da base

Se o projeto continuar acumulando:

- importacoes do SISCORE;
- rastros de sincronizacao;
- tabelas auxiliares e historicos;

o limite de **500 MB** passa a ser um limite real de operacao, nao so de custo.

### 2.3 Configuracao via API interna pesa pouco

`/api/configuracao` faz leitura autenticada pelo backend, mas a carga e pequena perto da leitura de estoque.

Entao, para o Free Plan:

- **o maior problema nao e a configuracao**
- **o maior problema e a base operacional carregada em massa**

### 2.4 Realtime pesa menos, mas existe

O monitoramento de sincronizacao por realtime:

- nao parece caro em volume hoje;
- mas adiciona conexoes e mensagens que contam no plano.

Se o numero de usuarios simultaneos crescer, isso deixa de ser detalhe.

---

## 3. O que isso muda na leitura dos fluxos ja documentados

### No login

O login em si nao parece ser o maior consumidor do Free Plan.

Ele impacta mais:

- backend proprio;
- cookie de sessao;
- validacao externa no SISCORE.

O custo Supabase mais relevante no login e:

- salvar a credencial cifrada do usuario;
- muito menor do que a carga de dados operacional.

### No primeiro carregamento

Aqui sim os limites do Free Plan sao diretamente relevantes.

Especialmente por causa de:

1. leitura do cache local seguida de nova leitura real da base;
2. carga completa de `almox_estoque_atual`;
3. uso de `select('*')`;
4. recarga integral quando apenas parte dos dados mudou.

---

## 4. Regras praticas para considerar daqui para frente

Quando estivermos analisando performance, carga inicial, sync ou arquitetura deste projeto, vale assumir:

1. **cada leitura completa da base importa**
2. **cada coluna trafegada importa**
3. **cada recarga total evitada ajuda**
4. **crescimento de historico precisa de politica de retencao**
5. **realtime e logs tambem contam, mas hoje nao parecem o principal vilao**

---

## 5. Prioridade tecnica sob a realidade do Free Plan

Se eu estivesse priorizando com esse contexto, a ordem seria:

1. reduzir egress da carga inicial;
2. revisar quais telas realmente precisam da base completa;
3. reduzir `select('*')` onde for viavel;
4. avaliar cache com criterio de frescor real;
5. revisar politica de retencao de dados importados e logs;
6. monitorar tamanho do banco e egress periodicamente.

---

## 6. Conclusao

Sim: para o AlmoxHMSA, usar o **Supabase Free Plan** muda a analise tecnica.

Os limites que mais precisam entrar no raciocinio do projeto sao:

- **500 MB de database size**
- **5 GB + 5 GB de egress**
- **200 conexoes de pico no Realtime**

No estado atual do sistema, o ponto mais sensivel nao parece ser autenticacao, storage ou edge function. O ponto mais sensivel e o **modo como a base operacional e carregada e recarregada no frontend**.
