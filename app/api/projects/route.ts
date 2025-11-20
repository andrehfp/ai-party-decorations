import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { validateName } from "@/lib/validation";

export async function GET() {
    try {
        const stmt = db.prepare("SELECT * FROM projects ORDER BY createdAt DESC");
        const projects = stmt.all();

        // For the main list, we might want to fetch the latest iteration count or something,
        // but for now let's just return the projects.
        // To match the frontend expectation of showing "X saves", we need to count iterations.

        const projectsWithCounts = projects.map((project: any) => {
            const countStmt = db.prepare("SELECT COUNT(*) as count FROM iterations WHERE projectId = ?");
            const { count } = countStmt.get(project.id) as { count: number };
            return {
                ...project,
                iterations: new Array(count).fill(null), // Dummy array to satisfy length check in UI for now
            };
        });

        return NextResponse.json(projectsWithCounts);
    } catch (error) {
        console.error("Failed to fetch projects:", error);
        return NextResponse.json({ error: "An error occurred while fetching projects" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        // Validate and sanitize input
        const validatedName = validateName(body.name);

        const id = crypto.randomUUID();
        const createdAt = new Date().toISOString();

        const stmt = db.prepare("INSERT INTO projects (id, name, createdAt) VALUES (?, ?, ?)");
        stmt.run(id, validatedName, createdAt);

        return NextResponse.json({ id, name: validatedName, createdAt, iterations: [] });
    } catch (error) {
        console.error("Failed to create project:", error);

        // Return validation errors with 400, other errors with 500
        if (error instanceof Error && (error.message.includes("required") || error.message.includes("invalid") || error.message.includes("too long"))) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }

        return NextResponse.json({ error: "An error occurred while creating the project" }, { status: 500 });
    }
}
