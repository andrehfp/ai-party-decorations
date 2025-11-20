/**
 * File upload validation utilities
 * Validates file types using both MIME types and magic bytes (file signatures)
 */

const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Magic bytes (file signatures) for common image formats
 */
const IMAGE_SIGNATURES: { [key: string]: number[][] } = {
  jpeg: [
    [0xff, 0xd8, 0xff], // JPEG
  ],
  png: [
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], // PNG
  ],
  gif: [
    [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], // GIF87a
    [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], // GIF89a
  ],
  webp: [
    [0x52, 0x49, 0x46, 0x46], // RIFF (WebP starts with RIFF)
  ],
};

/**
 * Checks if a byte array starts with a specific signature
 */
function matchesSignature(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) {
    return false;
  }

  for (let i = 0; i < signature.length; i++) {
    if (bytes[i] !== signature[i]) {
      return false;
    }
  }

  return true;
}

/**
 * Detects image type from magic bytes
 */
function detectImageType(bytes: Uint8Array): string | null {
  for (const [type, signatures] of Object.entries(IMAGE_SIGNATURES)) {
    for (const signature of signatures) {
      if (matchesSignature(bytes, signature)) {
        return type;
      }
    }
  }

  return null;
}

/**
 * Validates a data URL for images
 * Checks MIME type, size, and magic bytes
 */
export function validateImageDataUrl(dataUrl: string): {
  valid: boolean;
  error?: string;
} {
  // Check if it's a data URL
  if (!dataUrl.startsWith("data:")) {
    return { valid: false, error: "Not a valid data URL" };
  }

  // Parse data URL
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!match) {
    return { valid: false, error: "Invalid data URL format" };
  }

  const [, mimeType, base64Data] = match;

  // Validate MIME type
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(mimeType)) {
    return { valid: false, error: `Unsupported image type: ${mimeType}` };
  }

  // Decode base64 to check size and magic bytes
  try {
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);

    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Check file size
    if (bytes.length > MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`,
      };
    }

    // Validate magic bytes
    const detectedType = detectImageType(bytes);
    if (!detectedType) {
      return { valid: false, error: "File does not appear to be a valid image" };
    }

    // Check if MIME type matches detected type
    const mimeTypeMap: { [key: string]: string } = {
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
    };

    if (mimeTypeMap[detectedType] !== mimeType) {
      return {
        valid: false,
        error: "MIME type does not match file content",
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: "Failed to validate image data",
    };
  }
}

/**
 * Validates an array of image data URLs
 */
export function validateImageDataUrls(
  dataUrls: unknown[]
): { valid: string[]; errors: string[] } {
  const valid: string[] = [];
  const errors: string[] = [];

  for (const dataUrl of dataUrls) {
    if (typeof dataUrl !== "string") {
      errors.push("Invalid data type (expected string)");
      continue;
    }

    const result = validateImageDataUrl(dataUrl);
    if (result.valid) {
      valid.push(dataUrl);
    } else {
      errors.push(result.error || "Unknown error");
    }
  }

  return { valid, errors };
}

/**
 * Client-side file validation (for use in frontend)
 */
export function validateFileUpload(file: File): {
  valid: boolean;
  error?: string;
} {
  // Check MIME type
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `Unsupported file type: ${file.type}. Allowed types: ${ALLOWED_IMAGE_MIME_TYPES.join(", ")}`,
    };
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File is too large (${(file.size / 1024 / 1024).toFixed(2)}MB). Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.`,
    };
  }

  // Check file extension
  const validExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
  const fileName = file.name.toLowerCase();
  const hasValidExtension = validExtensions.some((ext) =>
    fileName.endsWith(ext)
  );

  if (!hasValidExtension) {
    return {
      valid: false,
      error: "Invalid file extension. Allowed: .jpg, .jpeg, .png, .gif, .webp",
    };
  }

  return { valid: true };
}

/**
 * Reads a file and validates its magic bytes
 * Returns a promise that resolves with validation result and data URL
 */
export async function validateAndReadFile(file: File): Promise<{
  valid: boolean;
  dataUrl?: string;
  error?: string;
}> {
  // First check basic file properties
  const basicValidation = validateFileUpload(file);
  if (!basicValidation.valid) {
    return basicValidation;
  }

  // Read file and check magic bytes
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl) {
        resolve({ valid: false, error: "Failed to read file" });
        return;
      }

      const validation = validateImageDataUrl(dataUrl);
      if (validation.valid) {
        resolve({ valid: true, dataUrl });
      } else {
        resolve({ valid: false, error: validation.error });
      }
    };

    reader.onerror = () => {
      resolve({ valid: false, error: "Failed to read file" });
    };

    reader.readAsDataURL(file);
  });
}
