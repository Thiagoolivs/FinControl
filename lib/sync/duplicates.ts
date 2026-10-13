// Puro: sem banco. Detecta o mesmo banco conectado duas vezes (dois itens da Pluggy com as mesmas contas).

export type AccountIdentity = { connectionId: string | null; type: string; name: string; number: string | null; currency: string };

const digits = (value: string | null) => (value ?? "").replace(/\D/g, "");
const normalizeName = (name: string) =>
  name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * Conexões que trazem a mesma conta: mesmo tipo, nome, número e moeda em conexões diferentes. Assim o saldo
 * e os gastos contam duas vezes. Conta sem número fica de fora (não dá para afirmar que é a mesma).
 * Devolve, para cada conexão repetida, as outras conexões que repetem contas dela.
 */
export function duplicateConnections(accounts: readonly AccountIdentity[]): Map<string, string[]> {
  const byAccount = new Map<string, Set<string>>();
  for (const account of accounts) {
    const number = digits(account.number);
    if (!account.connectionId || !number) continue;
    const key = [account.type, normalizeName(account.name), number, account.currency].join("|");
    const connections = byAccount.get(key) ?? new Set<string>();
    connections.add(account.connectionId);
    byAccount.set(key, connections);
  }
  const result = new Map<string, Set<string>>();
  for (const connections of byAccount.values()) {
    if (connections.size < 2) continue;
    for (const connection of connections) {
      const others = result.get(connection) ?? new Set<string>();
      for (const other of connections) if (other !== connection) others.add(other);
      result.set(connection, others);
    }
  }
  return new Map([...result].map(([connection, others]) => [connection, [...others].sort()]));
}
