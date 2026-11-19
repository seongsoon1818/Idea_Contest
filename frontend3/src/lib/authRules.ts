// Keep these rules identical to the account server.
export function usernameError(value: string) {
  if (!value) return '아이디를 입력해 주세요.';
  if (!/^[A-Za-z0-9]+$/.test(value)) return '아이디는 영문·숫자만 사용할 수 있어요.';
  if (value.length < 4 || value.length > 20) return '아이디는 4~20자로 입력해 주세요.';
  return '';
}
export function passwordError(value: string) {
  if (!value) return '비밀번호를 입력해 주세요.';
  if (!/^[\x21-\x7E]+$/.test(value)) return '비밀번호에 한글·공백을 사용할 수 없어요.';
  if (value.length < 8 || value.length > 32) return '비밀번호는 8~32자로 입력해 주세요.';
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value) || !/[!-/:-@[-`{-~]/.test(value)) return '영문·숫자·특수문자를 각각 1개 이상 포함해 주세요.';
  return '';
}
export function confirmationError(password: string, confirmation: string) {
  if (!confirmation) return '비밀번호를 다시 입력해 주세요.';
  return password === confirmation ? '' : '비밀번호가 일치하지 않아요.';
}
// Backend name rule (backend/src/common/input.ts nameInput).
export const NAME_PATTERN = /^\p{L}[\p{L}\p{M}]*(?:[ '’·-]\p{L}[\p{L}\p{M}]*)*$/u;
