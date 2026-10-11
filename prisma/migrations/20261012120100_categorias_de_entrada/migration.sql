-- Árvore "Entradas" (tipo RECEITA) para quem já tinha categorias; quem chega agora recebe pelo seed
-- (lib/categorization/defaults.ts, mesmos nomes). Separada da migration que cria o valor do enum:
-- o Postgres não deixa usar um valor novo de enum na mesma transação em que ele foi criado.
WITH owners AS (
  SELECT DISTINCT c."userId"
  FROM "Category" c
  WHERE c."kind" <> 'TRANSFERENCIA'
    AND NOT EXISTS (SELECT 1 FROM "Category" r WHERE r."userId" = c."userId" AND (r."kind" = 'RECEITA' OR (r."parentId" IS NULL AND r."name" = 'Entradas')))
),
parents AS (
  INSERT INTO "Category" ("id", "userId", "parentId", "name", "icon", "color", "kind", "createdAt", "updatedAt")
  SELECT gen_random_uuid()::text, "userId", NULL, 'Entradas', 'arrow-in', 'neutral', 'RECEITA', now(), now()
  FROM owners
  RETURNING "id", "userId"
)
INSERT INTO "Category" ("id", "userId", "parentId", "name", "icon", "color", "kind", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, p."userId", p."id", child."name", 'arrow-in', 'neutral', 'RECEITA', now(), now()
FROM parents p
CROSS JOIN (
  VALUES ('Reembolso'), ('Rendimentos'), ('Pix e presentes recebidos'), ('Venda de algo'), ('Cashback e prêmios'), ('Outras entradas')
) AS child("name");
