# Dashboard — Revisão UX/UI

Documento vivo. Cada item tem **status** (`[ ]` aberto / `[x]` aprovado / `[~]` parcial / `[-]` descartado). Marca o que aprovar e eu aplico.

Arquivo principal: [dashboard-screen.tsx](../src/features/almox/screens/dashboard-screen.tsx)
Componentes auxiliares: [common.tsx](../src/features/almox/components/common.tsx) (`InfoBanner`, `PageHeader`, `SectionCard`, `InlineTabs`)

---

## 1. Diagnóstico (o que está pesando a tela)

Pelo print enviado e leitura do código, hoje a dashboard pode renderizar **5 banners empilhados** antes de qualquer KPI aparecer:

1. `error` — "Falha ao atualizar a base" (vermelho)
2. `syncError` — "Falha ao sincronizar com o SISCORE" (vermelho)
3. `syncNotice` — "Sincronização da base" (azul)
4. `usingCachedData` — "Base local recente em validação" (azul)
5. `Origem dos dados` — **sempre aparece**, repetindo o que o subtitle do header já disse (verde/azul)

No print, com `error + Origem dos dados`, isso ocupa ~190 px de altura útil antes do primeiro card.

Outros pontos:

- **Redundância textual**: o `PageHeader.subtitle` já diz "Última importação com mudança... Última leitura do app...". O banner "Origem dos dados" é uma 2ª cópia da mesma informação.
- **11 cards de KPI** em 2-3 linhas (`Total/Críticos/Em alerta/Estáveis` + `Comprar/Pegar emprestado/Avaliar/Pode emprestar` + 3 cards de `intelligence` quando hospital = HMSA). Ocupa ~430-570 px de altura. Mistura "estado" (quantos críticos) com "ação" (quantos comprar) sem hierarquia visual.
- **Card `Avaliar` sempre zerado** — o próprio hint diz "Regra atual não usa essa faixa". Está no dashboard sem motivo.
- **`Visão por hospital`** é um SectionCard inteiro só para 4 abas. Card + título + subtítulo desperdiçam ~80 px que poderiam estar no header.
- **Banners não fecham**. Mesmo depois do usuário entender o erro, ele continua ali até resolver a causa.
- **Sem `cursor: pointer` em Pressables na web** — o React Native Web não adiciona automaticamente. (skill rule: `cursor-pointer`)

---

## 2. Propostas

### 2.1 Reduzir ruído de banners (alta prioridade)

- [ ] **2.1.1 Remover o banner "Origem dos dados"**
  É puramente decorativo e duplica o subtitle. Substituir por um pequeno status inline no header (ponto verde/cinza + "atualizado HH:mm").

- [ ] **2.1.2 Banners dismissíveis**
  Adicionar botão `×` em `InfoBanner` (prop `onDismiss?: () => void`). Estado de dismiss vive na tela:
  ```tsx
  const [dismissedError, setDismissedError] = useState(false);
  // reset quando error muda
  useEffect(() => setDismissedError(false), [error]);
  ```

- [ ] **2.1.3 Colapsar banners de info em um único componente expansível**
  `syncNotice + usingCachedData` viram uma badge no header ("ℹ 2 avisos"), expansível ao clicar. Erros (vermelhos) continuam expandidos por padrão.

- [ ] **2.1.4 Toast para `syncNotice` (sumir sozinho em 5s)**
  Mensagens transitórias de sucesso/info viram toast no canto, não banner persistente. (skill: `Toast Notifications: auto-dismiss 3-5s`)

### 2.2 Reorganizar KPIs (alta prioridade)

- [x] **2.2.0 Adicionar bandas faltantes (16-30 e 31-60) e grade de 5**  *(aplicado)*
  - `getLevel()` re-banda: BAIXO 16-30 (igual), MÉDIO 31-60 (era 31-90), ALTO 61+ (era 91+).
  - Linha 1 vira **5 cards**: Críticos · Em alerta · Médio (16-30) · Baixo (31-60) · Estáveis (61+).
  - Card "Total" foi removido para caber a grade de 5 — se quiser de volta, melhor mover o número pro subtítulo (item 2.3.2 ou novo).
  - `flexBasis` dos cards passou de 220 → 180 para 5 caberem confortavelmente em 1080px.
  - **Side-effect a confirmar**: o filtro `LevelFilter` em `products-screen` (BAIXO/MÉDIO/ALTO) agora cobre faixas mais estreitas. Comportamento continua válido, só fica mais granular.

- [ ] **2.2.1 Remover card "Avaliar"**
  Está sempre 0 com a regra atual. Reabilita quando regra mudar.

- [ ] **2.2.2 Separar "Estado" de "Ação" com hierarquia clara**
  ```
  ┌─ Estado do estoque (HMSA) ──────────────────┐
  │  Total · Críticos · Em alerta · Estáveis    │  ← linha 1, neutra
  └──────────────────────────────────────────────┘

  ┌─ Ações recomendadas ────────────────────────┐
  │  Comprar · Pegar emprestado · Pode emprestar│  ← linha 2, com cores quentes
  └──────────────────────────────────────────────┘
  ```
  Cada bloco com seu próprio `SectionTitle` curto. Resolve a "parede de cards".

- [ ] **2.2.3 Promover os 3 `intelligenceCards` (Redistribuir/Acima da faixa/Risco de ruptura) para abas dentro de UM card único**
  Em vez de 3 cards extras + um SectionCard expandido embaixo, vira:
  ```
  ┌─ Inteligência operacional ─────────────────┐
  │ [ Redistribuir 12 ] [ Acima 4 ] [ Risco 3 ]│
  │ ───────────────────────────────────────────│
  │ <lista do painel ativo>                    │
  └────────────────────────────────────────────┘
  ```
  Reduz de ~280 px de cards + ~200 px de painel = 480 px → para ~360 px num único bloco coeso.

- [ ] **2.2.4 Cards menores em mobile**
  Hoje `flexBasis: 220` força 2 cards por linha em telas médias. Diminuir para `180` e reduzir `minHeight` de `142` para `120` em viewports < 768 px.

### 2.3 Compactar header (média prioridade)

- [ ] **2.3.1 Mover seletor de hospital para o `PageHeader`**
  Em vez de SectionCard separado, vira um `<InlineTabs>` à direita do título (ou abaixo em mobile). Economiza ~80 px.

- [ ] **2.3.2 Subtitle do header só com timestamp curto**
  De "Base operacional conectada ao Supabase. Última importação com mudança: 21/04 14:30. Última leitura do app: 21/04 14:32." para "Atualizado 21/04 14:30 · leitura 14:32". Menor, mais escaneável.

### 2.4 Microinterações (baixa prioridade, mas profissional)

- [ ] **2.4.1 `cursor: pointer` em todo `Pressable` clicável** (skill rule)
  Adicionar `style={{ cursor: 'pointer' as any }}` ou via `web` styles em `MetricCard`/`InsightCard`/abas.
- [ ] **2.4.2 Skeleton loading nos cards** durante `loading` em vez de mostrar `0` (skill: `loading-states`).
- [ ] **2.4.3 Transição suave** (`transition: 'background-color 200ms'`) ao trocar painel ativo.
- [ ] **2.4.4 Tooltip do card só no `?`**, não no card inteiro
  Hoje o tooltip aparece ao hover em qualquer parte do card. Para cards clicáveis (`InsightCard`) isso conflita com a ação de selecionar. Mover tooltip para um ícone `HelpHint` no canto.

### 2.5 Conteúdo / utilidade (média prioridade)

- [ ] **2.5.1 Mostrar **delta** vs. última leitura** nos cards principais
  Ex.: "Críticos: 12 ↑ 3 desde ontem". Exige snapshot anterior — possível? Já existe `estoque_diario_snapshot`.
- [ ] **2.5.2 Atalho "Ver lista" nos cards de ação**
  `Comprar 8 →` leva para a tela de produtos pré-filtrada. Hoje o número é só informativo.
- [ ] **2.5.3 Filtro por categoria visível no topo**
  `categoryFilter` ('todos' | 'hospitalar' | 'farmacologico') existe no provider mas não tem controle visual no dashboard. Adicionar 3 chips ao lado do hospital.

---

## 3. Ordem de execução sugerida

Da maior dor (avisos ocupando tela) ao polimento:

1. **2.1.1 + 2.1.2** — remover "Origem dos dados", adicionar dismiss. ~30 min, resolve a queixa principal.
2. **2.2.1 + 2.2.2** — remover "Avaliar", separar Estado/Ação. ~45 min, melhora hierarquia.
3. **2.3.1 + 2.3.2** — mover seletor de hospital pro header, subtitle compacto. ~30 min.
4. **2.2.3** — abas dentro de um card só. ~1h, refator maior.
5. **2.1.3 / 2.1.4** — colapsar/toast (decidir um dos dois). ~1h.
6. **2.4 / 2.5** — polimento e features novas, sob demanda.

---

## 4. Perguntas abertas

- [ ] **Q1**: O card "Avaliar" pode sair de vez ou prefere mantê-lo escondido com `if (value > 0)`?
- [ ] **Q2**: A regra de mostrar `intelligenceCards` só quando `activeHospital === 'HMSA'` continua? (parece sim, são análises só do HMSA)
- [ ] **Q3**: Posso mover `categoryFilter` (hoje só na settings/blacklist) pro topo do dashboard também? Faz sentido o usuário filtrar por hospitalar/farmacológico aqui?
- [ ] **Q4**: Toast vs. banner colapsável para `syncNotice/usingCachedData` — qual prefere? Toast some sozinho, colapsável fica até clicar.
- [ ] **Q5**: Delta vs. ontem nos cards (2.5.1) interessa? Tenho `estoque_diario_snapshot` para isso.

---

## 5. Notas técnicas

- O React Compiler está habilitado — evitar mutações diretas em arrays/objetos de state.
- `Pressable` no React Native Web aceita `cursor` via prop `style` mas com cast: `style={{ cursor: 'pointer' as any }}`.
- `InfoBanner` aceita `tone: 'neutral' | 'warning' | 'danger' | 'success' | 'info'` — adicionar `onDismiss` é trivial, sem breaking change.
- Mudar layout dos cards não requer alterar `data.ts` nem o provider; só os styles e o JSX da tela.
