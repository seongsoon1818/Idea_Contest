import { invalid } from "../common/errors.js";
export async function notificationPage<T>(
  q: Record<string, string>,
  count: () => Promise<number>,
  fetch: (skip: number, take: number) => Promise<T[]>,
) {
  const positive = (key: string, fallback: number, max: number) => {
    const raw = q[key];
    if (raw === undefined) return fallback;
    const n = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(n) || n < 1 || n > max)
      invalid(key, "허용 범위의 양의 정수가 필요합니다.");
    return n;
  };
  const page = positive("page", 1, Number.MAX_SAFE_INTEGER),
    size = positive("size", 20, 100);
  const totalItems = await count(),
    totalPages = Math.ceil(totalItems / size);
  return {
    items: page <= totalPages ? await fetch((page - 1) * size, size) : [],
    pagination: {
      page,
      size,
      totalItems,
      totalPages,
      hasNext: page < totalPages,
    },
  };
}
