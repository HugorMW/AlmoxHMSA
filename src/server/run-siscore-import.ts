import { lerCredencialSiscoreUsuario, registrarUsoCredencialSiscoreUsuario } from '@/server/siscore-credential-store';
import { getSupabaseAdmin } from '@/server/supabase-admin';
import {
  agruparNotasFiscais,
  autenticarSiscore,
  baixarPlanilhaSiscore,
  COLUNAS_OBRIGATORIAS_ESTOQUE,
  COLUNAS_OBRIGATORIAS_NOTAS_FISCAIS,
  lerLinhasDaPlanilha,
  normalizarLinhasEstoque,
  normalizarLinhasNotasFiscais,
  obterConfiguracaoNotasFiscais,
  obterConfiguracoesExportacao,
} from '@/server/siscore-sync-core';

export type SiscoreSyncScope =
  | 'all'
  | 'estoque'
  | 'material_hospitalar'
  | 'material_farmacologico'
  | 'notas_fiscais';

export async function executarImportacaoSiscoreDoUsuario(usuario: string, scope: SiscoreSyncScope = 'all') {
  const credencial = await lerCredencialSiscoreUsuario(usuario);

  if (!credencial) {
    throw new Error('Nao existe credencial SISCORE salva para este usuario.');
  }

  const siscoreBaseUrl = String(process.env.SISCORE_BASE_URL ?? '').trim();
  const configuracoesExportacao = obterConfiguracoesExportacao(process.env);
  const configuracaoNotasFiscais = obterConfiguracaoNotasFiscais(process.env);

  if (!siscoreBaseUrl || !configuracoesExportacao.length) {
    throw new Error(
      'Preencha SISCORE_BASE_URL e ao menos uma URL de exportacao do SISCORE no ambiente publicado.'
    );
  }

  const cookieJar = await autenticarSiscore({
    baseUrl: siscoreBaseUrl,
    usuario: credencial.usuario,
    senha: credencial.senha,
  });

  await registrarUsoCredencialSiscoreUsuario(credencial.usuario);

  const supabase = getSupabaseAdmin() as any;
  const sucessos: Array<{ categoria: string; loteId: string; quantidade: number }> = [];
  const falhas: Array<{ categoria: string; message: string }> = [];
  const configuracoesSelecionadas =
    scope === 'all' || scope === 'estoque'
      ? configuracoesExportacao
      : configuracoesExportacao.filter((config) => config.categoria_material === scope);

  for (const configuracao of configuracoesSelecionadas) {
    try {
      const { buffer, nomeArquivo } = await baixarPlanilhaSiscore({
        baseUrl: siscoreBaseUrl,
        exportacaoUrl: configuracao.exportacaoUrl,
        cookieJar,
      });

      const rawRows = lerLinhasDaPlanilha(buffer, COLUNAS_OBRIGATORIAS_ESTOQUE);
      const rows = normalizarLinhasEstoque(rawRows, configuracao.categoria_material);

      const { data, error } = await supabase.rpc('importar_estoque_siscore', {
        p_rows: rows,
        p_nome_arquivo: nomeArquivo,
        p_categoria_material: configuracao.categoria_material,
        p_exportacao_url: configuracao.exportacaoUrl,
      });

      if (error) {
        throw new Error(error.message);
      }

      sucessos.push({
        categoria: configuracao.descricao,
        loteId: String(data),
        quantidade: rows.length,
      });
    } catch (error) {
      falhas.push({
        categoria: configuracao.descricao,
        message: error instanceof Error ? error.message : 'Falha interna na importacao.',
      });
    }
  }

  if (scope === 'all' || scope === 'notas_fiscais') {
    try {
      const { buffer, nomeArquivo } = await baixarPlanilhaSiscore({
        baseUrl: siscoreBaseUrl,
        exportacaoUrl: configuracaoNotasFiscais.exportacaoUrl,
        cookieJar,
      });

      const rawRows = lerLinhasDaPlanilha(buffer, COLUNAS_OBRIGATORIAS_NOTAS_FISCAIS);
      const rows = normalizarLinhasNotasFiscais(rawRows);
      const notasFiscais = agruparNotasFiscais(rows);

      const { data, error } = await supabase.rpc('importar_notas_fiscais_siscore', {
        p_notas: notasFiscais,
        p_nome_arquivo: nomeArquivo,
        p_exportacao_url: configuracaoNotasFiscais.exportacaoUrl,
      });

      if (error) {
        throw new Error(error.message);
      }

      sucessos.push({
        categoria: configuracaoNotasFiscais.descricao,
        loteId: String(data?.loteId ?? ''),
        quantidade: Number(data?.quantidadeLinhas ?? 0),
      });
    } catch (error) {
      falhas.push({
        categoria: configuracaoNotasFiscais.descricao,
        message: error instanceof Error ? error.message : 'Falha interna na importacao.',
      });
    }
  }

  if (falhas.length) {
    throw new Error(
      `Algumas importacoes falharam: ${falhas.map((falha) => `${falha.categoria} (${falha.message})`).join('; ')}`
    );
  }

  const estoqueAtualizado =
    scope === 'all' ||
    scope === 'estoque' ||
    scope === 'material_hospitalar' ||
    scope === 'material_farmacologico';

  if (estoqueAtualizado && sucessos.length > 0) {
    try {
      const { error: snapshotError } = await supabase.rpc('registrar_snapshot_estoque_diario');
      if (snapshotError) {
        console.warn('Falha ao registrar snapshot diario do estoque:', snapshotError.message);
      }
    } catch (snapshotException) {
      console.warn(
        'Excecao ao registrar snapshot diario do estoque:',
        snapshotException instanceof Error ? snapshotException.message : snapshotException
      );
    }
  }

  return {
    usuario: credencial.usuario,
    sucessos,
    falhas,
  };
}
