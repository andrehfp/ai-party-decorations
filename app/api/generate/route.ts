import { NextRequest, NextResponse } from "next/server";
import {
  experimental_generateImage as generateImage,
  type GeneratedFile,
} from "ai";
import { gatewayImage } from "@/lib/gateway";
import { buildDecorationPrompt } from "@/lib/decoration-prompts";

const DEFAULT_DECORATIONS = [
  "Cake topper",
  "Cupcake toppers",
  "Welcome banner",
  "Favor tags",
  "Table centerpiece",
  "Photo booth prop",
];

const DEFAULT_IMAGE_SIZE = "1024x1024";
const MAX_IMAGE_COUNT = 6;
const MIN_IMAGE_COUNT = 1;

type GenerateRequest = {
  theme: string;
  details?: string;
  decorationTypes?: string[];
  imageCount?: number;
  referenceImages?: string[];
  size?: string;
  aspectRatio?: string;
  projectName?: string;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const isValidSize = (value?: string): value is `${number}x${number}` =>
  typeof value === "string" && /^\d+x\d+$/.test(value);

const isValidAspectRatio = (
  value?: string,
): value is `${number}:${number}` =>
  typeof value === "string" && /^\d+:\d+$/.test(value);

// Legacy function - kept for reference but no longer used
// Now using type-specific prompts from decoration-prompts.ts

const fileToDataUrl = (file: GeneratedFile) => {
  const mediaType = file.mediaType ?? "image/png";

  if (file.base64) {
    return `data:${mediaType};base64,${file.base64}`;
  }

  if (file.uint8Array) {
    const buffer =
      file.uint8Array instanceof Uint8Array
        ? file.uint8Array
        : new Uint8Array(file.uint8Array);
    const base64 = Buffer.from(buffer).toString("base64");
    return `data:${mediaType};base64,${base64}`;
  }

  throw new Error("Image payload is empty");
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GenerateRequest;
    const theme = body.theme?.trim();

    if (!theme) {
      return NextResponse.json(
        { error: "Please provide a party theme to inspire the decorations." },
        { status: 400 },
      );
    }

    const decorationTypes =
      body.decorationTypes && body.decorationTypes.length > 0
        ? body.decorationTypes
        : DEFAULT_DECORATIONS;

    // Limit to MAX_IMAGE_COUNT decoration types
    const selectedTypes = decorationTypes.slice(0, MAX_IMAGE_COUNT);

    const referenceImages = Array.isArray(body.referenceImages)
      ? body.referenceImages.filter(
          (img) => typeof img === "string" && img.length > 0,
        )
      : [];

    const size = isValidSize(body.size) ? body.size : DEFAULT_IMAGE_SIZE;
    const aspectRatio = isValidAspectRatio(body.aspectRatio)
      ? body.aspectRatio
      : undefined;

    const providerOptions =
      referenceImages.length > 0
        ? { gateway: { referenceImages } }
        : undefined;

    // Generate one image per decoration type with type-specific prompts
    // Making parallel API calls for better type-specific results
    const imageGenerationPromises = selectedTypes.map(async (decorationType) => {
      const prompt = buildDecorationPrompt(
        decorationType,
        theme,
        body.details?.trim(),
        body.projectName,
        referenceImages.length
      );

      const result = await generateImage({
        model: gatewayImage,
        prompt,
        n: 1, // One image per type
        size,
        aspectRatio,
        providerOptions,
      });

      const imageDataUrl = fileToDataUrl(result.images[0]);

      return {
        image: imageDataUrl,
        decorationType,
        prompt,
      };
    });

    // Wait for all images to be generated
    const results = await Promise.all(imageGenerationPromises);

    // Extract images and decoration types
    const images = results.map((r) => r.image);
    const types = results.map((r) => r.decorationType);
    const prompts = results.map((r) => r.prompt);

    return NextResponse.json({
      images,
      decorationTypes: types,
      prompts,
    });
  } catch (error) {
    console.error("Failed to generate party decorations:", error);
    const message =
      error instanceof Error ? error.message : "Unable to generate images";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
