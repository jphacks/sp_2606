import sharp from "sharp";
export async function normalizeAvatar(encoded: string) {
  if (encoded.length > 65536 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))
    throw new Error("invalid_image");
  const input = Buffer.from(encoded, "base64");
  const image = sharp(input, { limitInputPixels: 20_000_000, animated: false });
  const metadata = await image.metadata();
  if (!["jpeg", "png", "webp", "avif", "heif"].includes(metadata.format || ""))
    throw new Error("invalid_image");
  // Re-encode rather than retaining uploaded metadata, animation or trailing bytes.
  const output = await image
    .rotate()
    .resize(192, 192, { fit: "cover" })
    .jpeg({ quality: 80 })
    .toBuffer();
  if (output.length > 49152) throw new Error("too_large");
  return output.toString("base64");
}
