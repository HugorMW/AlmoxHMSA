delete from almox.configuracao_sistema
where codigo_unidade is null
  and chave in ('leadTimeCompraDias', 'margemSegurancaDias');
