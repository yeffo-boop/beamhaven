/**
 * Works out an image's type from its first bytes (its "magic number"),
 * never from the file name or what the browser claims. Anything we don't
 * recognise is refused, including SVG and HTML, which can carry scripts.
 */
export type ImageType = "image/jpeg" | "image/png" | "image/webp" | "image/heic" | "image/avif";

const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);
const AVIF_BRANDS = new Set(["avif", "avis"]);

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

export type DocumentType = ImageType | "application/pdf";

/**
 * For receipts: a photo, or a PDF (which starts with "%PDF-"). PDFs are
 * only ever offered as downloads, never shown inside BeamHaven's pages.
 */
export function detectReceiptType(bytes: Uint8Array): DocumentType | null {
  if (bytes.length >= 5 && ascii(bytes, 0, 5) === "%PDF-") return "application/pdf";
  return detectImageType(bytes);
}

export function detectImageType(bytes: Uint8Array): ImageType | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)
  ) {
    return "image/png";
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "image/webp";
  if (ascii(bytes, 4, 8) === "ftyp") {
    const brand = ascii(bytes, 8, 12);
    if (AVIF_BRANDS.has(brand)) return "image/avif";
    if (HEIC_BRANDS.has(brand)) return "image/heic";
  }
  return null;
}
