import { Prisma } from "../generated/prisma/client.js";

// JSON_SEARCH also descends into objects. Only "$[n]" denotes a displayed
// string in the supplied array, including arrays projected with JSON_EXTRACT.
const elementPath = String.raw`"\$\[[0-9]+\]"`;

export function jsonArrayContains(array: Prisma.Sql, term: string) {
  const pattern = "%" + term.replace(/[!%_]/g, "!$&") + "%";
  return Prisma.sql`REGEXP_LIKE(
    JSON_SEARCH(${array}, 'all', CONVERT(${pattern} USING utf8mb4) COLLATE utf8mb4_0900_as_ci, '!'),
    ${elementPath}, 'c')`;
}
