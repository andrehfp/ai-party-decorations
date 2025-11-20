import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const projectStmt = db.prepare("SELECT * FROM projects WHERE id = ?");
        const project = projectStmt.get(id);

        if (!project) {
            return NextResponse.json({ error: "Project not found" }, { status: 404 });
        }

        const iterationsStmt = db.prepare(
            "SELECT * FROM iterations WHERE projectId = ? ORDER BY createdAt DESC"
        );
        const iterations = iterationsStmt.all(id) as any[];

        const fullIterations = iterations.map((iteration) => {
            const imagesStmt = db.prepare("SELECT data, type FROM images WHERE iterationId = ?");
            const images = imagesStmt.all(iteration.id) as { data: string; type: string }[];

            return {
                ...iteration,
                decorationTypes: JSON.parse(iteration.decorationTypes),
                images: images.filter((img) => img.type === "generated").map((img) => img.data),
                referenceImages: images.filter((img) => img.type === "reference").map((img) => img.data),
            };
        });

        return NextResponse.json({ ...project, iterations: fullIterations });
    } catch (error) {
        console.error("Failed to fetch project:", error);
        return NextResponse.json({ error: "Failed to fetch project" }, { status: 500 });
    }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const { name } = body;

        if (!name || !name.trim()) {
            return NextResponse.json({ error: "Name is required" }, { status: 400 });
        }

        const updateStmt = db.prepare("UPDATE projects SET name = ? WHERE id = ?");
        const result = updateStmt.run(name.trim(), id);

        if (result.changes === 0) {
            return NextResponse.json({ error: "Project not found" }, { status: 404 });
        }

        const projectStmt = db.prepare("SELECT * FROM projects WHERE id = ?");
        const project = projectStmt.get(id);

        return NextResponse.json(project);
    } catch (error) {
        console.error("Failed to update project:", error);
        return NextResponse.json({ error: "Failed to update project" }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const deleteStmt = db.prepare("DELETE FROM projects WHERE id = ?");
        const result = deleteStmt.run(id);

        if (result.changes === 0) {
            return NextResponse.json({ error: "Project not found" }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Failed to delete project:", error);
        return NextResponse.json({ error: "Failed to delete project" }, { status: 500 });
    }
}
