/**
 * Re-draws a photo onto a canvas and re-encodes it. That drops EXIF, GPS, camera/device and XMP data, which
 * live in the file's metadata rather than its pixels. Orientation is baked into the pixels first so the photo
 * does not turn sideways.
 * Throws if the photo cannot be cleaned, so callers never upload a photo that still carries metadata by accident.
 */
export async function stripPhotoMetadata(file: File): Promise<File> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(bmp, 0, 0);
    const type = file.type === "image/png" ? "image/png" : file.type === "image/webp" ? "image/webp" : "image/jpeg";
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, type, 0.92));
    if (!blob) throw new Error("encode failed");
    const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
    const base = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${base}.${ext}`, { type: blob.type, lastModified: Date.now() });
  } finally { bmp.close(); }
}
