/** Estado de qualquer bloco que depende de dados. O catálogo mostra os quatro. */
export type ViewStatus = "ready" | "loading" | "empty" | "error";

export type Scope = "PF" | "PJ";

export type ScopeFilter = "TUDO" | Scope;
