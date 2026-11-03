import "dotenv/config";

export function securityConfig() {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32)
    throw new Error("JWT_SECRET은 32바이트 이상의 무작위 비밀값이어야 합니다.");
  const production = process.env.NODE_ENV === "production";
  const configured =
    process.env.ALLOWED_ORIGINS ??
    (production ? "" : "http://localhost:8080,http://localhost:3000");
  const origins = new Set(
    configured
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  if (!origins.size) throw new Error("ALLOWED_ORIGINS를 설정하세요.");
  for (const origin of origins) {
    const url = new URL(origin);
    if (
      origin !== url.origin ||
      !(production ? ["https:"] : ["http:", "https:"]).includes(url.protocol)
    )
      throw new Error(
        "ALLOWED_ORIGINS에는 경로 없는 정확한 origin만 지정하세요.",
      );
  }
  return { key: new TextEncoder().encode(secret), production, origins };
}
