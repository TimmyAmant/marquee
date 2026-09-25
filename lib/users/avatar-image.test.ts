import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { AVATAR_MAX_UPLOAD_BYTES, AVATAR_SIZE, processAvatar, readAvatarUpload } from "./avatar-image";
import { avatarPath } from "./avatar-path";

function solid(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 60, b: 40 } } });
}

describe("processAvatar", () => {
  it("crops any photo to a square JPEG", async () => {
    const input = await solid(1200, 800).png().toBuffer();
    const result = await processAvatar(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const meta = await sharp(result.image).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(AVATAR_SIZE);
    expect(meta.height).toBe(AVATAR_SIZE);
  });

  it("drops the original's metadata, GPS and all", async () => {
    const input = await solid(600, 600)
      .jpeg()
      .withExif({ IFD0: { Make: "PhoneCo", Model: "Snapper 9" }, IFD3: { GPSLatitudeRef: "N" } })
      .toBuffer();
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const result = await processAvatar(input);
    expect(result.ok && (await sharp(result.image).metadata()).exif).toBeFalsy();
  });

  it("turns a sideways phone photo the right way up before cropping", async () => {
    // 400 wide, 200 tall, with orientation 6 (rotate 90° clockwise to view).
    const input = await solid(400, 200).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const result = await processAvatar(input);
    expect(result.ok).toBe(true);
    if (result.ok) expect((await sharp(result.image).metadata()).orientation).toBeUndefined();
  });

  it("refuses what isn't a photo", async () => {
    for (const input of [
      new Uint8Array(),
      new TextEncoder().encode("not an image"),
      new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'),
    ]) {
      expect((await processAvatar(input)).ok).toBe(false);
    }
  });

  it("refuses an upload over the limit without decoding it", async () => {
    const result = await processAvatar(new Uint8Array(AVATAR_MAX_UPLOAD_BYTES + 1));
    expect(result).toEqual({ ok: false, code: "invalid", error: "That photo is too big. Pick one under 15 MB." });
  });
});

describe("readAvatarUpload", () => {
  it("reads the whole body", async () => {
    const result = await readAvatarUpload(new Request("http://x/", { method: "PUT", body: new Uint8Array([1, 2, 3]) }));
    expect(result.ok && Array.from(result.bytes)).toEqual([1, 2, 3]);
  });

  it("refuses a declared length over the limit up front", async () => {
    const request = new Request("http://x/", {
      method: "PUT",
      body: new Uint8Array(4),
      headers: { "content-length": String(AVATAR_MAX_UPLOAD_BYTES + 1) },
    });
    expect((await readAvatarUpload(request)).ok).toBe(false);
  });

  it("stops reading a body that runs past the limit", async () => {
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += chunk.byteLength;
        controller.enqueue(chunk);
        if (sent > AVATAR_MAX_UPLOAD_BYTES * 2) controller.close();
      },
    });
    const request = new Request("http://x/", { method: "PUT", body, duplex: "half" } as RequestInit);
    expect((await readAvatarUpload(request)).ok).toBe(false);
    expect(sent).toBeLessThan(AVATAR_MAX_UPLOAD_BYTES * 2);
  });
});

describe("avatarPath", () => {
  it("is null without a photo, and versioned with one", () => {
    const id = "40c1c52f-d7f4-4716-bbc6-f604f39d43e6";
    expect(avatarPath({ id, avatarUpdatedAt: null }, "/api/v1")).toBeNull();
    const at = new Date(1790334036549);
    expect(avatarPath({ id, avatarUpdatedAt: at }, "/api/v1")).toBe(`/api/v1/users/${id}/avatar?v=1790334036549`);
    expect(avatarPath({ id, avatarUpdatedAt: at }, "/api")).toBe(`/api/avatars/${id}?v=1790334036549`);
  });
});
