import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { validateUUID, validateName } from "@/lib/validation";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        // Validate UUID format
        const validatedId = validateUUID(id);

        const projectStmt = db.prepare("SELECT * FROM projects WHERE id = ?");
        const project = projectStmt.get(validatedId);

        if (!project) {
            return NextResponse.json({ error: "Project not found" }, { status: 404 });
        }

        const iterationsStmt = db.prepare(
            "SELECT * FROM iterations WHERE projectId = ? ORDER BY createdAt DESC"
        );
        const iterations = iterationsStmt.all(validatedId) as any[];

        const fullIterations = iterations.map((iteration) => {
            const imagesStmt = db.prepare("SELECT data, type, decorationType FROM images WHERE iterationId = ?");
            const images = imagesStmt.all(iteration.id) as { data: string; type: string; decorationType: string | null }[];

            const generatedImages = images.filter((img) => img.type === "generated");
            const referenceImages = images.filter((img) => img.type === "reference");

            return {
                ...iteration,
                decorationTypes: JSON.parse(iteration.decorationTypes),
                images: generatedImages.map((img) => img.data),
                imageDecorationTypes: generatedImages.map((img) => img.decorationType),
                referenceImages: referenceImages.map((img) => img.data),
            };
        });

        return NextResponse.json({ ...project, iterations: fullIterations });
    } catch (error) {
        console.error("Failed to fetch project:", error);

        if (error instanceof Error && error.message.includes("Invalid ID")) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }

        return NextResponse.json({ error: "An error occurred while fetching the project" }, { status: 500 });
    }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        // Validate UUID format
        const validatedId = validateUUID(id);

        const body = await request.json();

        // Validate and sanitize name
        const validatedName = validateName(body.name);

        const updateStmt = db.prepare("UPDATE projects SET name = ? WHERE id = ?");
        const result = updateStmt.run(validatedName, validatedId);

        if (result.changes === 0) {
            return NextResponse.json({ error: "Project not found" }, { status: 404 });
        }

        const projectStmt = db.prepare("SELECT * FROM projects WHERE id = ?");
        const project = projectStmt.get(validatedId);

        return NextResponse.json(project);
    } catch (error) {
        console.error("Failed to update project:", error);

        if (error instanceof Error && (error.message.includes("Invalid") || error.message.includes("required") || error.message.includes("too long"))) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }

        return NextResponse.json({ error: "An error occurred while updating the project" }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        // Validate UUID format
        const validatedId = validateUUID(id);

        const deleteStmt = db.prepare("DELETE FROM projects WHERE id = ?");
        const result = deleteStmt.run(validatedId);

        if (result.changes === 0) {
            return NextResponse.json({ error: "Project not found" }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Failed to delete project:", error);

        if (error instanceof Error && error.message.includes("Invalid ID")) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }

        return NextResponse.json({ error: "An error occurred while deleting the project" }, { status: 500 });
    }
}
