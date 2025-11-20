import { NextRequest, NextResponse } from "next/server";
import {
  experimental_generateImage as generateImage,
  type GeneratedFile,
} from "ai";
import { gatewayImage } from "@/lib/gateway";

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

const buildPrompt = ({
  theme,
  details,
  decorationTypes,
  projectName,
  referenceCount,
  imageCount,
}: {
  theme: string;
  details?: string;
  decorationTypes: string[];
  projectName?: string;
  referenceCount: number;
  imageCount: number;
}) => {
  const focusList = decorationTypes.join(", ");
  const lines = [
    `You are an imaginative art director creating printable decorations for a kids party supply kit.`,
    `Produce ${imageCount} cohesive illustration concepts that can be used for: ${focusList}.`,
    `Party theme: ${theme}.`,
  ];

  if (projectName) {
    lines.push(`Project name: ${projectName}.`);
  }

  if (details) {
    lines.push(`Extra creative direction: ${details}.`);
  }

  if (referenceCount > 0) {
    lines.push(
      `Match palette and general styling cues from the ${referenceCount} reference image(s) supplied.`,
    );
  }

  lines.push(
    "Keep a bright, playful, kid-approved style with crisp outlines, rich textures, and layouts that are easy to cut out or print.",
  );
  lines.push(
    "Avoid text-heavy layouts. Include clean or transparent backgrounds so the decorations can be layered on invitations or banners.",
  );

  return lines.join("\n");
};

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

    const count = clamp(body.imageCount ?? 3, MIN_IMAGE_COUNT, MAX_IMAGE_COUNT);

    const referenceImages = Array.isArray(body.referenceImages)
      ? body.referenceImages.filter(
          (img) => typeof img === "string" && img.length > 0,
        )
      : [];

    const size = isValidSize(body.size) ? body.size : DEFAULT_IMAGE_SIZE;
    const aspectRatio = isValidAspectRatio(body.aspectRatio)
      ? body.aspectRatio
      : undefined;

    const prompt = buildPrompt({
      theme,
      details: body.details?.trim(),
      decorationTypes,
      projectName: body.projectName,
      referenceCount: referenceImages.length,
      imageCount: count,
    });

    const providerOptions =
      referenceImages.length > 0
        ? { gateway: { referenceImages } }
        : undefined;

    const result = await generateImage({
      model: gatewayImage,
      prompt,
      n: count,
      size,
      aspectRatio,
      providerOptions,
    });

    const images = result.images.map(fileToDataUrl);

    return NextResponse.json({
      images,
      prompt,
    });
  } catch (error) {
    console.error("Failed to generate party decorations:", error);
    const message =
      error instanceof Error ? error.message : "Unable to generate images";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
