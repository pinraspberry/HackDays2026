import JSZip from 'jszip';
import type { SarvamAI } from 'sarvamai';
import { createSarvamClient } from './sarvamClient';
import { SarvamDocumentProcessingError, SarvamUnsupportedDocumentError } from './sarvamErrors';

export type SarvamDocumentDigitizationResult = {
  jobId: string;
  extractedText: string;
  status: SarvamAI.DocDigitizationJobStatusResponse;
};

const SUPPORTED_DIRECT_MIME_TYPES = new Set([
  'application/pdf',
  'application/zip',
]);

const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
]);

const inferMimeType = (input: File | Blob | string): string => {
  if (typeof input === 'string') {
    const mimeMatch = input.match(/^data:([^;]+);base64,/i);
    return mimeMatch?.[1]?.toLowerCase() || '';
  }

  return (input as File).type?.toLowerCase() || '';
};

const isSupportedDocument = (input: File | Blob | string): boolean => {
  const mime = inferMimeType(input);
  return SUPPORTED_DIRECT_MIME_TYPES.has(mime) || SUPPORTED_IMAGE_MIME_TYPES.has(mime);
};

const extensionForImage = (mime: string): string => {
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
  return 'png';
};

// Sarvam's Document Intelligence accepts PDF or a ZIP of JPEG/PNG images.
// For a single image upload we wrap it in a one-file ZIP on the fly.
const wrapImageInZip = async (input: File | Blob | string): Promise<Blob> => {
  const blob = await toBlob(input);
  const mime = blob.type?.toLowerCase() || inferMimeType(input) || 'image/png';
  const ext = extensionForImage(mime);

  const zip = new JSZip();
  const arrayBuffer = await blob.arrayBuffer();
  zip.file(`page-1.${ext}`, arrayBuffer);
  return await zip.generateAsync({ type: 'blob', mimeType: 'application/zip' });
};

const toBlob = async (input: File | Blob | string): Promise<Blob> => {
  if (input instanceof Blob) return input;

  if (typeof input === 'string') {
    const response = await fetch(input);
    return await response.blob();
  }

  return input;
};

const readZipPayloadText = async (payload: ArrayBuffer): Promise<string> => {
  try {
    const zip = await JSZip.loadAsync(payload);
    const fileNames = Object.keys(zip.files).filter((name) => !zip.files[name].dir);

    const orderedFiles = fileNames.sort((left, right) => {
      const leftScore = left.toLowerCase().endsWith('.json') ? 0 : left.toLowerCase().endsWith('.md') ? 1 : left.toLowerCase().endsWith('.html') ? 2 : 3;
      const rightScore = right.toLowerCase().endsWith('.json') ? 0 : right.toLowerCase().endsWith('.md') ? 1 : right.toLowerCase().endsWith('.html') ? 2 : 3;
      return leftScore - rightScore;
    });

    const chunks: string[] = [];

    for (const fileName of orderedFiles) {
      const file = zip.files[fileName];
      const text = await file.async('string');

      if (fileName.toLowerCase().endsWith('.json')) {
        try {
          const parsed = JSON.parse(text);
          chunks.push(JSON.stringify(parsed, null, 2));
          continue;
        } catch {
          // fall through to raw content
        }
      }

      chunks.push(text);
    }

    return chunks.join('\n\n');
  } catch {
    return new TextDecoder().decode(payload);
  }
};

export class SarvamDocumentService {
  static async digitizeDocument(input: File | Blob | string, language?: SarvamAI.DocDigitizationSupportedLanguage): Promise<SarvamDocumentDigitizationResult> {
    if (!isSupportedDocument(input)) {
      throw new SarvamUnsupportedDocumentError(
        'Sarvam document digitization supports PDF, ZIP, and JPG/PNG images. Other formats are not yet handled.'
      );
    }

    const mime = inferMimeType(input);
    const blob = SUPPORTED_IMAGE_MIME_TYPES.has(mime)
      ? await wrapImageInZip(input)
      : await toBlob(input);

    const client = createSarvamClient();
    const job = await client.documentIntelligence.createJob({
      language,
      outputFormat: 'md',
    });

    await job.uploadFile(blob);
    const started = await job.start();
    const completed = await job.waitUntilComplete();

    if (completed.job_state !== 'Completed' && completed.job_state !== 'PartiallyCompleted') {
      throw new SarvamDocumentProcessingError(
        completed.error_message || `Document digitization failed with job state: ${completed.job_state}`
      );
    }

    const downloadLinks = await job.getDownloadLinks();
    const firstDownload = Object.values(downloadLinks.download_urls)[0];

    if (!firstDownload?.file_url) {
      throw new SarvamDocumentProcessingError('Sarvam document digitization completed, but no output file was returned.');
    }

    const downloadResponse = await fetch(firstDownload.file_url);
    if (!downloadResponse.ok) {
      throw new SarvamDocumentProcessingError(`Failed to download digitized output: ${downloadResponse.status}`);
    }

    const contentType = downloadResponse.headers.get('content-type') || '';
    const bytes = await downloadResponse.arrayBuffer();
    const extractedText = contentType.includes('zip') || firstDownload.file_url.toLowerCase().endsWith('.zip')
      ? await readZipPayloadText(bytes)
      : new TextDecoder().decode(bytes);

    return {
      jobId: started.job_id,
      extractedText,
      status: completed,
    };
  }

  static async extractTextFromSource(input: File | Blob | string, language?: SarvamAI.DocDigitizationSupportedLanguage): Promise<string> {
    const result = await this.digitizeDocument(input, language);
    return result.extractedText;
  }

  // Convenience entry point for callers that already know they're dealing
  // with a single image (e.g. the OCR pipeline after preprocessing). We
  // always wrap the image in a ZIP because Sarvam DI rejects bare PNG/JPG.
  static async digitizeImage(
    image: File | Blob,
    language?: SarvamAI.DocDigitizationSupportedLanguage
  ): Promise<SarvamDocumentDigitizationResult> {
    const zipped = await wrapImageInZip(image);

    const client = createSarvamClient();
    const job = await client.documentIntelligence.createJob({
      language,
      outputFormat: 'md',
    });

    await job.uploadFile(zipped);
    const started = await job.start();
    const completed = await job.waitUntilComplete();

    if (completed.job_state !== 'Completed' && completed.job_state !== 'PartiallyCompleted') {
      throw new SarvamDocumentProcessingError(
        completed.error_message || `Document digitization failed with job state: ${completed.job_state}`
      );
    }

    const downloadLinks = await job.getDownloadLinks();
    const firstDownload = Object.values(downloadLinks.download_urls)[0];

    if (!firstDownload?.file_url) {
      throw new SarvamDocumentProcessingError('Sarvam document digitization completed, but no output file was returned.');
    }

    const downloadResponse = await fetch(firstDownload.file_url);
    if (!downloadResponse.ok) {
      throw new SarvamDocumentProcessingError(`Failed to download digitized output: ${downloadResponse.status}`);
    }

    const contentType = downloadResponse.headers.get('content-type') || '';
    const bytes = await downloadResponse.arrayBuffer();
    const extractedText = contentType.includes('zip') || firstDownload.file_url.toLowerCase().endsWith('.zip')
      ? await readZipPayloadText(bytes)
      : new TextDecoder().decode(bytes);

    return {
      jobId: started.job_id,
      extractedText,
      status: completed,
    };
  }
}
