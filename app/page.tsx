'use client';

import Image from "next/image";
import { FormEvent, useMemo, useState, useEffect } from "react";

const DECORATION_OPTIONS = [
  "Cake topper",
  "Cupcake toppers",
  "Welcome banner",
  "Favor tags",
  "Photo booth props",
  "Table centerpiece",
  "Cup wraps",
  "Sticker sheet",
] as const;

const SIZE_OPTIONS = [
  {
    id: "square",
    label: "Square",
    size: "1024x1024",
    aspectRatio: undefined,
    description: "Balanced sheet that works across toppers and stickers.",
  },
  {
    id: "portrait",
    label: "Poster",
    size: "768x1024",
    aspectRatio: "3:4",
    description: "Great for door banners or welcome posters.",
  },
  {
    id: "landscape",
    label: "Banner",
    size: "1024x768",
    aspectRatio: "4:3",
    description: "Ideal for garlands and name banners.",
  },
] as const;

const STORAGE_KEY = "aiparty.projects.v1";
const ACTIVE_PROJECT_KEY = "aiparty.activeProject.v1";
const MAX_REFERENCE_IMAGES = 3;
const MAX_REFERENCE_BYTES = 5 * 1024 * 1024; // 5MB

type PartyIteration = {
  id: string;
  createdAt: string;
  theme: string;
  details?: string;
  decorationTypes: string[];
  imageCount: number;
  size: string;
  aspectRatio?: string;
  images: string[];
  prompt: string;
  referenceImages: string[];
};

type PartyProject = {
  id: string;
  name: string;
  createdAt: string;
  iterations: PartyIteration[];
};

const createId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const createProject = (name: string): PartyProject => ({
  id: createId(),
  name,
  createdAt: new Date().toISOString(),
  iterations: [],
});

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const formatTimestamp = (timestamp: string) =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).format(new Date(timestamp));

export default function Home() {
  const [projects, setProjects] = useState<PartyProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [theme, setTheme] = useState("");
  const [details, setDetails] = useState("");
  const [selectedDecorations, setSelectedDecorations] = useState<string[]>(
    DECORATION_OPTIONS.slice(0, 4),
  );
  const [imageCount, setImageCount] = useState(3);
  const [sizeChoice, setSizeChoice] = useState<string>(SIZE_OPTIONS[0].id);
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const loadState = () => {
      try {
        const storedProjects = window.localStorage.getItem(STORAGE_KEY);
        if (storedProjects) {
          const parsed = JSON.parse(storedProjects) as PartyProject[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            setProjects(parsed);
            const savedActive =
              window.localStorage.getItem(ACTIVE_PROJECT_KEY) ??
              parsed[0]?.id ??
              null;
            setActiveProjectId(savedActive);
            return;
          }
        }
      } catch (storageError) {
        console.warn("Unable to read local party projects:", storageError);
      }

      const starter = createProject("Sparkle Party Kit");
      setProjects([starter]);
      setActiveProjectId(starter.id);
    };

    loadState();
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  }, [projects, isHydrated]);

  useEffect(() => {
    if (!isHydrated || !activeProjectId) {
      return;
    }

    window.localStorage.setItem(ACTIVE_PROJECT_KEY, activeProjectId);
  }, [activeProjectId, isHydrated]);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [projects, activeProjectId],
  );

  const currentSizeOption =
    SIZE_OPTIONS.find((option) => option.id === sizeChoice) ?? SIZE_OPTIONS[0];

  const handleCreateProject = () => {
    const suggestedName = `Party ${projects.length + 1}`;
    const name =
      typeof window !== "undefined"
        ? window.prompt("Name your new party project", suggestedName)
        : suggestedName;

    if (!name) {
      return;
    }

    const project = createProject(name.trim());
    setProjects((prev) => [...prev, project]);
    setActiveProjectId(project.id);
    setTheme("");
    setDetails("");
    setReferenceImages([]);
    setSelectedDecorations(DECORATION_OPTIONS.slice(0, 4));
    setError(null);
  };

  const handleProjectSelection = (projectId: string) => {
    setActiveProjectId(projectId);
    setError(null);
  };

  const toggleDecoration = (decoration: string) => {
    setSelectedDecorations((prev) => {
      const isSelected = prev.includes(decoration);

      if (isSelected) {
        if (prev.length === 1) {
          return prev;
        }

        return prev.filter((item) => item !== decoration);
      }

      return [...prev, decoration];
    });
  };

  const handleReferenceFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }

    const availableSlots = MAX_REFERENCE_IMAGES - referenceImages.length;

    if (availableSlots <= 0) {
      setError(`You can attach up to ${MAX_REFERENCE_IMAGES} references.`);
      return;
    }

    const nextFiles = Array.from(files).slice(0, availableSlots);
    const uploaded: string[] = [];

    for (const file of nextFiles) {
      if (file.size > MAX_REFERENCE_BYTES) {
        setError(`"${file.name}" is larger than 5MB.`);
        continue;
      }

      try {
        const dataUrl = await readFileAsDataUrl(file);
        uploaded.push(dataUrl);
      } catch (uploadError) {
        console.error("Failed to read reference image:", uploadError);
        setError("Unable to read one of the reference images.");
      }
    }

    if (uploaded.length > 0) {
      setReferenceImages((prev) =>
        [...prev, ...uploaded].slice(0, MAX_REFERENCE_IMAGES),
      );
      setError(null);
    }
  };

  const handleReferenceDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    handleReferenceFiles(event.dataTransfer?.files ?? null);
  };

  const removeReferenceImage = (index: number) => {
    setReferenceImages((prev) => prev.filter((_, idx) => idx !== index));
  };

  const reuseIteration = (iteration: PartyIteration) => {
    setTheme(iteration.theme);
    setDetails(iteration.details ?? "");
    setSelectedDecorations(iteration.decorationTypes);
    setImageCount(iteration.imageCount);

    const matchingSize =
      SIZE_OPTIONS.find(
        (option) =>
          option.size === iteration.size &&
          option.aspectRatio === iteration.aspectRatio,
      )?.id ??
      SIZE_OPTIONS.find((option) => option.size === iteration.size)?.id ??
      SIZE_OPTIONS[0].id;

    setSizeChoice(matchingSize);
    setReferenceImages(iteration.referenceImages);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await handleGenerate();
  };

  const handleGenerate = async () => {
    if (!activeProject) {
      setError("Create a project first to store your ideas.");
      return;
    }

    if (!theme.trim()) {
      setError("Please describe a party theme before generating art.");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          theme: theme.trim(),
          details: details.trim(),
          decorationTypes: selectedDecorations,
          imageCount,
          size: currentSizeOption.size,
          aspectRatio: currentSizeOption.aspectRatio,
          referenceImages,
          projectName: activeProject.name,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error: string }
          | null;
        throw new Error(data?.error ?? "Something went wrong while creating art");
      }

      const data = (await response.json()) as { images: string[]; prompt: string };

      const iteration: PartyIteration = {
        id: createId(),
        createdAt: new Date().toISOString(),
        theme: theme.trim(),
        details: details.trim() || undefined,
        decorationTypes: [...selectedDecorations],
        imageCount,
        size: currentSizeOption.size,
        aspectRatio: currentSizeOption.aspectRatio,
        images: data.images,
        prompt: data.prompt,
        referenceImages: [...referenceImages],
      };

      setProjects((prev) =>
        prev.map((project) =>
          project.id === activeProject.id
            ? { ...project, iterations: [iteration, ...project.iterations] }
            : project,
        ),
      );
    } catch (generationError) {
      console.error("Failed to generate decorations:", generationError);
      setError(
        generationError instanceof Error
          ? generationError.message
          : "Unable to generate decorations right now.",
      );
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans text-zinc-600">
        Loading your party studio...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-violet-100 pb-16">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pt-10 font-sans lg:flex-row lg:px-8">
        <section className="lg:w-1/3">
          <div className="rounded-3xl border border-white/40 bg-white/80 p-6 shadow-xl shadow-pink-100/60 backdrop-blur">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-pink-500">
                  Party projects
                </p>
                <p className="mt-1 text-lg font-semibold text-zinc-900">
                  Your creative queue
                </p>
              </div>
              <button
                type="button"
                onClick={handleCreateProject}
                className="rounded-full bg-pink-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-pink-600"
              >
                New +
              </button>
            </div>
            <div className="mt-6 space-y-2">
              {projects.map((project) => {
                const isActive = project.id === activeProjectId;
                return (
                  <button
                    key={project.id}
                    onClick={() => handleProjectSelection(project.id)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                      isActive
                        ? "border-pink-400 bg-pink-50/80 shadow-md"
                        : "border-zinc-200 bg-white/70 hover:border-pink-200"
                    }`}
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold text-zinc-900">
                        {project.name}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {project.iterations.length} saves
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500">
                      Started {formatTimestamp(project.createdAt)}
                    </p>
                  </button>
                );
              })}
              {projects.length === 0 && (
                <p className="rounded-2xl border border-dashed border-zinc-200 p-4 text-sm text-zinc-500">
                  Create your first party brief to get started.
                </p>
              )}
            </div>
          </div>
        </section>
        <section className="flex-1 space-y-8">
          <div className="rounded-3xl border border-white/60 bg-white/90 p-8 shadow-xl shadow-violet-100/70 backdrop-blur">
            <div>
              <p className="text-sm uppercase tracking-[0.4em] text-violet-500">
                Kids party atelier
              </p>
              <h1 className="mt-2 text-3xl font-semibold text-zinc-900">
                Feed a theme, get a full decoration collection
              </h1>
              <p className="mt-3 text-base text-zinc-600">
                Describe your party idea, drop in inspiration photos, and the AI
                studio will return multiple printable pieces in one go.
              </p>
              {activeProject && (
                <div className="mt-4 inline-flex items-center gap-3 rounded-full bg-pink-100/60 px-4 py-2 text-sm text-pink-700">
                  <span className="h-2 w-2 rounded-full bg-pink-500" />
                  Working on <strong className="font-semibold">{activeProject.name}</strong>
                </div>
              )}
            </div>
            <form onSubmit={handleSubmit} className="mt-8 space-y-6">
              <div>
                <label className="text-sm font-semibold text-zinc-700">
                  Party theme
                </label>
                <input
                  value={theme}
                  onChange={(event) => setTheme(event.target.value)}
                  placeholder="e.g. Cosmic roller disco for a 7th birthday"
                  className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white/70 px-4 py-3 text-base text-zinc-900 outline-none ring-pink-200 transition focus:border-pink-300 focus:ring"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-zinc-700">
                  Extra art direction
                </label>
                <textarea
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                  placeholder="Palette, motifs, kid names, wording, cultural cues..."
                  rows={3}
                  className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white/70 px-4 py-3 text-base text-zinc-900 outline-none ring-pink-200 transition focus:border-pink-300 focus:ring"
                />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-zinc-700">
                    Decorations to emphasize
                  </label>
                  <span className="text-xs text-zinc-500">
                    Pick at least one focus
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {DECORATION_OPTIONS.map((option) => {
                    const isSelected = selectedDecorations.includes(option);
                    return (
                      <button
                        type="button"
                        key={option}
                        onClick={() => toggleDecoration(option)}
                        className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                          isSelected
                            ? "border-pink-400 bg-pink-50 text-pink-700"
                            : "border-zinc-200 bg-white text-zinc-600 hover:border-pink-200"
                        }`}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-zinc-200 bg-white/60 p-4">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-zinc-700">
                      Variations per batch
                    </label>
                    <span className="text-sm font-semibold text-pink-600">
                      {imageCount}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={6}
                    value={imageCount}
                    onChange={(event) => setImageCount(Number(event.target.value))}
                    className="mt-4 w-full accent-pink-500"
                  />
                  <p className="mt-2 text-xs text-zinc-500">
                    Generate up to 6 illustrations per iteration.
                  </p>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-white/60 p-4">
                  <label className="text-sm font-semibold text-zinc-700">
                    Canvas format
                  </label>
                  <div className="mt-3 space-y-2">
                    {SIZE_OPTIONS.map((option) => {
                      const isActive = option.id === currentSizeOption.id;
                      return (
                        <button
                          type="button"
                          key={option.id}
                          onClick={() => setSizeChoice(option.id)}
                          className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                            isActive
                              ? "border-violet-400 bg-violet-50 text-violet-700"
                              : "border-zinc-200 hover:border-violet-200"
                          }`}
                        >
                          <p className="text-sm font-semibold">{option.label}</p>
                          <p className="text-xs text-zinc-500">
                            {option.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div>
                <label className="text-sm font-semibold text-zinc-700">
                  Reference images
                </label>
                <label
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={handleReferenceDrop}
                  className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white/60 px-6 py-8 text-center text-sm text-zinc-500 transition hover:border-pink-300 hover:text-pink-600"
                >
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={(event) => handleReferenceFiles(event.target.files)}
                  />
                  <span className="text-base font-semibold text-zinc-700">
                    Drop files or click to upload
                  </span>
                  <span className="mt-1">
                    Up to {MAX_REFERENCE_IMAGES} images (5MB each).
                  </span>
                  <span className="mt-2 rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-500">
                    Optional but helpful for matching palettes
                  </span>
                </label>
                {referenceImages.length > 0 && (
                  <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
                    {referenceImages.map((src, index) => (
                      <div
                        key={`${src}-${index}`}
                        className="group relative overflow-hidden rounded-2xl border border-zinc-200"
                      >
                        <Image
                          src={src}
                          alt={`Reference ${index + 1}`}
                          width={320}
                          height={240}
                          className="h-32 w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeReferenceImage(index)}
                          className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-1 text-xs font-medium text-zinc-700 shadow-sm transition hover:bg-white"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="submit"
                  disabled={isGenerating}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-violet-500 px-6 py-3 text-lg font-semibold text-white shadow-lg shadow-pink-200 transition hover:from-pink-600 hover:to-violet-600 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  {isGenerating ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-b-transparent" />
                      Generating magic…
                    </>
                  ) : (
                    "Generate party set"
                  )}
                </button>
                {error && (
                  <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                    {error}
                  </p>
                )}
              </div>
            </form>
          </div>
          <div className="rounded-3xl border border-white/60 bg-white/80 p-6 shadow-xl shadow-zinc-200/70 backdrop-blur">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">
                  Project history
                </p>
                <h2 className="text-2xl font-semibold text-zinc-900">
                  Every generation, archived
                </h2>
              </div>
              {activeProject && (
                <span className="text-sm text-zinc-500">
                  {activeProject.iterations.length} saved runs
                </span>
              )}
            </div>
            {!activeProject || activeProject.iterations.length === 0 ? (
              <p className="mt-4 rounded-2xl border border-dashed border-zinc-200 p-6 text-sm text-zinc-500">
                No generations yet for this project. Submit a theme to start the
                inspiration feed.
              </p>
            ) : (
              <div className="mt-6 space-y-6">
                {activeProject.iterations.map((iteration) => (
                  <article
                    key={iteration.id}
                    className="rounded-2xl border border-zinc-100 bg-white/90 p-5 shadow-sm"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-widest text-zinc-400">
                          {formatTimestamp(iteration.createdAt)}
                        </p>
                        <h3 className="text-xl font-semibold text-zinc-900">
                          {iteration.theme}
                        </h3>
                        {iteration.details && (
                          <p className="text-sm text-zinc-500">
                            {iteration.details}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => reuseIteration(iteration)}
                        className="self-start rounded-full border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-pink-300 hover:text-pink-600"
                      >
                        Reuse settings
                      </button>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {iteration.decorationTypes.map((decoration) => (
                        <span
                          key={decoration}
                          className="rounded-full bg-pink-50 px-3 py-1 text-xs font-semibold text-pink-600"
                        >
                          {decoration}
                        </span>
                      ))}
                    </div>
                    {iteration.referenceImages.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs uppercase tracking-widest text-zinc-400">
                          Reference inspo
                        </p>
                        <div className="mt-2 flex gap-2">
                          {iteration.referenceImages.map((src, index) => (
                            <Image
                              key={`${iteration.id}-ref-${index}`}
                              src={src}
                              alt="Reference"
                              width={80}
                              height={80}
                              className="h-14 w-14 rounded-xl border border-zinc-100 object-cover"
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      {iteration.images.map((src, index) => (
                        <div
                          key={`${iteration.id}-image-${index}`}
                          className="overflow-hidden rounded-2xl border border-zinc-100"
                        >
                          <Image
                            src={src}
                            alt={`Generated decoration ${index + 1}`}
                            width={600}
                            height={600}
                            className="h-48 w-full object-cover"
                          />
                        </div>
                      ))}
                    </div>
                    <details className="mt-4 text-sm text-zinc-500">
                      <summary className="cursor-pointer text-sm font-semibold text-zinc-600">
                        Prompt details
                      </summary>
                      <p className="mt-2 whitespace-pre-wrap rounded-2xl bg-zinc-50 p-3 text-sm text-zinc-600">
                        {iteration.prompt}
                      </p>
                    </details>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
