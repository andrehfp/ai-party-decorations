import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; iterationId: string }> }
) {
    try {
        const { iterationId } = await params;

        // Delete images first (foreign key constraint)
        const deleteImagesStmt = db.prepare("DELETE FROM images WHERE iterationId = ?");
        deleteImagesStmt.run(iterationId);

        // Delete iteration
        const deleteIterationStmt = db.prepare("DELETE FROM iterations WHERE id = ?");
        const result = deleteIterationStmt.run(iterationId);

        if (result.changes === 0) {
            return NextResponse.json({ error: "Iteration not found" }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Failed to delete iteration:", error);
        return NextResponse.json({ error: "Failed to delete iteration" }, { status: 500 });
    }
}

