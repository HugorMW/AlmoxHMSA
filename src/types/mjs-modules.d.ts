declare module '*.mjs' {
  export function runSiscoreImport(options?: {
    rootDir?: string;
    usuarioSessao?: string;
    envOverrides?: Record<string, string>;
  }): Promise<unknown>;
}
