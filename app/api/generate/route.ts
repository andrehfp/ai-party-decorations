import { NextRequest, NextResponse } from "next/server";
import {
  experimental_generateImage as generateImage,
  type GeneratedFile,
} from "ai";
import { gatewayImage, streamImageGeneration } from "@/lib/gateway";
import { buildDecorationPrompt } from "@/lib/decoration-prompts";
import {
  validateTheme,
  validateDetails,
  sanitizeText,
  validateBoolean,
} from "@/lib/validation";
import { validateImageDataUrls } from "@/lib/file-validation";

const DEFAULT_DECORATIONS = [
  "Cake topper",
  "Cupcake toppers",
  "Welcome banner",
  "Favor tags",
  "Table centerpiece",
  "Photo booth prop",
];

const ALLOWED_DECORATION_TYPES = [
  "Cake topper",
  "Banner",
  "Cup/bottle label",
  "Favor tag",
  "Cupcake topper",
  "Food label",
  "Party sign",
  "Centerpiece",
  "Invitation",
  "Thank you card",
  "Sticker",
  "Backdrop",
  "Garland",
  "Photo booth prop",
  "Gift tag",
  "Cupcake toppers",
  "Welcome banner",
  "Favor tags",
  "Table centerpiece",
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
  stream?: boolean;
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

    // Validate theme
    const validatedTheme = validateTheme(body.theme);

    // Validate details (optional)
    const validatedDetails = validateDetails(body.details);

    // Validate project name (optional)
    const validatedProjectName = body.projectName
      ? sanitizeText(body.projectName, 100)
      : undefined;

    // Validate decoration types against whitelist
    let decorationTypes =
      body.decorationTypes && body.decorationTypes.length > 0
        ? body.decorationTypes
        : DEFAULT_DECORATIONS;

    // Filter to only allowed types
    decorationTypes = decorationTypes.filter((type) =>
      ALLOWED_DECORATION_TYPES.includes(type)
    );

    if (decorationTypes.length === 0) {
      decorationTypes = DEFAULT_DECORATIONS;
    }

    // Limit to MAX_IMAGE_COUNT decoration types
    const selectedTypes = decorationTypes.slice(0, MAX_IMAGE_COUNT);

    // Validate reference images
    const { valid: validatedReferenceImages } = validateImageDataUrls(
      Array.isArray(body.referenceImages) ? body.referenceImages : []
    );

    const size = isValidSize(body.size) ? body.size : DEFAULT_IMAGE_SIZE;
    const aspectRatio = isValidAspectRatio(body.aspectRatio)
      ? body.aspectRatio
      : undefined;

    // Handle streaming mode
    if (body.stream) {
      return handleStreamingGeneration(
        selectedTypes,
        validatedTheme,
        validatedDetails,
        validatedProjectName,
        validatedReferenceImages,
        size,
        aspectRatio,
      );
    }

    // Non-streaming mode (existing implementation)
    const providerOptions =
      validatedReferenceImages.length > 0
        ? { gateway: { referenceImages: validatedReferenceImages } }
        : undefined;

    // Generate one image per decoration type with type-specific prompts
    // Making parallel API calls for better type-specific results
    const imageGenerationPromises = selectedTypes.map(async (decorationType) => {
      const prompt = buildDecorationPrompt(
        decorationType,
        validatedTheme,
        validatedDetails,
        validatedProjectName,
        validatedReferenceImages.length
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

    // Return validation errors with 400, other errors with 500
    if (error instanceof Error) {
      if (
        error.message.includes("required") ||
        error.message.includes("invalid") ||
        error.message.includes("Invalid") ||
        error.message.includes("Unsupported") ||
        error.message.includes("too long")
      ) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    return NextResponse.json(
      { error: "An error occurred while generating decorations" },
      { status: 500 }
    );
  }
}

async function handleStreamingGeneration(
  decorationTypes: string[],
  theme: string,
  details: string | undefined,
  projectName: string | undefined,
  referenceImages: string[],
  size: string,
  aspectRatio: string | undefined,
) {
  const encoder = new TextEncoder();

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Generate images in parallel, but stream them as they arrive
        const streamPromises = decorationTypes.map(async (decorationType, index) => {
          const prompt = buildDecorationPrompt(
            decorationType,
            theme,
            details,
            projectName,
            referenceImages.length
          );

          try {
            const imageStream = await streamImageGeneration({
              prompt,
              size,
              aspectRatio,
              referenceImages,
            });

            const reader = imageStream.getReader();
            let imageReceived = false;

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              if (value && value.image) {
                imageReceived = true;
                // Send SSE chunk
                const chunk = {
                  image: value.image,
                  decorationType,
                  index,
                  prompt,
                };
                const data = `data: ${JSON.stringify(chunk)}\n\n`;
                controller.enqueue(encoder.encode(data));
              }
            }

            reader.releaseLock();

            if (!imageReceived) {
              throw new Error(`No image received for ${decorationType}`);
            }
          } catch (error) {
            // Send error as SSE event
            const errorChunk = {
              error: error instanceof Error ? error.message : "Failed to generate image",
              decorationType,
              index,
            };
            const data = `data: ${JSON.stringify(errorChunk)}\n\n`;
            controller.enqueue(encoder.encode(data));
          }
        });

        // Wait for all streams to complete
        await Promise.all(streamPromises);

        // Send completion signal
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Streaming error";
        const errorData = `data: ${JSON.stringify({ error: errorMessage })}\n\n`;
        controller.enqueue(encoder.encode(errorData));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
