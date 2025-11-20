import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import {
    validateUUID,
    validateTheme,
    validateDetails,
    validateSize,
    validateAspectRatio,
    sanitizeText,
} from "@/lib/validation";
import { validateImageDataUrls } from "@/lib/file-validation";

// Allowed decoration types whitelist
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
];

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params;

        // Validate project ID
        const validatedProjectId = validateUUID(projectId);

        const body = await request.json();

        const {
            theme,
            details,
            decorationTypes,
            imageCount,
            size,
            aspectRatio,
            images,
            imageDecorationTypes, // Array of decoration types matching images array
            prompt,
            referenceImages,
        } = body;

        // Validate inputs
        const validatedTheme = validateTheme(theme);
        const validatedDetails = validateDetails(details);
        const validatedSize = validateSize(size);
        const validatedAspectRatio = validateAspectRatio(aspectRatio);
        const validatedPrompt = sanitizeText(prompt || "", 2000);

        // Validate decoration types
        if (!Array.isArray(decorationTypes) || decorationTypes.length === 0) {
            return NextResponse.json(
                { error: "At least one decoration type is required" },
                { status: 400 }
            );
        }

        const validatedDecorationTypes = decorationTypes.filter((type) =>
            ALLOWED_DECORATION_TYPES.includes(type)
        );

        if (validatedDecorationTypes.length === 0) {
            return NextResponse.json(
                { error: "No valid decoration types provided" },
                { status: 400 }
            );
        }

        // Validate images
        const { valid: validatedImages, errors: imageErrors } = validateImageDataUrls(
            Array.isArray(images) ? images : []
        );

        if (imageErrors.length > 0 && validatedImages.length === 0) {
            return NextResponse.json(
                { error: `Invalid images: ${imageErrors.join(", ")}` },
                { status: 400 }
            );
        }

        // Validate reference images
        const { valid: validatedReferenceImages } = validateImageDataUrls(
            Array.isArray(referenceImages) ? referenceImages : []
        );

        const iterationId = crypto.randomUUID();
        const createdAt = new Date().toISOString();

        const insertIteration = db.prepare(`
      INSERT INTO iterations (
        id, projectId, theme, details, decorationTypes, imageCount, size, aspectRatio, prompt, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

        const insertImage = db.prepare(`
      INSERT INTO images (id, iterationId, data, type, decorationType) VALUES (?, ?, ?, ?, ?)
    `);

        const transaction = db.transaction(() => {
            insertIteration.run(
                iterationId,
                validatedProjectId,
                validatedTheme,
                validatedDetails || null,
                JSON.stringify(validatedDecorationTypes),
                validatedImages.length,
                validatedSize || null,
                validatedAspectRatio || null,
                validatedPrompt,
                createdAt
            );

            if (validatedImages.length > 0) {
                for (let i = 0; i < validatedImages.length; i++) {
                    const imgData = validatedImages[i];
                    const decorationType = Array.isArray(imageDecorationTypes)
                        ? imageDecorationTypes[i]
                        : null;
                    insertImage.run(
                        crypto.randomUUID(),
                        iterationId,
                        imgData,
                        "generated",
                        decorationType
                    );
                }
            }

            if (validatedReferenceImages.length > 0) {
                for (const refData of validatedReferenceImages) {
                    insertImage.run(
                        crypto.randomUUID(),
                        iterationId,
                        refData,
                        "reference",
                        null // Reference images don't have a decoration type
                    );
                }
            }
        });

        transaction();

        return NextResponse.json({ success: true, iterationId });
    } catch (error) {
        console.error("Failed to save iteration:", error);

        if (error instanceof Error && (error.message.includes("Invalid") || error.message.includes("required") || error.message.includes("Unsupported"))) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }

        return NextResponse.json({ error: "An error occurred while saving the iteration" }, { status: 500 });
    }
}
