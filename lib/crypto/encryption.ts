import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getMasterKey(): Buffer {
  const raw = process.env.MASTER_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("MASTER_ENCRYPTION_KEY is not set");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("MASTER_ENCRYPTION_KEY must decode to exactly 32 bytes");
  }
  return key;
}

export type EncryptedField = {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
};

export function encryptSecret(plaintext: string): EncryptedField {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getMasterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext, iv, tag };
}

export function decryptSecret(field: EncryptedField): string {
  const decipher = createDecipheriv(ALGORITHM, getMasterKey(), field.iv);
  decipher.setAuthTag(field.tag);
  const plaintext = Buffer.concat([decipher.update(field.ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
