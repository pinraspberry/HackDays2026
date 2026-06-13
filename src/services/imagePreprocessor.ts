// Image preprocessing for OCR — runs purely in the browser via <canvas>.
//
// Goal: make photographed prescriptions easier for Sarvam Document
// Intelligence (and any downstream vision LLM) to read by:
//   1. Down-scaling oversized phone photos so the OCR endpoint accepts
//      them quickly and within payload limits.
//   2. Converting to grayscale (color rarely helps OCR and adds noise).
//   3. Stretching contrast via a per-channel histogram so faded ink and
//      shadowed backgrounds become more legible.
//   4. Re-encoding as PNG (lossless) to avoid JPEG ringing around text.
//
// All operations are best-effort: on any failure we just return the
// original file untouched so the OCR pipeline can still try.

const MAX_DIMENSION_PX = 2000;
const CONTRAST_PERCENTILE_LOW = 0.02;
const CONTRAST_PERCENTILE_HIGH = 0.98;

const loadImageBitmap = async (input: Blob | File): Promise<ImageBitmap | HTMLImageElement> => {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(input);
    } catch {
      // fall through to HTMLImageElement path
    }
  }

  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(input);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
};

const computeTargetSize = (width: number, height: number) => {
  const longest = Math.max(width, height);
  if (longest <= MAX_DIMENSION_PX) return { width, height };
  const scale = MAX_DIMENSION_PX / longest;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
};

const applyGrayscaleAndContrast = (imageData: ImageData) => {
  const data = imageData.data;
  const totalPixels = data.length / 4;

  const histogram = new Uint32Array(256);
  const luminance = new Uint8ClampedArray(totalPixels);

  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const y = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    luminance[p] = y;
    histogram[y] += 1;
  }

  const lowTarget = Math.floor(totalPixels * CONTRAST_PERCENTILE_LOW);
  const highTarget = Math.floor(totalPixels * CONTRAST_PERCENTILE_HIGH);

  let cumulative = 0;
  let lowBound = 0;
  let highBound = 255;

  for (let i = 0; i < 256; i += 1) {
    cumulative += histogram[i];
    if (cumulative >= lowTarget) {
      lowBound = i;
      break;
    }
  }

  cumulative = 0;
  for (let i = 0; i < 256; i += 1) {
    cumulative += histogram[i];
    if (cumulative >= highTarget) {
      highBound = i;
      break;
    }
  }

  if (highBound <= lowBound) {
    lowBound = 0;
    highBound = 255;
  }

  const range = highBound - lowBound;

  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    let v = luminance[p];
    if (v <= lowBound) v = 0;
    else if (v >= highBound) v = 255;
    else v = Math.round(((v - lowBound) / range) * 255);

    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
  }
};

const canvasToPngBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob produced an empty blob.'));
      },
      'image/png'
    );
  });

export const preprocessImageForOcr = async (input: Blob | File): Promise<Blob> => {
  try {
    const bitmap = await loadImageBitmap(input);
    const sourceWidth = (bitmap as ImageBitmap).width || (bitmap as HTMLImageElement).naturalWidth;
    const sourceHeight = (bitmap as ImageBitmap).height || (bitmap as HTMLImageElement).naturalHeight;

    if (!sourceWidth || !sourceHeight) {
      return input;
    }

    const { width, height } = computeTargetSize(sourceWidth, sourceHeight);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return input;

    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, width, height);

    if ('close' in bitmap && typeof (bitmap as ImageBitmap).close === 'function') {
      (bitmap as ImageBitmap).close();
    }

    const imageData = ctx.getImageData(0, 0, width, height);
    applyGrayscaleAndContrast(imageData);
    ctx.putImageData(imageData, 0, 0);

    return await canvasToPngBlob(canvas);
  } catch (err) {
    console.warn('[imagePreprocessor] preprocessing failed, returning original blob', err);
    return input;
  }
};
