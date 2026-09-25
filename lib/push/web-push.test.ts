import { describe, it, expect } from "vitest";
import { createDecipheriv, createECDH, createHmac, createPublicKey, verify } from "crypto";
import { encryptPayload, generateVapidKeys, isAllowedPushEndpoint, vapidAuthorization } from "./web-push";
import { deviceLabel } from "./device-label";

// RFC 8291 Appendix A: the worked example, with its fixed keys and salt.
const RFC = {
  plaintext: "When I grow up, I want to be a watermelon",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  uaPrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  message:
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

const hmac = (key: Buffer, data: Buffer) => createHmac("sha256", key).update(data).digest();

/** The browser's side of RFC 8291, to prove a real random-salt message opens. */
function decrypt(body: Buffer, uaPrivate: string, uaPublic: string, auth: string): Buffer {
  const salt = body.subarray(0, 16);
  const idlen = body.readUInt8(20);
  const asPublic = body.subarray(21, 21 + idlen);
  const record = body.subarray(21 + idlen);
  const ua = createECDH("prime256v1");
  ua.setPrivateKey(Buffer.from(uaPrivate, "base64url"));
  const secret = ua.computeSecret(asPublic);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), Buffer.from(uaPublic, "base64url"), asPublic]);
  const ikm = hmac(hmac(Buffer.from(auth, "base64url"), secret), Buffer.concat([keyInfo, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01")).subarray(0, 12);
  const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(record.subarray(record.length - 16));
  const padded = Buffer.concat([decipher.update(record.subarray(0, record.length - 16)), decipher.final()]);
  expect(padded[padded.length - 1]).toBe(0x02);
  return padded.subarray(0, padded.length - 1);
}

describe("encryptPayload", () => {
  it("reproduces RFC 8291's example message byte for byte", () => {
    const body = encryptPayload({ p256dh: RFC.uaPublic, auth: RFC.auth }, Buffer.from(RFC.plaintext), {
      salt: Buffer.from(RFC.salt, "base64url"),
      senderPrivateKey: Buffer.from(RFC.asPrivate, "base64url"),
    });
    expect(body.toString("base64url")).toBe(RFC.message);
  });

  it("produces a message the browser can open, with a fresh salt and key each time", () => {
    const a = encryptPayload({ p256dh: RFC.uaPublic, auth: RFC.auth }, Buffer.from("hello"));
    const b = encryptPayload({ p256dh: RFC.uaPublic, auth: RFC.auth }, Buffer.from("hello"));
    expect(a.equals(b)).toBe(false);
    expect(decrypt(a, RFC.uaPrivate, RFC.uaPublic, RFC.auth).toString()).toBe("hello");
  });

  it("refuses keys that aren't keys", () => {
    expect(() => encryptPayload({ p256dh: "AAAA", auth: RFC.auth }, Buffer.from("x"))).toThrow();
    expect(() => encryptPayload({ p256dh: RFC.uaPublic, auth: "AAAA" }, Buffer.from("x"))).toThrow();
  });
});

describe("vapidAuthorization", () => {
  it("signs an ES256 token for the push service's origin that verifies with the public key", () => {
    const keys = generateVapidKeys();
    const header = vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc", keys, "https://marquee.example.com", 1_790_000_000_000);
    const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
    expect(match).not.toBeNull();
    const [, h, c, sig, k] = match!;
    expect(k).toBe(keys.publicKey);
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ typ: "JWT", alg: "ES256" });
    expect(JSON.parse(Buffer.from(c, "base64url").toString())).toEqual({
      aud: "https://fcm.googleapis.com",
      exp: 1_790_000_000 + 12 * 60 * 60,
      sub: "https://marquee.example.com",
    });
    const point = Buffer.from(keys.publicKey, "base64url");
    const publicKey = createPublicKey({
      format: "jwk",
      key: { kty: "EC", crv: "P-256", x: point.subarray(1, 33).toString("base64url"), y: point.subarray(33).toString("base64url") },
    });
    expect(
      verify("sha256", Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url")),
    ).toBe(true);
  });
});

describe("isAllowedPushEndpoint", () => {
  it("accepts the push services browsers use", () => {
    for (const endpoint of [
      "https://fcm.googleapis.com/fcm/send/abc:def",
      "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
      "https://web.push.apple.com/QGuQyavXutnMei",
      "https://wns2-par02p.notify.windows.com/w/?token=BQYAAA",
    ]) {
      expect(isAllowedPushEndpoint(endpoint)).toBe(true);
    }
  });

  it("refuses anything that could point the server somewhere else", () => {
    for (const endpoint of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com:8443/fcm/send/abc",
      "https://evilfcm.googleapis.com.attacker.net/x",
      "https://192.168.1.1/admin",
      "https://localhost/push",
      "not a url",
    ]) {
      expect(isAllowedPushEndpoint(endpoint)).toBe(false);
    }
  });
});

describe("deviceLabel", () => {
  it("names the browser and the device", () => {
    expect(
      deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"),
    ).toBe("Safari on iPhone");
    expect(
      deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0"),
    ).toBe("Edge on Windows");
    expect(deviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:130.0) Gecko/20100101 Firefox/130.0")).toBe("Firefox on macOS");
    expect(deviceLabel(null)).toBeNull();
  });
});
