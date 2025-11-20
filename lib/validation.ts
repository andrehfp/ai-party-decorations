/**
 * Input validation and sanitization utilities for security
 */

/**
 * Sanitizes text input by removing potentially dangerous characters
 * and limiting length
 */
export function sanitizeText(
  input: string,
  maxLength: number = 500
): string {
  if (typeof input !== "string") {
    return "";
  }

  return input
    .trim()
    .slice(0, maxLength)
    .replace(/[<>]/g, ""); // Remove potential HTML tags
}

/**
 * Validates and sanitizes a project/item name
 */
export function validateName(name: unknown): string {
  if (typeof name !== "string" || !name.trim()) {
    throw new Error("Name is required and must be a non-empty string");
  }

  const sanitized = sanitizeText(name, 100);

  if (sanitized.length === 0) {
    throw new Error("Name contains only invalid characters");
  }

  if (sanitized.length > 100) {
    throw new Error("Name is too long (maximum 100 characters)");
  }

  return sanitized;
}

/**
 * Validates UUID format
 */
export function validateUUID(id: unknown): string {
  if (typeof id !== "string") {
    throw new Error("ID must be a string");
  }

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidRegex.test(id)) {
    throw new Error("Invalid ID format");
  }

  return id;
}

/**
 * Validates and sanitizes optional details text
 */
export function validateDetails(details: unknown): string | undefined {
  if (details === undefined || details === null || details === "") {
    return undefined;
  }

  if (typeof details !== "string") {
    throw new Error("Details must be a string");
  }

  const sanitized = sanitizeText(details, 1000);
  return sanitized.length > 0 ? sanitized : undefined;
}

/**
 * Validates theme input
 */
export function validateTheme(theme: unknown): string {
  if (typeof theme !== "string" || !theme.trim()) {
    throw new Error("Theme is required");
  }

  const sanitized = sanitizeText(theme, 200);

  if (sanitized.length === 0) {
    throw new Error("Theme contains only invalid characters");
  }

  return sanitized;
}

/**
 * Validates an array of decoration types against a whitelist
 */
export function validateDecorationTypes(
  types: unknown,
  allowedTypes: string[]
): string[] {
  if (!Array.isArray(types)) {
    throw new Error("Decoration types must be an array");
  }

  if (types.length === 0) {
    throw new Error("At least one decoration type is required");
  }

  if (types.length > 20) {
    throw new Error("Too many decoration types (maximum 20)");
  }

  const validated = types.filter(
    (type): type is string =>
      typeof type === "string" && allowedTypes.includes(type)
  );

  if (validated.length === 0) {
    throw new Error("No valid decoration types provided");
  }

  return validated;
}

/**
 * Validates size choice
 */
export function validateSize(size: unknown): string | undefined {
  if (size === undefined || size === null || size === "") {
    return undefined;
  }

  if (typeof size !== "string") {
    throw new Error("Size must be a string");
  }

  const validSizes = ["small", "medium", "large"];
  if (!validSizes.includes(size)) {
    throw new Error("Invalid size option");
  }

  return size;
}

/**
 * Validates aspect ratio
 */
export function validateAspectRatio(ratio: unknown): string | undefined {
  if (ratio === undefined || ratio === null || ratio === "") {
    return undefined;
  }

  if (typeof ratio !== "string") {
    throw new Error("Aspect ratio must be a string");
  }

  const validRatios = ["1:1", "16:9", "4:3", "3:2", "2:3"];
  if (!validRatios.includes(ratio)) {
    throw new Error("Invalid aspect ratio");
  }

  return ratio;
}

/**
 * Validates reference images array
 */
export function validateReferenceImages(images: unknown): string[] {
  if (!Array.isArray(images)) {
    return [];
  }

  // Filter and validate data URLs
  const validated = images.filter((img): img is string => {
    if (typeof img !== "string") return false;
    if (!img.startsWith("data:image/")) return false;
    if (img.length > 10 * 1024 * 1024) return false; // Max 10MB per image
    return true;
  });

  if (validated.length > 10) {
    throw new Error("Too many reference images (maximum 10)");
  }

  return validated;
}

/**
 * Validates a boolean flag
 */
export function validateBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return value === "true";
  }

  return false;
}
