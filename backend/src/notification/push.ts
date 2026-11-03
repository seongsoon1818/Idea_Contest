import { createECDH, ECDH, createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { Agent } from "node:https";
import { lookup } from "node:dns";
import { BlockList } from "node:net";
import webpush from "web-push";
import { invalid } from "../common/errors.js";
import { objectInput, textInput } from "../common/input.js";

function bytes(value: unknown, n: number, field: string) {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9_-]+$/.test(value) ||
    value.length > 128
  )
    invalid(field, "base64url 키 형식이 잘못되었습니다.");
  const buf = Buffer.from(value, "base64url");
  if (buf.length !== n || buf.toString("base64url") !== value)
    invalid(field, "키 길이 또는 형식이 잘못되었습니다.");
  return buf;
}
export function allowedEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 4096 || /[\s\\#]/.test(value))
    return false;
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return false;
  }
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port ||
    !value.startsWith("https://" + u.host + "/") ||
    u.pathname === "/"
  )
    return false;
  const h = u.hostname;
  return (
    h === "fcm.googleapis.com" ||
    h === "updates.push.services.mozilla.com" ||
    h.endsWith(".push.services.mozilla.com") ||
    h === "web.push.apple.com" ||
    h.endsWith(".notify.windows.com")
  );
}
export function subscriptionInput(raw: unknown) {
  const b = objectInput(raw, [
    "endpoint",
    "expirationTime",
    "keys",
    "deviceLabel",
  ]);
  if (!allowedEndpoint(b.endpoint))
    invalid("endpoint", "지원하는 푸시 공급자의 HTTPS 구독 URL이 필요합니다.");
  const keys = objectInput(b.keys, ["p256dh", "auth"], "keys");
  const pub = bytes(keys.p256dh, 65, "keys.p256dh");
  try {
    if (pub[0] !== 4) throw new Error();
    ECDH.convertKey(pub, "prime256v1");
  } catch {
    invalid("keys.p256dh", "유효한 P-256 공개키가 필요합니다.");
  }
  const auth = bytes(keys.auth, 16, "keys.auth").toString("base64url");
  const t = b.expirationTime;
  if (
    t !== null &&
    (typeof t !== "number" ||
      !Number.isSafeInteger(t) ||
      t <= Date.now() ||
      t > 253402300799999)
  )
    invalid("expirationTime", "미래의 Unix 밀리초 또는 null이 필요합니다.");
  return {
    endpoint: b.endpoint,
    endpointHash: createHash("sha256").update(b.endpoint).digest("hex"),
    p256dh: pub.toString("base64url"),
    auth,
    expirationAt: t === null ? null : new Date(t),
    ...(b.deviceLabel !== undefined
      ? {
          deviceLabel:
            b.deviceLabel === null
              ? null
              : textInput(b.deviceLabel, "deviceLabel", 100),
        }
      : {}),
  };
}
@Injectable()
export class PushTransport {
  private readonly vapid = readVapid();
  private readonly agent = new Agent({
    lookup(host, options, cb) {
      // Resolve once for this connection. Never pass a private address to the socket.
      lookup(host, { ...options, all: true }, (err, addresses) => {
        if (
          err ||
          !addresses.length ||
          addresses.some(({ address, family }) =>
            family === 4
              ? blocked.check(address, "ipv4")
              : !globalV6.check(address, "ipv6") ||
                blocked.check(address, "ipv6"),
          )
        )
          return cb(
            err ?? new Error("허용되지 않은 푸시 공급자 주소입니다."),
            "",
          );
        const first = addresses[0]!;
        if (options.all) cb(null, addresses);
        else cb(null, first.address, first.family);
      });
    },
  });
  config() {
    return {
      enabled: !!this.vapid,
      vapidPublicKey: this.vapid?.publicKey ?? null,
    };
  }
  send(sub: webpush.PushSubscription, payload: string, ttl: number) {
    if (!this.vapid || !allowedEndpoint(sub.endpoint))
      throw new Error("푸시 발송 설정을 확인하세요.");
    return webpush.sendNotification(sub, payload, {
      vapidDetails: this.vapid,
      TTL: ttl,
      timeout: 10_000,
      agent: this.agent,
    });
  }
}
const blocked = new BlockList();
for (const [net, bits] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
] as const)
  blocked.addSubnet(net, bits, "ipv4");
blocked.addSubnet("2001::", 23, "ipv6");
blocked.addSubnet("2001:db8::", 32, "ipv6");
blocked.addSubnet("2002::", 16, "ipv6");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
function readVapid() {
  const {
    VAPID_PUBLIC_KEY: publicKey,
    VAPID_PRIVATE_KEY: privateKey,
    VAPID_SUBJECT: subject,
  } = process.env;
  if (!publicKey && !privateKey && !subject) return null;
  try {
    if (
      !publicKey ||
      !privateKey ||
      !subject ||
      !/^(mailto:|https:\/\/)/.test(subject)
    )
      throw new Error();
    const key = createECDH("prime256v1");
    key.setPrivateKey(bytes(privateKey, 32, "VAPID_PRIVATE_KEY"));
    if (key.getPublicKey().toString("base64url") !== publicKey)
      throw new Error();
    webpush.getVapidHeaders(
      "https://fcm.googleapis.com",
      subject,
      publicKey,
      privateKey,
      "aes128gcm",
    );
    return { publicKey, privateKey, subject };
  } catch {
    throw new Error(
      "유효한 VAPID 키 쌍과 연락처(VAPID_SUBJECT)를 함께 설정하세요.",
    );
  }
}
