const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const MAX_EDGE_PX = 1200;
const JPEG_QUALITY = 0.85;

export type AlbumImagePrepared = {
  base64: string;
  fileName: string;
  previewUrl: string;
  width: number;
  height: number;
};

export function validateAlbumImageFile(file: File): string | null {
  if (!ALLOWED_TYPES.has(file.type)) {
    return 'invalid_type';
  }
  if (file.size > MAX_SOURCE_BYTES) {
    return 'too_large';
  }
  return null;
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode_failed'));
    };
    img.src = url;
  });
}

function fitDimensions(width: number, height: number, maxEdge: number) {
  if (width <= maxEdge && height <= maxEdge) {
    return { width, height };
  }
  if (width >= height) {
    return { width: maxEdge, height: Math.round((height * maxEdge) / width) };
  }
  return { width: Math.round((width * maxEdge) / height), height: maxEdge };
}

/** 앨범용 이미지 — 비율 유지 리사이즈 후 JPEG 압축 */
export async function prepareAlbumImage(file: File): Promise<AlbumImagePrepared> {
  const validation = validateAlbumImageFile(file);
  if (validation) {
    throw new Error(validation);
  }

  const img = await loadImageFromFile(file);
  const { width, height } = fitDimensions(img.naturalWidth || img.width, img.naturalHeight || img.height, MAX_EDGE_PX);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('canvas_failed');
  }

  ctx.drawImage(img, 0, 0, width, height);
  const base64 = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  const previewUrl = base64;

  const stem = file.name.replace(/\.[^.]+$/, '') || 'album';
  return {
    base64,
    fileName: `${stem}.jpg`,
    previewUrl,
    width,
    height,
  };
}
