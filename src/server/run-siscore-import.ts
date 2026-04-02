export async function executarImportacaoSiscoreDoUsuario(usuario: string) {
  const importer = await import('../../scripts/importar-siscore.mjs');

  if (typeof importer.runSiscoreImport !== 'function') {
    throw new Error('O importador do SISCORE nao expoe uma funcao executavel no servidor.');
  }

  return importer.runSiscoreImport({
    rootDir: process.cwd(),
    usuarioSessao: usuario,
    envOverrides: {
      SISCORE_CREDENTIALS_USUARIO: usuario,
      SISCORE_USUARIO: usuario,
      SISCORE_SENHA: '',
    },
  });
}
