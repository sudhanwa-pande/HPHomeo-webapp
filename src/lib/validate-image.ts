/**
 * Validates an image file by reading its magic bytes (file header),
 * not just the browser-reported MIME type which can be spoofed.
 * Supports JPEG, PNG, WebP, and GIF.
 */
export async function validateImageFile(
  file: File,
  options: { maxSizeMb?: number } = {},
): Promise<{ valid: boolean; error?: string }> {
  const maxBytes = (options.maxSizeMb ?? 5) * 1024 * 1024;

  if (file.size === 0) {
    return { valid: false, error: "The file is empty." };
  }

  if (file.size > maxBytes) {
    return { valid: false, error: `File must be under ${options.maxSizeMb ?? 5} MB.` };
  }

  // Read first 12 bytes — enough to detect JPEG, PNG, WebP, GIF
  const buffer = await file.slice(0, 12).arrayBuffer();
  const b = new Uint8Array(buffer);

  // JPEG: FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return { valid: true };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { valid: true };
  }

  // WebP: RIFF????WEBP  (bytes 0-3 = "RIFF", bytes 8-11 = "WEBP")
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return { valid: true };
  }

  // GIF: GIF87a or GIF89a
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) {
    return { valid: true };
  }

  return {
    valid: false,
    error: "Please upload a valid JPEG, PNG, or WebP image.",
  };
}
