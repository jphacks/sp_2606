import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { normalizeAvatar } from "../src/lib/avatar-image";
test("avatar re-encoding produces bounded JPEG and strips original metadata", async () => {
  const original = await sharp({
    create: { width: 300, height: 200, channels: 3, background: "red" },
  })
    .jpeg()
    .withExif({ IFD0: { Artist: "private metadata" } })
    .toBuffer();
  const output = Buffer.from(
    await normalizeAvatar(original.toString("base64")),
    "base64",
  );
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.format, "jpeg");
  assert.equal(metadata.width, 192);
  assert.equal(metadata.height, 192);
  assert.equal(metadata.exif, undefined);
  assert(output.length <= 49152);
  await assert.rejects(() =>
    normalizeAvatar(
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString(
        "base64",
      ),
    ),
  );
  await assert.rejects(() => normalizeAvatar("A".repeat(65537)));
  await assert.rejects(() => normalizeAvatar("not an image"));
});
