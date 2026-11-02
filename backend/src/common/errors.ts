export type FieldError = { field: string; code: string; message: string };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fieldErrors: FieldError[] = [],
  ) {
    super(message);
  }
}

export function invalid(
  field: string,
  message: string,
  code = "INVALID",
): never {
  throw new ApiError(400, "VALIDATION_ERROR", "입력값을 확인해 주세요.", [
    { field, code, message },
  ]);
}

export const revoked = () =>
  new ApiError(
    401,
    "SESSION_REVOKED",
    "세션이 만료되었습니다. 다시 로그인해 주세요.",
  );
export const disabled = () =>
  new ApiError(403, "ACCOUNT_DISABLED", "사용할 수 없는 계정입니다.");
export const reauthFailed = () =>
  new ApiError(403, "REAUTH_FAILED", "현재 비밀번호를 확인해 주세요.");
