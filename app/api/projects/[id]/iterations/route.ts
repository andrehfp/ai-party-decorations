import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params;
        const body = await request.json();

        const {
            theme,
            details,
            decorationTypes,
            imageCount,
            size,
            aspectRatio,
            images,
            prompt,
            referenceImages,
        } = body;

        const iterationId = crypto.randomUUID();
        const createdAt = new Date().toISOString();

        const insertIteration = db.prepare(`
      INSERT INTO iterations (
        id, projectId, theme, details, decorationTypes, imageCount, size, aspectRatio, prompt, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

        const insertImage = db.prepare(`
      INSERT INTO images (id, iterationId, data, type) VALUES (?, ?, ?, ?)
    `);

        const transaction = db.transaction(() => {
            insertIteration.run(
                iterationId,
                projectId,
                theme,
                details || null,
                JSON.stringify(decorationTypes),
                imageCount,
                size,
                aspectRatio || null,
                prompt,
                createdAt
            );

            if (Array.isArray(images)) {
                for (const imgData of images) {
                    insertImage.run(crypto.randomUUID(), iterationId, imgData, "generated");
                }
            }

            if (Array.isArray(referenceImages)) {
                for (const refData of referenceImages) {
                    insertImage.run(crypto.randomUUID(), iterationId, refData, "reference");
                }
            }
        });

        transaction();

        return NextResponse.json({ success: true, iterationId });
    } catch (error) {
        console.error("Failed to save iteration:", error);
        return NextResponse.json({ error: "Failed to save iteration" }, { status: 500 });
    }
}
