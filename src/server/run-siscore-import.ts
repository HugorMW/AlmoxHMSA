import { lerCredencialSiscoreUsuario, registrarUsoCredencialSiscoreUsuario } from '@/server/siscore-credential-store';
import { getSupabaseAdmin } from '@/server/supabase-admin';

export async function executarImportacaoSiscoreDoUsuario(usuario: string) {
  const importer: any = await import('../../scripts/importar-siscore.mjs');
  const credencial = await lerCredencialSiscoreUsuario(usuario);

  if (!credencial) {
    throw new Error('Nao existe credencial SISCORE salva para este usuario.');
  }

  const siscoreBaseUrl = String(process.env.SISCORE_BASE_URL ?? '').trim();
  const configuracoesExportacao = importer.obterConfiguracoesExportacao(process.env);
  const configuracaoNotasFiscais = importer.obterConfiguracaoNotasFiscais(process.env);

  if (!siscoreBaseUrl || !configuracoesExportacao.length) {
    throw new Error(
      'Preencha SISCORE_BASE_URL e ao menos uma URL de exportacao do SISCORE no ambiente publicado.'
    );
  }

  const cookieJar = await importer.autenticarSiscore({
    baseUrl: siscoreBaseUrl,
    usuario: credencial.usuario,
    senha: credencial.senha,
  });

  await registrarUsoCredencialSiscoreUsuario(credencial.usuario);

  const supabase = getSupabaseAdmin() as any;
  const sucessos: Array<{ categoria: string; loteId: string; quantidade: number }> = [];
  const falhas: Array<{ categoria: string; message: string }> = [];

  for (const configuracao of configuracoesExportacao) {
    try {
      const { buffer, nomeArquivo } = await importer.baixarPlanilhaSiscore({
        baseUrl: siscoreBaseUrl,
        exportacaoUrl: configuracao.exportacaoUrl,
        cookieJar,
      });

      const rawRows = importer.lerLinhasDaPlanilha(buffer, importer.COLUNAS_OBRIGATORIAS_ESTOQUE);
      const rows = importer.normalizarLinhasEstoque(rawRows, configuracao.categoria_material);

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

  try {
    const { buffer, nomeArquivo } = await importer.baixarPlanilhaSiscore({
      baseUrl: siscoreBaseUrl,
      exportacaoUrl: configuracaoNotasFiscais.exportacaoUrl,
      cookieJar,
    });

    const rawRows = importer.lerLinhasDaPlanilha(buffer, importer.COLUNAS_OBRIGATORIAS_NOTAS_FISCAIS);
    const rows = importer.normalizarLinhasNotasFiscais(rawRows);
    const notasFiscais = importer.agruparNotasFiscais(rows);

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

  if (falhas.length) {
    throw new Error(
      `Algumas importacoes falharam: ${falhas.map((falha) => `${falha.categoria} (${falha.message})`).join('; ')}`
    );
  }

  return {
    usuario: credencial.usuario,
    sucessos,
    falhas,
  };
}
