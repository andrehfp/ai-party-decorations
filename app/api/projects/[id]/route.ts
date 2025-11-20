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
