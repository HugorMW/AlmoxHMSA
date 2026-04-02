update almox.nota_fiscal
set status_sincronizacao = 'ativo',
    atualizado_em = now()
where status_sincronizacao = 'reativado';

update almox.lote_importacao_notas_fiscais
set metadados =
      jsonb_set(
        jsonb_set(
          coalesce(metadados, '{}'::jsonb),
          '{notas_ativas}',
          to_jsonb(quantidade_notas)
        ),
        '{notas_reativadas}',
        '0'::jsonb
      )
where status = 'processado'
  and coalesce((metadados ->> 'notas_reativadas')::integer, 0) = quantidade_notas
  and coalesce((metadados ->> 'notas_ativas')::integer, 0) = 0
  and coalesce((metadados ->> 'notas_alteradas')::integer, 0) = 0
  and coalesce((metadados ->> 'notas_removidas_no_siscore')::integer, 0) = 0;
