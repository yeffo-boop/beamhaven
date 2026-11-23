import { describe, expect, it } from "vitest";

import { detectImageType } from "@/server/storage/detect";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(
    parts.flatMap((part) =>
      typeof part === "string" ? [...part].map((c) => c.charCodeAt(0)) : part,
    ),
  );
const pad = Array<number>(8).fill(0);

describe("detectImageType", () => {
  it("recognises photos by their first bytes", () => {
    expect(detectImageType(bytes([0xff, 0xd8, 0xff, 0xe0], pad))).toBe("image/jpeg");
    expect(detectImageType(bytes([0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a], pad))).toBe("image/png");
    expect(detectImageType(bytes("RIFF", [0, 0, 0, 0], "WEBP", pad))).toBe("image/webp");
    expect(detectImageType(bytes([0, 0, 0, 24], "ftypheic", pad))).toBe("image/heic");
    expect(detectImageType(bytes([0, 0, 0, 24], "ftypavif", pad))).toBe("image/avif");
  });

  it("refuses everything else, whatever the file is called", () => {
    const refuse = (text: string) => expect(detectImageType(bytes(text))).toBeNull();
    refuse(`<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>`);
    refuse("<!doctype html><script>alert(1)</script>");
    refuse("%PDF-1.7 something");
    expect(detectImageType(bytes([0, 0, 0, 24], "ftypisom", pad))).toBeNull(); // an MP4 video
    expect(detectImageType(bytes([0xff, 0xd8]))).toBeNull(); // too short to tell
  });
});
