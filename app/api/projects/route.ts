import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

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
        return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { name } = body;

        if (!name) {
            return NextResponse.json({ error: "Name is required" }, { status: 400 });
        }

        const id = crypto.randomUUID();
        const createdAt = new Date().toISOString();

        const stmt = db.prepare("INSERT INTO projects (id, name, createdAt) VALUES (?, ?, ?)");
        stmt.run(id, name, createdAt);

        return NextResponse.json({ id, name, createdAt, iterations: [] });
    } catch (error) {
        console.error("Failed to create project:", error);
        return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
    }
}
