# Acompanhamento de Processos

Documento vivo para planejar e acompanhar a criacao da tela **Acompanhamento de Processos**, inspirada no arquivo local de referencia `SISCORE.html`.

Status por item: `[ ]` pendente · `[~]` em andamento · `[x]` concluido · `[-]` descartado.

---

## 1. Objetivo

Criar uma tela operacional para acompanhar processos de compra/ressuprimento, com visual e fluxo proximos da tela de referencia do SISCORE, mas adaptados ao design atual do AlmoxHMSA.

A tela deve permitir:

- visualizar processos por classificacao do material;
- acompanhar andamento, atrasos, conclusao e itens criticos;
- cadastrar novo processo;
- editar processo;
- atualizar parcelas entregues;
- ocultar/restaurar processos sem apagar o historico;
- pesquisar e filtrar por tipo, situacao, fornecedor, produto, marca, E-DOCS e numero do pedido.

---

## 2. Referencia visual

Arquivo analisado: `C:\Users\hugor\Downloads\Tela Processos\SISCORE.html`.

Principais elementos identificados:

- cabecalho "Controle de Processos";
- botao **Novo Processo**;
- alternancia entre materiais e medicamentos;
- cards de resumo: Total, Em andamento, Atrasados, Concluidos e Criticos;
- busca textual;
- filtros por Tipo e Status;
- lista em formato de tabela com colunas:
  - Pedido / Tipo;
  - Item / Fornecedor;
  - Data de resgate;
  - Parcelas e prazos;
  - Status;
  - Acoes;
- modal de cadastro/edicao;
- modal para atualizar parcelas entregues;
- regra de prazos:
  - parcela 1: 5 dias uteis apos o resgate;
  - parcela 2: 45 dias corridos apos o resgate;
  - parcela 3: 85 dias corridos apos o resgate;
  - parcelas seguintes: acrescentar 40 dias corridos.

---

## 3. Regra do Cod. Bionexo

Ao cadastrar um novo processo, o usuario deve informar o **Cod. Bionexo**.

Decisao desta etapa:

- o codigo sera normalizado com o prefixo `I-`;
- se o usuario digitar `12345`, o app busca como `I-12345`;
- se o usuario digitar `I-12345`, o app mantem `I-12345`;
- a busca sera feita na base ja importada do SISCORE, usando:
  - `codigo_produto_referencia` como Cod. Bionexo / `cd_pro_fat`;
  - `nome_produto_referencia` como descricao padrao do produto;
  - `codigo_produto` como numero interno do produto no HMSA;
  - `categoria_material` para classificar o processo.

Comportamento esperado:

- quando o Cod. Bionexo for encontrado, preencher automaticamente:
  - numero do produto;
  - descricao do produto;
  - classificacao do material;
- se houver mais de um item com o mesmo Cod. Bionexo, priorizar HMSA;
- se nao encontrar o codigo, bloquear o cadastro e exibir orientacao clara.

---

## 4. Modelo de dados

Primeira proposta de tabela: `public.almox_processos_acompanhamento`.

Campos principais:

- `id`;
- `categoria_material`;
- `cod_bionexo`;
- `cd_produto`;
- `ds_produto`;
- `numero_processo` (usado na tela como numero do pedido);
- `edocs`;
- `marca`;
- `tipo_processo`;
- `fornecedor`;
- `data_resgate`;
- `total_parcelas`;
- `parcelas_entregues`;
- `critico`;
- `ignorado`;
- `ativo`;
- `criado_em`;
- `atualizado_em`.

Status do processo sera calculado no app:

- **Concluido**: todas as parcelas foram entregues;
- **Atrasado**: existe parcela pendente com prazo vencido;
- **Em andamento**: existe parcela pendente dentro do prazo.

---

## 5. Primeira etapa de desenvolvimento

### [x] 5.1 Criar tela base

- [x] Planejar tela neste documento.
- [x] Criar tabela no Supabase.
- [x] Criar tipos no app.
- [x] Carregar processos no provider.
- [x] Adicionar rota `/processes`.
- [x] Adicionar item no menu.
- [x] Criar tela com resumo, filtros e lista.
- [x] Criar modal de novo processo com busca por Cod. Bionexo.
- [x] Criar modal de parcelas.
- [x] Validar TypeScript e lint.

### [ ] 5.2 Melhorias futuras

- Importar CSV de processos, como na referencia.
- Auditoria de alteracoes por usuario.
- Permissoes por classificacao, seguindo a futura regra da tela de permissoes.
- Historico detalhado de cada parcela.
- Exportacao Excel da lista filtrada.
- Notificacoes para parcelas proximas do vencimento.
