export type Hospital = 'HMSA' | 'HEC' | 'HDDS' | 'HABF';
export type CategoriaMaterial = 'material_hospitalar' | 'material_farmacologico';
export type FiltroCategoriaMaterial = 'todos' | CategoriaMaterial;
export type Level = 'URGENTE' | 'CRÍTICO' | 'ALTO' | 'MÉDIO' | 'BAIXO' | 'ESTÁVEL';
export type Action =
  | 'COMPRAR'
  | 'PEGAR EMPRESTADO'
  | 'AVALIAR'
  | 'PODE EMPRESTAR'
  | 'OK'
  | 'EXECUTAR AGORA'
  | 'BAIXA PRIORIDADE';
export type Priority = 'URGENTE' | 'ALTA' | 'NORMAL';
export type RuptureRisk = 'RISCO ALTO' | 'RISCO MÉDIO' | 'ESTÁVEL';
export type NotaFiscalStatusSincronizacao = 'ativo' | 'alterado' | 'removido_no_siscore' | 'reativado';
export type NotaFiscalStatusConferencia = 'ok' | 'nota_com_item_duplicado';
export type ProcessoTipo = 'ARP' | 'Processo Simplificado' | 'Processo Excepcional';
export type ProcessoStatus = 'andamento' | 'atrasado' | 'concluido' | 'cancelado';

export interface Product {
  product_code: string;
  product_name: string;
  hospital: Hospital;
  categoria_material: CategoriaMaterial;
  sufficiency_days: number;
  avg_monthly_consumption: number;
  daily_usage: number;
  level: Level;
  action?: Action;
  suggested_hospital?: Hospital;
  donor_sufficiency?: number;
  donor_current_stock?: number;
  score?: number;
  classification?: string;
  qty_transfer?: number;
  rupture_risk?: RuptureRisk;
  projected_suf?: number;
  nova_suf_doador?: number;
  nova_suf_receptor?: number;
  trend?: number;
  qty_to_buy?: number;
}

export interface DashboardKPI {
  total_products: number;
  urgent: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  stable: number;
  to_buy: number;
  to_borrow: number;
  to_evaluate: number;
  can_lend: number;
  rupture_risk_count: number;
}

export interface ChartData {
  range: string;
  count: number;
}

export interface HospitalRanking {
  hospital: Hospital;
  avg_sufficiency: number;
  total_products: number;
}

export interface DashboardData {
  kpi: DashboardKPI;
  chart_data: ChartData[];
  top10_critical: Product[];
  hospital_ranking: HospitalRanking[];
  insights: string[];
  hospitals: Hospital[];
  active_hospital: Hospital;
  last_sync: string | null;
}

export interface OrderItem extends Product {
  qty_to_buy: number;
  priority: Priority;
}

export interface EmailConfig {
  smtp_host: string;
  smtp_port: number;
  email_user: string;
  email_pass: string;
  email_destination: string;
  auto_send_on_sync: boolean;
}

export interface DetailItem {
  product_name: string;
  product_code: string;
  categoria_material?: CategoriaMaterial;
  sufficiency_days: number;
  avg_monthly_consumption?: number;
  suggested_hospital?: Hospital;
  donor_sufficiency?: number;
  donor_current_stock?: number;
  qty_transfer?: number;
  classification?: string;
  score?: number;
  excess_qty?: number;
  projected_suf?: number;
  nova_suf_doador?: number;
  rupture_risk?: RuptureRisk;
  trend?: number;
  action?: Action;
  recommendation: string;
}

export interface IntelligenceDetails {
  transfer_items: DetailItem[];
  idle_items: DetailItem[];
  rupture_items: DetailItem[];
}

export interface BlacklistItem {
  id?: string;
  cd_produto: string;
  ds_produto: string;
  codigo_unidade?: string;
  ativo?: boolean;
  criado_em?: string;
  atualizado_em?: string;
}

export interface CmmExceptionItem {
  id?: string;
  cd_produto: string;
  ds_produto: string;
  codigo_unidade?: string;
  categoria_material?: CategoriaMaterial | null;
  ativo?: boolean;
  criado_em?: string;
  atualizado_em?: string;
}

export interface LowConsumptionCandidate {
  cd_produto: string;
  ds_produto: string;
  categoria_material: CategoriaMaterial;
  cmm: number;
  estoque_atual: number;
}

export interface ProcessoParcelaDetalhe {
  numero: number;
  entregue: boolean;
  data_entrega: string | null;
  adiamento_dias_uteis: number;
  empresa_notificada: boolean;
  empresa_notificada_em: string | null;
  atualizado_em: string | null;
}

export interface ProcessoAcompanhamento {
  id?: string;
  categoria_material: CategoriaMaterial;
  cod_bionexo: string;
  cd_produto: string;
  ds_produto: string;
  numero_processo: string;
  edocs: string;
  marca: string;
  tipo_processo: ProcessoTipo;
  fornecedor: string;
  data_resgate: string | null;
  total_parcelas: number;
  parcelas_entregues: boolean[];
  parcelas_detalhes: ProcessoParcelaDetalhe[];
  critico: boolean;
  cancelado: boolean;
  ignorado: boolean;
  ativo?: boolean;
  criado_em?: string;
  atualizado_em?: string;
}

export interface ProcessoProdutoLookup {
  cod_bionexo: string;
  cd_produto: string;
  ds_produto: string;
  categoria_material: CategoriaMaterial;
  estoque_atual?: number;
  suficiencia_em_dias?: number;
}

export type ProcessoSaveInput = Omit<
  ProcessoAcompanhamento,
  'id' | 'ignorado' | 'ativo' | 'criado_em' | 'atualizado_em'
> & {
  id?: string;
  ignorado?: boolean;
};

export interface NotaFiscalResumo {
  nota_fiscal_id: string;
  lote_importacao_atual_id: string | null;
  data_referencia: string | null;
  importado_em: string | null;
  unidade_id: string;
  codigo_unidade: string;
  nome_unidade: string;
  unidade_origem_siscore: string;
  nome_fornecedor: string;
  numero_documento: string;
  data_entrada: string;
  status_sincronizacao: NotaFiscalStatusSincronizacao;
  status_conferencia: NotaFiscalStatusConferencia;
  possui_item_duplicado: boolean;
  quantidade_itens: number;
  quantidade_itens_duplicados: number;
  quantidade_entrada_total: number;
  valor_total_nota: number;
  ultima_vez_vista_em: string;
  removida_em: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface NotaFiscalItem {
  nota_fiscal_id: string;
  status_sincronizacao: NotaFiscalStatusSincronizacao;
  status_conferencia: NotaFiscalStatusConferencia;
  possui_item_duplicado: boolean;
  nome_fornecedor: string;
  numero_documento: string;
  data_entrada: string;
  unidade_id: string;
  codigo_unidade: string;
  nome_unidade: string;
  nota_fiscal_item_id: string;
  sequencia_item: number;
  linha_origem: number;
  codigo_produto: string;
  descricao_produto: string;
  quantidade_entrada: number | null;
  valor_unitario: number | null;
  valor_total: number | null;
  descricao_especie: string | null;
  duplicado_na_nota: boolean;
  produto_unidade_id: string | null;
  categoria_material?: CategoriaMaterial | null;
  nome_produto_vinculado?: string | null;
  criado_em: string;
  atualizado_em: string;
}
