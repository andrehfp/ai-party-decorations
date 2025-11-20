import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { validateUUID } from "@/lib/validation";

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; iterationId: string }> }
) {
    try {
        const { id, iterationId } = await params;

        // Validate UUID formats
        const validatedProjectId = validateUUID(id);
        const validatedIterationId = validateUUID(iterationId);

        // Delete images first (foreign key constraint)
        const deleteImagesStmt = db.prepare("DELETE FROM images WHERE iterationId = ?");
        deleteImagesStmt.run(validatedIterationId);

        // Delete iteration
        const deleteIterationStmt = db.prepare("DELETE FROM iterations WHERE id = ?");
        const result = deleteIterationStmt.run(validatedIterationId);

        if (result.changes === 0) {
            return NextResponse.json({ error: "Iteration not found" }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Failed to delete iteration:", error);

        if (error instanceof Error && error.message.includes("Invalid ID")) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }

        return NextResponse.json({ error: "An error occurred while deleting the iteration" }, { status: 500 });
    }
}

