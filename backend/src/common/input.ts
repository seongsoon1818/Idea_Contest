import { invalid } from "./errors.js";

export function objectInput(
  value: unknown,
  keys: readonly string[],
  path = "body",
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalid(path, "객체가 필요합니다.");
  const object = value as Record<string, unknown>;
  for (const key of Object.keys(object)) {
    if (!keys.includes(key))
      invalid(
        path === "body" ? key : path + "." + key,
        "허용하지 않는 필드입니다.",
        "UNKNOWN_FIELD",
      );
  }
  return object;
}

export function textInput(value: unknown, field: string, max: number): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    [...value.trim()].length > max
  )
    invalid(field, "1~" + max + "자 문자열이 필요합니다.");
  return value.trim();
}

export function nameInput(value: unknown): string {
  const name = textInput(
    typeof value === "string" ? value.normalize("NFC") : value,
    "name",
    30,
  );
  const nameFormat = /^\p{L}[\p{L}\p{M}]*(?:[ '’·-]\p{L}[\p{L}\p{M}]*)*$/u;
  if (
    !nameFormat.test(name) ||
    /[\p{Extended_Pictographic}\uFE0F\u20E3]/u.test(name)
  )
    invalid(
      "name",
      "이름에는 글자와 악센트, 글자 사이의 공백·하이픈·아포스트로피·가운뎃점을 사용할 수 있습니다.",
    );
  return name;
}

export function idInput(value: unknown, field: string): bigint {
  if (
    typeof value !== "string" ||
    !/^[1-9][0-9]{0,19}$/.test(value) ||
    BigInt(value) > 18446744073709551615n
  )
    invalid(field, "양의 정수 ID 문자열이 필요합니다.");
  return BigInt(value);
}

export function enumInput<T extends string>(
  value: unknown,
  values: readonly T[],
  field: string,
): T {
  if (typeof value !== "string" || !values.includes(value as T))
    invalid(field, "허용된 값: " + values.join(", "));
  return value as T;
}
