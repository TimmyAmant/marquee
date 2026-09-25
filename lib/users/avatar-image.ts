import sharp from "sharp";
import { fail, type CoreResult } from "@/lib/core-result";

// The image half of profile photos (lib/users/avatar.ts has the storage
// half): reading an upload and turning it into the stored copy. No database
// imports, so it's unit tested directly.

/** Uploads bigger than this are refused before any decoding. A phone photo
 * straight off the camera fits; the stored copy is far smaller. */
export const AVATAR_MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/** The stored copy is a square this many pixels on a side: enough for a 2x
 * display at the largest size any client shows it (the 38pt menu avatar is
 * the biggest today), small enough to serve on every page. */
export const AVATAR_SIZE = 512;

/** Formats accepted on upload. Everything is re-encoded to JPEG, so this is
 * about what the decoder reads safely, not what gets stored. SVG is left
 * out on purpose (it's a document, not a photo), and so is HEIC, which the
 * bundled decoder can't read: the clients convert it before uploading. */
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp", "gif", "avif", "heif", "tiff"]);

/** A decompression bomb guard: a few hundred bytes can claim to be a
 * gigapixel image. 50 megapixels covers any camera a household owns. */
const MAX_INPUT_PIXELS = 50_000_000;

const UNREADABLE = "That file isn't a photo Marquee can read. Use a JPEG, PNG or WebP image.";

/** Decodes the upload, turns it the right way up (phone photos are often
 * stored sideways with an EXIF hint), crops it to a centered square, and
 * re-encodes it as a JPEG. Re-encoding is also what makes this safe to
 * serve: nothing of the original file survives, including its metadata
 * (GPS position, camera serial), which sharp drops unless asked to keep it. */
export async function processAvatar(input: Uint8Array): Promise<CoreResult<{ image: Buffer }>> {
  if (input.byteLength === 0) return fail("invalid", "Choose a photo to upload.");
  if (input.byteLength > AVATAR_MAX_UPLOAD_BYTES) {
    return fail("invalid", "That photo is too big. Pick one under 15 MB.");
  }

  try {
    const source = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, animated: false });
    const { format } = await source.metadata();
    if (!format || !ACCEPTED_FORMATS.has(format)) return fail("invalid", UNREADABLE);

    const image = await source
      .rotate()
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover", position: "attention" })
      // JPEG has no transparency: a cut-out PNG lands on the app's dark
      // surface rather than on black.
      .flatten({ background: "#1c1b22" })
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer();
    return { ok: true, image };
  } catch {
    return fail("invalid", UNREADABLE);
  }
}

/** Reads an upload body without holding more than the limit in memory: a
 * declared Content-Length over it is refused up front, and a body that
 * turns out longer anyway is cut off as soon as it crosses the limit. */
export async function readAvatarUpload(request: Request): Promise<CoreResult<{ bytes: Uint8Array }>> {
  const tooBig = fail("invalid", "That photo is too big. Pick one under 15 MB.");
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > AVATAR_MAX_UPLOAD_BYTES) return tooBig;
  if (!request.body) return fail("invalid", "Choose a photo to upload.");

  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = request.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > AVATAR_MAX_UPLOAD_BYTES) {
      await reader.cancel().catch(() => undefined);
      return tooBig;
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes };
}
