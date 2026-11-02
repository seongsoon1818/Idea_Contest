import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { invalid } from "../common/errors.js";

export function loginIdInput(value: unknown) {
  if (typeof value !== "string" || !/^[A-Za-z0-9]{4,20}$/.test(value))
    invalid("loginId", "영문·숫자 4~20자를 입력하세요.");
  return value.toLowerCase();
}
export function passwordInput(
  value: unknown,
  field: string,
  newPassword = false,
) {
  if (typeof value !== "string" || !value.length || value.length > 256)
    invalid(field, "비밀번호를 입력하세요.");
  if (
    newPassword &&
    (!/^[!-~]{8,32}$/.test(value) ||
      !/[A-Za-z]/.test(value) ||
      !/[0-9]/.test(value) ||
      !/[^A-Za-z0-9]/.test(value))
  )
    invalid(
      field,
      "영문·숫자·기호를 포함한 공백 없는 ASCII 8~32자가 필요합니다.",
    );
  return value;
}

// scrypt-v1 fixes the work parameters, so a stored hash cannot request unbounded memory.
function derive(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(
      password,
      salt,
      32,
      { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  return [
    "scrypt-v1",
    salt.toString("base64url"),
    (await derive(password, salt)).toString("base64url"),
  ].join("$");
}
export async function verifyPassword(password: string, encoded?: string) {
  const match = /^scrypt-v1\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{43})$/.exec(
    encoded ?? "",
  );
  const key = await derive(
    password,
    match ? Buffer.from(match[1]!, "base64url") : Buffer.alloc(16),
  );
  return !!match && timingSafeEqual(key, Buffer.from(match[2]!, "base64url"));
}
