-- A Pluggy manda em automaticallyInvestedBalance o saldo disponível JÁ SOMADO ao aplicado (Open Finance:
-- "saldo disponível com aplicação automática"). O sync gravava o valor inteiro e o app somava de novo ao
-- saldo, dobrando-o. Guarda só a parte aplicada, como o sync passa a fazer.
UPDATE "Account"
SET "autoInvestedCents" = GREATEST(0, "autoInvestedCents" - "balanceCents")
WHERE "autoInvestedCents" <> 0;
