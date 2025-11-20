'use client';

import { saveAs } from "file-saver";
import JSZip from "jszip";
import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

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
    icon: "⬜",
  },
  {
    id: "portrait",
    label: "Poster",
    size: "768x1024",
    aspectRatio: "3:4",
    description: "Great for door banners or welcome posters.",
    icon: "📄",
  },
  {
    id: "landscape",
    label: "Banner",
    size: "1024x768",
    aspectRatio: "4:3",
    description: "Ideal for garlands and name banners.",
    icon: "🏷️",
  },
] as const;

const MAX_REFERENCE_IMAGES = 3;
const MAX_REFERENCE_BYTES = 5 * 1024 * 1024; // 5MB

type PartyIteration = {
  id: string;
  createdAt?: string;
  theme: string;
  details?: string;
  decorationTypes: string[];
  imageCount: number;
  size: string;
  aspectRatio?: string;
  images: string[];
  imageDecorationTypes?: (string | null)[]; // Decoration type for each image
  prompt: string;
  referenceImages: string[];
};

type PartyProject = {
  id: string;
  name: string;
  createdAt: string;
  iterations: PartyIteration[];
};

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

// Toast types
type ToastType = 'success' | 'error' | 'info';
type Toast = {
  id: string;
  message: string;
  type: ToastType;
};

// Quick templates
const QUICK_TEMPLATES = [
  {
    theme: "Unicorn rainbow birthday",
    details: "Pastel colors, sparkles, magical elements",
  },
  {
    theme: "Space adventure party",
    details: "Stars, planets, rockets, cosmic theme",
  },
  {
    theme: "Princess tea party",
    details: "Elegant, pink and gold, tea cups, crowns",
  },
  {
    theme: "Superhero training camp",
    details: "Bold colors, action poses, capes and masks",
  },
];

export default function Home() {
  const [projects, setProjects] = useState<PartyProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [theme, setTheme] = useState("");
  const [details, setDetails] = useState("");
  const [selectedDecorations, setSelectedDecorations] = useState<string[]>(
    DECORATION_OPTIONS.slice(0, 4),
  );
  const [sizeChoice, setSizeChoice] = useState<string>(SIZE_OPTIONS[0].id);
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<{ src: string; index: number; images: string[] } | null>(null);

  // Toast system
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Search and filter
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'iterations'>('date');

  // Project management
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState("");
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);

  // Form auto-save
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Mobile gestures
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [touchEnd, setTouchEnd] = useState<{ x: number; y: number } | null>(null);

  // Loading states
  const [downloadingImages, setDownloadingImages] = useState<Set<string>>(new Set());

  // Toast functions
  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    const newToast: Toast = { id, message, type };
    setToasts((prev) => [...prev, newToast]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Image download functions
  const downloadImage = useCallback(async (src: string, filename: string) => {
    try {
      setDownloadingImages((prev) => new Set(prev).add(src));
      const response = await fetch(src);
      const blob = await response.blob();
      saveAs(blob, filename);
      showToast('Image downloaded successfully', 'success');
    } catch (error) {
      showToast('Failed to download image', 'error');
    } finally {
      setDownloadingImages((prev) => {
        const next = new Set(prev);
        next.delete(src);
        return next;
      });
    }
  }, [showToast]);

  const downloadAllImages = useCallback(async (iteration: PartyIteration) => {
    try {
      setDownloadingImages(new Set(iteration.images));
      const zip = new JSZip();
      const imagePromises = iteration.images.map(async (src, index) => {
        const response = await fetch(src);
        const blob = await response.blob();
        const decorationType = iteration.imageDecorationTypes?.[index];
        const typePrefix = decorationType ? `${decorationType.replace(/[^a-z0-9]/gi, '_')}_` : '';
        const filename = `${iteration.theme.replace(/[^a-z0-9]/gi, '_')}_${typePrefix}${index + 1}.png`;
        zip.file(filename, blob);
      });

      await Promise.all(imagePromises);
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipFilename = `${iteration.theme.replace(/[^a-z0-9]/gi, '_')}_decorations.zip`;
      saveAs(zipBlob, zipFilename);
      showToast('All images downloaded as ZIP', 'success');
    } catch (error) {
      showToast('Failed to create ZIP file', 'error');
    } finally {
      setDownloadingImages(new Set());
    }
  }, [showToast]);

  const copyImageToClipboard = useCallback(async (src: string) => {
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob })
      ]);
      showToast('Image copied to clipboard', 'success');
    } catch (error) {
      showToast('Failed to copy image', 'error');
    }
  }, [showToast]);

  // Project management functions
  const handleRenameProject = useCallback(async (projectId: string, newName: string) => {
    if (!newName.trim()) return;

    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });

      if (res.ok) {
        setProjects((prev) =>
          prev.map((p) => (p.id === projectId ? { ...p, name: newName.trim() } : p))
        );
        setEditingProjectId(null);
        showToast('Project renamed successfully', 'success');
      } else {
        showToast('Failed to rename project', 'error');
      }
    } catch (error) {
      showToast('Failed to rename project', 'error');
    }
  }, [showToast]);

  const handleDeleteProject = useCallback(async (projectId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setProjects((prev) => {
          const filtered = prev.filter((p) => p.id !== projectId);
          if (activeProjectId === projectId) {
            setActiveProjectId(filtered.length > 0 ? filtered[0].id : null);
          }
          return filtered;
        });
        setDeletingProjectId(null);
        showToast('Project deleted successfully', 'success');
      } else {
        showToast('Failed to delete project', 'error');
      }
    } catch (error) {
      showToast('Failed to delete project', 'error');
    }
  }, [activeProjectId, showToast]);

  // Iteration management functions
  const handleDeleteIteration = useCallback(async (projectId: string, iterationId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/iterations/${iterationId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setProjects((prev) =>
          prev.map((project) =>
            project.id === projectId
              ? { ...project, iterations: project.iterations.filter((it) => it.id !== iterationId) }
              : project
          )
        );
        showToast('Iteration deleted successfully', 'success');
      } else {
        showToast('Failed to delete iteration', 'error');
      }
    } catch (error) {
      showToast('Failed to delete iteration', 'error');
    }
  }, [showToast]);

  const handleDuplicateIteration = useCallback((iteration: PartyIteration) => {
    reuseIteration(iteration);
    showToast('Settings copied to form', 'info');
  }, []);

  // Form auto-save
  useEffect(() => {
    const formData = {
      theme,
      details,
      selectedDecorations,
      sizeChoice,
      referenceImages,
    };

    if (theme.trim() || details.trim() || referenceImages.length > 0) {
      setHasUnsavedChanges(true);
      sessionStorage.setItem('party-form-draft', JSON.stringify(formData));
    }
  }, [theme, details, selectedDecorations, sizeChoice, referenceImages]);

  // Load form draft on mount
  useEffect(() => {
    const draft = sessionStorage.getItem('party-form-draft');
    if (draft) {
      try {
        const formData = JSON.parse(draft);
        if (formData.theme || formData.details) {
          setTheme(formData.theme || '');
          setDetails(formData.details || '');
          setSelectedDecorations(formData.selectedDecorations || DECORATION_OPTIONS.slice(0, 4));
          setSizeChoice(formData.sizeChoice || SIZE_OPTIONS[0].id);
          setReferenceImages(formData.referenceImages || []);
          setHasUnsavedChanges(true);
        }
      } catch (error) {
        console.error('Failed to load draft', error);
      }
    }
  }, []);

  // Clear draft after successful generation
  const clearFormDraft = useCallback(() => {
    sessionStorage.removeItem('party-form-draft');
    setHasUnsavedChanges(false);
  }, []);

  // Mobile swipe gesture handler
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart({ x: e.targetTouches[0].clientX, y: e.targetTouches[0].clientY });
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    setTouchEnd({ x: e.targetTouches[0].clientX, y: e.targetTouches[0].clientY });
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!touchStart || !touchEnd || !lightboxImage) return;

    const distanceX = touchStart.x - touchEnd.x;
    const distanceY = touchStart.y - touchEnd.y;
    const isLeftSwipe = distanceX > 50;
    const isRightSwipe = distanceX < -50;
    const isVerticalSwipe = Math.abs(distanceY) > Math.abs(distanceX);

    if (!isVerticalSwipe) {
      if (isLeftSwipe && lightboxImage.index < lightboxImage.images.length - 1) {
        navigateLightbox('next');
      }
      if (isRightSwipe && lightboxImage.index > 0) {
        navigateLightbox('prev');
      }
    }
  }, [touchStart, touchEnd, lightboxImage]);

  // Filtered and sorted projects
  const filteredAndSortedProjects = useMemo(() => {
    let filtered = projects;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((p) =>
        p.name.toLowerCase().includes(query) ||
        p.iterations.some((it) =>
          it.theme.toLowerCase().includes(query) ||
          it.details?.toLowerCase().includes(query)
        )
      );
    }

    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'iterations':
          return b.iterations.length - a.iterations.length;
        case 'date':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    return sorted;
  }, [projects, searchQuery, sortBy]);

  // Fetch projects on mount
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const res = await fetch("/api/projects");
        if (res.ok) {
          const data = await res.json();
          setProjects(data);
          if (data.length > 0) {
            setActiveProjectId(data[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to load projects", err);
      } finally {
        setIsLoadingProjects(false);
      }
    };
    fetchProjects();
  }, []);

  // Fetch active project details when selection changes
  useEffect(() => {
    if (!activeProjectId) return;

    const fetchProjectDetails = async () => {
      try {
        const res = await fetch(`/api/projects/${activeProjectId}`);
        if (res.ok) {
          const fullProject = await res.json();
          setProjects((prev) =>
            prev.map((p) => (p.id === activeProjectId ? fullProject : p))
          );
        }
      } catch (err) {
        console.error("Failed to load project details", err);
      }
    };

    fetchProjectDetails();
  }, [activeProjectId]);

  // Handle keyboard navigation in lightbox
  useEffect(() => {
    if (!lightboxImage) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLightboxImage(null);
      } else if (event.key === 'ArrowLeft' && lightboxImage.index > 0) {
        setLightboxImage({
          ...lightboxImage,
          index: lightboxImage.index - 1,
          src: lightboxImage.images[lightboxImage.index - 1],
        });
      } else if (event.key === 'ArrowRight' && lightboxImage.index < lightboxImage.images.length - 1) {
        setLightboxImage({
          ...lightboxImage,
          index: lightboxImage.index + 1,
          src: lightboxImage.images[lightboxImage.index + 1],
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxImage]);

  // Prevent body scroll when lightbox is open
  useEffect(() => {
    if (lightboxImage) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [lightboxImage]);

  const openLightbox = (src: string, index: number, images: string[]) => {
    setLightboxImage({ src, index, images });
  };

  const closeLightbox = () => {
    setLightboxImage(null);
  };

  const navigateLightbox = (direction: 'prev' | 'next') => {
    if (!lightboxImage) return;

    const newIndex = direction === 'prev'
      ? lightboxImage.index - 1
      : lightboxImage.index + 1;

    if (newIndex >= 0 && newIndex < lightboxImage.images.length) {
      setLightboxImage({
        ...lightboxImage,
        index: newIndex,
        src: lightboxImage.images[newIndex],
      });
    }
  };

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [projects, activeProjectId],
  );

  const currentSizeOption =
    SIZE_OPTIONS.find((option) => option.id === sizeChoice) ?? SIZE_OPTIONS[0];

  const handleCreateProject = async () => {
    const suggestedName = `Party ${projects.length + 1}`;
    const name = window.prompt("Name your new party project", suggestedName);

    if (!name) {
      return;
    }

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });

      if (res.ok) {
        const newProject = await res.json();
        setProjects((prev) => [newProject, ...prev]);
        setActiveProjectId(newProject.id);

        // Reset form
        setTheme("");
        setDetails("");
        setReferenceImages([]);
        setSelectedDecorations(DECORATION_OPTIONS.slice(0, 4));
        setError(null);
        clearFormDraft();
        showToast(`Project "${newProject.name}" created successfully`, 'success');
      } else {
        showToast("Failed to create project. Please try again.", 'error');
      }
    } catch (err) {
      console.error("Failed to create project", err);
      showToast("Failed to create project. Please try again.", 'error');
    }
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
      showToast(`You can attach up to ${MAX_REFERENCE_IMAGES} references.`, 'error');
      return;
    }

    const nextFiles = Array.from(files).slice(0, availableSlots);
    const uploaded: string[] = [];

    for (const file of nextFiles) {
      if (file.size > MAX_REFERENCE_BYTES) {
        showToast(`"${file.name}" is larger than 5MB.`, 'error');
        continue;
      }

      try {
        const dataUrl = await readFileAsDataUrl(file);
        uploaded.push(dataUrl);
      } catch (uploadError) {
        console.error("Failed to read reference image:", uploadError);
        showToast("Unable to read one of the reference images.", 'error');
      }
    }

    if (uploaded.length > 0) {
      setReferenceImages((prev) =>
        [...prev, ...uploaded].slice(0, MAX_REFERENCE_IMAGES),
      );
      showToast(`Added ${uploaded.length} reference image${uploaded.length > 1 ? 's' : ''}`, 'success');
    }
  };

  const handleReferenceDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    handleReferenceFiles(event.dataTransfer?.files ?? null);
  };

  const handleDragOver = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const removeReferenceImage = (index: number) => {
    setReferenceImages((prev) => prev.filter((_, idx) => idx !== index));
  };

  const reuseIteration = (iteration: PartyIteration) => {
    setTheme(iteration.theme);
    setDetails(iteration.details ?? "");
    setSelectedDecorations(iteration.decorationTypes);
    // imageCount is now derived from selectedDecorations.length

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
      showToast("Create a project first to store your ideas.", 'error');
      return;
    }

    if (!theme.trim()) {
      showToast("Please describe a party theme before generating art.", 'error');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      // Create temp iteration IMMEDIATELY before making the request
      // This ensures loading placeholders show right away
      const tempIterationId = `temp-${Date.now()}`;
      const initialImages = Array.from({ length: selectedDecorations.length }, () => "");
      const initialTypes = Array.from({ length: selectedDecorations.length }, () => null);

      const tempIteration: PartyIteration = {
        id: tempIterationId,
        createdAt: new Date().toISOString(),
        theme: theme.trim(),
        details: details.trim() || undefined,
        decorationTypes: [...selectedDecorations],
        imageCount: selectedDecorations.length,
        size: currentSizeOption.size,
        aspectRatio: currentSizeOption.aspectRatio,
        images: initialImages,
        imageDecorationTypes: initialTypes,
        prompt: "",
        referenceImages: [...referenceImages],
      };

      // Add temp iteration immediately so loading placeholders show
      setProjects((prev) =>
        prev.map((project) =>
          project.id === activeProject.id
            ? { ...project, iterations: [tempIteration, ...project.iterations] }
            : project,
        ),
      );

      // Scroll to temp iteration
      setTimeout(() => {
        const element = document.getElementById(`iteration-${tempIterationId}`);
        element?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 100);

      // Use streaming mode
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          theme: theme.trim(),
          details: details.trim(),
          decorationTypes: selectedDecorations,
          size: currentSizeOption.size,
          aspectRatio: currentSizeOption.aspectRatio,
          referenceImages,
          projectName: activeProject.name,
          stream: true, // Enable streaming
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error: string }
          | null;
        throw new Error(data?.error ?? "Something went wrong while creating art");
      }

      // Check if response is streaming (text/event-stream)
      const contentType = response.headers.get("content-type");
      const isStreaming = contentType?.includes("text/event-stream");

      if (isStreaming) {
        await handleStreamingResponse(response, tempIterationId);
      } else {
        // Fallback to non-streaming mode
        const data = (await response.json()) as {
          images: string[];
          decorationTypes: string[];
          prompts: string[];
        };
        await saveAndDisplayIteration(data.images, data.decorationTypes, data.prompts);
      }
    } catch (generationError) {
      console.error("Failed to generate decorations:", generationError);
      const errorMessage = generationError instanceof Error
        ? generationError.message
        : "Unable to generate decorations right now.";
      setError(errorMessage);
      showToast(errorMessage, 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStreamingResponse = async (response: Response, tempIterationId: string) => {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Response body is not readable");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    // Track received images and errors
    const receivedImages: string[] = [];
    const receivedTypes: string[] = [];
    const receivedPrompts: string[] = [];
    const imageMap = new Map<number, { image: string; decorationType: string; prompt: string }>();
    const errorMap = new Map<number, { error: string; decorationType: string }>();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim() || !line.startsWith("data: ")) continue;

          const data = line.slice(6);
          if (data === "[DONE]") {
            console.log("[Streaming] Received [DONE] signal");
            // All images received, finalize
            // Don't filter - maintain array indices for proper display
            const finalImages = selectedDecorations.map((_, idx) =>
              imageMap.get(idx)?.image || ""
            );
            const finalTypes = selectedDecorations.map((_, idx) =>
              imageMap.get(idx)?.decorationType || null
            );
            const finalPrompts = selectedDecorations.map((_, idx) =>
              imageMap.get(idx)?.prompt || ""
            );

            const receivedCount = finalImages.filter(img => img).length;
            console.log(`[Streaming] Finalizing: ${receivedCount}/${selectedDecorations.length} images`);

            // If no images were received, show error
            if (receivedCount === 0) {
              const errors = Array.from(errorMap.values());
              const errorMsg = errors.length > 0
                ? errors.map(e => `${e.decorationType}: ${e.error}`).join("; ")
                : "No images were generated. Please check your API credits and try again.";
              throw new Error(errorMsg);
            }

            await saveAndDisplayIteration(finalImages.filter(img => img), finalTypes.filter(t => t) as string[], finalPrompts.filter(p => p), tempIterationId);
            return;
          }

          try {
            const parsed = JSON.parse(data);

            // Handle errors - collect them but don't throw immediately
            if (parsed.error) {
              const errorMsg = typeof parsed.error === "string"
                ? parsed.error
                : parsed.error.message || "Unknown error";
              const decorationType = parsed.decorationType || "Unknown";
              const index = typeof parsed.index === "number" ? parsed.index : -1;

              console.error(`[Streaming] Error for ${decorationType} (index ${index}):`, errorMsg);
              errorMap.set(index, { error: errorMsg, decorationType });
              // Continue processing other images
              continue;
            }

            // Handle image chunks
            if (parsed.image && typeof parsed.index === "number") {
              const { image, decorationType, index, prompt } = parsed;

              console.log(`[Streaming] Received image ${index + 1}/${selectedDecorations.length} for ${decorationType}`);
              imageMap.set(index, { image, decorationType, prompt });

              // Update the temporary iteration with new image
              // Build arrays maintaining proper indices (empty strings for missing images)
              const currentImages: string[] = Array.from({ length: selectedDecorations.length }, (_, idx) =>
                imageMap.get(idx)?.image || ""
              );
              const currentTypes: (string | null)[] = Array.from({ length: selectedDecorations.length }, (_, idx) =>
                imageMap.get(idx)?.decorationType || null
              );
              const currentPrompts: string[] = Array.from({ length: selectedDecorations.length }, (_, idx) =>
                imageMap.get(idx)?.prompt || ""
              );

              console.log(`[Streaming] Updating UI: ${currentImages.filter(img => img).length}/${selectedDecorations.length} images received`);

              setProjects((prev) =>
                prev.map((project) =>
                  project.id === activeProject!.id
                    ? {
                      ...project,
                      iterations: project.iterations.map((iter) =>
                        iter.id === tempIterationId
                          ? {
                            ...iter,
                            images: [...currentImages], // Create new array to ensure React detects change
                            imageDecorationTypes: [...currentTypes],
                            prompt: currentPrompts.join("\n\n---\n\n"),
                          }
                          : iter,
                      ),
                    }
                    : project,
                ),
              );
            }
          } catch (parseError) {
            // Log actual parse errors for debugging, but continue processing
            console.warn("[Streaming] Failed to parse chunk:", parseError, "Data:", data.substring(0, 200));
            continue;
          }
        }
      }

      // Handle remaining buffer
      if (buffer.trim() && buffer.startsWith("data: ")) {
        const data = buffer.slice(6);
        if (data !== "[DONE]") {
          try {
            const parsed = JSON.parse(data);
            if (parsed.image && typeof parsed.index === "number") {
              const { image, decorationType, index, prompt } = parsed;
              imageMap.set(index, { image, decorationType, prompt });
            }
          } catch {
            // Ignore parse errors
          }
        }
      }

      // Finalize with all received images (stream ended without [DONE])
      console.log("[Streaming] Stream ended, finalizing with received images");
      const finalImages = selectedDecorations.map((_, idx) =>
        imageMap.get(idx)?.image || ""
      );
      const finalTypes = selectedDecorations.map((_, idx) =>
        imageMap.get(idx)?.decorationType || null
      );
      const finalPrompts = selectedDecorations.map((_, idx) =>
        imageMap.get(idx)?.prompt || ""
      );

      const receivedCount = finalImages.filter(img => img).length;
      console.log(`[Streaming] Finalizing: ${receivedCount}/${selectedDecorations.length} images received`);

      if (receivedCount === 0) {
        const errors = Array.from(errorMap.values());
        const errorMsg = errors.length > 0
          ? errors.map(e => `${e.decorationType}: ${e.error}`).join("; ")
          : "No images were received from the stream";
        throw new Error(errorMsg);
      }

      await saveAndDisplayIteration(finalImages.filter(img => img), finalTypes.filter(t => t) as string[], finalPrompts.filter(p => p), tempIterationId);
    } catch (streamError) {
      console.error("[Streaming] Error during streaming:", streamError);
      // Remove temp iteration on error
      setProjects((prev) =>
        prev.map((project) =>
          project.id === activeProject!.id
            ? {
              ...project,
              iterations: project.iterations.filter((iter) => iter.id !== tempIterationId),
            }
            : project,
        ),
      );
      throw streamError;
    } finally {
      reader.releaseLock();
    }
  };

  const saveAndDisplayIteration = async (
    images: string[],
    decorationTypes: string[],
    prompts: string[],
    tempIterationId?: string,
  ) => {
    // Save to DB
    const saveRes = await fetch(`/api/projects/${activeProject!.id}/iterations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        theme: theme.trim(),
        details: details.trim(),
        decorationTypes: selectedDecorations,
        imageCount: selectedDecorations.length,
        size: currentSizeOption.size,
        aspectRatio: currentSizeOption.aspectRatio,
        images,
        imageDecorationTypes: decorationTypes,
        prompt: prompts.join("\n\n---\n\n"),
        referenceImages,
      }),
    });

    if (!saveRes.ok) {
      throw new Error("Failed to save your creation.");
    }

    const { iterationId } = await saveRes.json();

    // Update local state with final iteration
    const newIteration: PartyIteration = {
      id: iterationId,
      createdAt: new Date().toISOString(),
      theme: theme.trim(),
      details: details.trim() || undefined,
      decorationTypes: [...selectedDecorations],
      imageCount: selectedDecorations.length,
      size: currentSizeOption.size,
      aspectRatio: currentSizeOption.aspectRatio,
      images,
      imageDecorationTypes: decorationTypes,
      prompt: prompts.join("\n\n---\n\n"),
      referenceImages: [...referenceImages],
    };

    setProjects((prev) =>
      prev.map((project) =>
        project.id === activeProject!.id
          ? {
            ...project,
            iterations: project.iterations.map((iter) =>
              iter.id === tempIterationId ? newIteration : iter,
            ),
          }
          : project,
      ),
    );

    // Scroll to final iteration
    setTimeout(() => {
      const element = document.getElementById(`iteration-${iterationId}`);
      element?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 100);

    clearFormDraft();
    showToast(`Generated ${images.length} decoration${images.length > 1 ? 's' : ''} successfully!`, 'success');
  };

  if (isLoadingProjects) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-violet-50">
        <header className="sticky top-0 z-50 border-b border-pink-100/50 bg-white/80 backdrop-blur-md supports-[backdrop-filter]:bg-white/60">
          <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-pink-600 to-violet-600 bg-clip-text text-transparent">
                  🎉 AI Party Studio
                </h1>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Generate whimsical party decorations
                </p>
              </div>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[320px_1fr] xl:grid-cols-[360px_1fr]">
            <aside className="lg:sticky lg:top-24 lg:h-[calc(100vh-8rem)]">
              <div className="rounded-2xl border border-zinc-200/80 bg-white/90 p-6 shadow-lg backdrop-blur-sm">
                <div className="mb-6 flex items-center justify-between">
                  <div className="space-y-2">
                    <div className="h-4 w-24 animate-pulse rounded bg-zinc-200" />
                    <div className="h-3 w-16 animate-pulse rounded bg-zinc-100" />
                  </div>
                  <div className="h-9 w-9 animate-pulse rounded-full bg-zinc-200" />
                </div>
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 animate-pulse rounded-xl bg-zinc-100" />
                  ))}
                </div>
              </div>
            </aside>
            <div className="space-y-8">
              <section className="rounded-2xl border border-zinc-200/80 bg-white/90 p-8 shadow-lg backdrop-blur-sm sm:p-10">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <div className="h-6 w-48 animate-pulse rounded bg-zinc-200" />
                    <div className="h-4 w-full animate-pulse rounded bg-zinc-100" />
                  </div>
                  <div className="h-12 w-full animate-pulse rounded-xl bg-zinc-100" />
                  <div className="h-32 w-full animate-pulse rounded-xl bg-zinc-100" />
                </div>
              </section>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-violet-50">
      {/* Skip to main content link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-pink-500 focus:px-4 focus:py-2 focus:text-white focus:outline-none focus:ring-2 focus:ring-pink-500"
      >
        Skip to main content
      </a>

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-pink-100/50 bg-white/80 backdrop-blur-md supports-[backdrop-filter]:bg-white/60">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-pink-600 to-violet-600 bg-clip-text text-transparent">
                🎉 AI Party Studio
              </h1>
              <p className="mt-0.5 text-xs text-zinc-500">
                Generate whimsical party decorations
              </p>
            </div>
            {activeProject && (
              <div className="hidden items-center gap-2 rounded-full bg-pink-50 px-4 py-2 text-sm font-medium text-pink-700 sm:flex">
                <span className="h-2 w-2 animate-pulse rounded-full bg-pink-500" />
                {activeProject.name}
              </div>
            )}
          </div>
        </div>
      </header>

      <main id="main-content" className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[320px_1fr] xl:grid-cols-[360px_1fr]">
          {/* Sidebar - Projects */}
          <aside className="lg:sticky lg:top-24 lg:h-[calc(100vh-8rem)]">
            <div className="rounded-2xl border border-zinc-200/80 bg-white/90 p-6 shadow-lg backdrop-blur-sm">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
                    Projects
                  </h2>
                  <p className="mt-1 text-xs text-zinc-400">
                    {filteredAndSortedProjects.length} {filteredAndSortedProjects.length === 1 ? 'project' : 'projects'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCreateProject}
                  className="group relative flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-pink-500 to-violet-500 text-white shadow-md transition-all hover:scale-110 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2"
                  aria-label="Create new project"
                  title="Create new project"
                >
                  <span className="text-lg font-semibold transition-transform group-hover:rotate-90">+</span>
                </button>
              </div>

              {/* Search */}
              {projects.length > 0 && (
                <div className="mb-4">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search projects..."
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 transition-all focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-500/20"
                  />
                </div>
              )}

              {/* Sort */}
              {projects.length > 1 && (
                <div className="mb-4">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as 'date' | 'name' | 'iterations')}
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-500/20"
                  >
                    <option value="date">Sort by date</option>
                    <option value="name">Sort by name</option>
                    <option value="iterations">Sort by iterations</option>
                  </select>
                </div>
              )}

              <div className="space-y-2 max-h-[calc(100vh-20rem)] overflow-y-auto">
                {filteredAndSortedProjects.length === 0 ? (
                  <div className="rounded-xl border-2 border-dashed border-zinc-200 p-6 text-center">
                    {searchQuery ? (
                      <>
                        <p className="text-sm font-medium text-zinc-600">No projects found</p>
                        <p className="mt-1 text-xs text-zinc-400">
                          Try a different search term
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-r from-pink-100 to-violet-100">
                          <span className="text-xl">📁</span>
                        </div>
                        <p className="text-sm font-medium text-zinc-600">No projects yet</p>
                        <p className="mt-1 text-xs text-zinc-400">
                          Create your first project to get started
                        </p>
                        <button
                          type="button"
                          onClick={handleCreateProject}
                          className="mt-3 rounded-lg bg-gradient-to-r from-pink-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:shadow-md"
                        >
                          Create Project
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  filteredAndSortedProjects.map((project, index) => {
                    const isActive = project.id === activeProjectId;
                    const isEditing = editingProjectId === project.id;
                    return (
                      <div
                        key={project.id}
                        className={`group relative w-full rounded-xl border transition-all duration-200 ${isActive
                          ? "border-pink-300 bg-gradient-to-r from-pink-50 to-violet-50 shadow-md"
                          : "border-zinc-200 bg-white hover:border-pink-200 hover:bg-pink-50/50 hover:shadow-sm"
                          }`}
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        <div className="relative z-10 flex items-start gap-2 p-3">
                          <button
                            onClick={() => handleProjectSelection(project.id)}
                            className="flex-1 min-w-0 text-left"
                          >
                            {isEditing ? (
                              <input
                                type="text"
                                value={editingProjectName}
                                onChange={(e) => setEditingProjectName(e.target.value)}
                                onBlur={() => {
                                  if (editingProjectName.trim() && editingProjectName !== project.name) {
                                    handleRenameProject(project.id, editingProjectName);
                                  } else {
                                    setEditingProjectId(null);
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    if (editingProjectName.trim() && editingProjectName !== project.name) {
                                      handleRenameProject(project.id, editingProjectName);
                                    } else {
                                      setEditingProjectId(null);
                                    }
                                  } else if (e.key === 'Escape') {
                                    setEditingProjectId(null);
                                    setEditingProjectName("");
                                  }
                                }}
                                className="w-full rounded px-2 py-1 text-sm font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-pink-500"
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              <>
                                <p className={`truncate text-sm font-semibold ${isActive ? "text-pink-900" : "text-zinc-900"
                                  }`}>
                                  {project.name}
                                </p>
                                <p className="mt-1 text-xs text-zinc-500">
                                  {formatTimestamp(project.createdAt)}
                                </p>
                              </>
                            )}
                          </button>
                          <div className="flex items-center gap-1">
                            <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${isActive
                              ? "bg-pink-200 text-pink-800"
                              : "bg-zinc-100 text-zinc-600"
                              }`}>
                              {project.iterations.length}
                            </span>
                            <div className={`flex items-center gap-1 transition-opacity duration-200 ${isActive
                              ? 'opacity-100'
                              : 'opacity-0 group-hover:opacity-100'
                              }`}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingProjectId(project.id);
                                  setEditingProjectName(project.name);
                                }}
                                className="rounded p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-1"
                                title="Rename project"
                                aria-label="Rename project"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeletingProjectId(project.id);
                                }}
                                className="rounded p-1.5 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
                                title="Delete project"
                                aria-label="Delete project"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <div className="space-y-8">
            {/* Hero Section */}
            <section className="rounded-2xl border border-zinc-200/80 bg-white/90 p-8 shadow-lg backdrop-blur-sm sm:p-10">
              <div className="mb-8">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-pink-100 to-violet-100 px-4 py-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-pink-700">
                    Kids Party Atelier
                  </span>
                </div>
                <h2 className="mb-3 text-3xl font-bold text-zinc-900 sm:text-4xl">
                  Feed a theme, get a full decoration collection
                </h2>
                <p className="text-base leading-relaxed text-zinc-600 sm:text-lg">
                  Describe your party idea, drop in inspiration photos, and the AI
                  studio will return multiple printable pieces in one go.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Quick Templates */}
                {theme.length === 0 && (
                  <div className="rounded-xl border border-zinc-200 bg-gradient-to-br from-pink-50/50 to-violet-50/50 p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                      Quick Start Templates
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {QUICK_TEMPLATES.map((template, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setTheme(template.theme);
                            setDetails(template.details);
                          }}
                          className="rounded-lg border border-zinc-200 bg-white p-3 text-left text-sm transition-all hover:border-pink-300 hover:bg-pink-50/50"
                        >
                          <p className="font-semibold text-zinc-900">{template.theme}</p>
                          <p className="mt-1 text-xs text-zinc-500">{template.details}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Theme Input */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="theme" className="block text-sm font-semibold text-zinc-700">
                      Party theme <span className="text-red-500">*</span>
                    </label>
                    {theme.length > 0 && (
                      <span className="text-xs text-zinc-400">{theme.length} characters</span>
                    )}
                  </div>
                  <input
                    id="theme"
                    value={theme}
                    onChange={(event) => setTheme(event.target.value)}
                    placeholder="e.g. Cosmic roller disco for a 7th birthday"
                    className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3.5 text-base text-zinc-900 placeholder:text-zinc-400 transition-all duration-200 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-500/20"
                    required
                    maxLength={200}
                  />
                </div>

                {/* Details Input */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="details" className="block text-sm font-semibold text-zinc-700">
                      Extra art direction
                    </label>
                    {details.length > 0 && (
                      <span className="text-xs text-zinc-400">{details.length} characters</span>
                    )}
                  </div>
                  <textarea
                    id="details"
                    value={details}
                    onChange={(event) => setDetails(event.target.value)}
                    placeholder="Palette, motifs, kid names, wording, cultural cues..."
                    rows={4}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3.5 text-base text-zinc-900 placeholder:text-zinc-400 transition-all duration-200 resize-none focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-500/20"
                    maxLength={500}
                  />
                  {hasUnsavedChanges && (
                    <p className="text-xs text-zinc-400 flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-pink-500 animate-pulse" />
                      Draft saved automatically
                    </p>
                  )}
                </div>

                {/* Decorations */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-semibold text-zinc-700">
                      Decorations to emphasize
                    </label>
                    <span className="text-xs text-zinc-500">
                      {selectedDecorations.length} selected
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {DECORATION_OPTIONS.map((option) => {
                      const isSelected = selectedDecorations.includes(option);
                      return (
                        <button
                          type="button"
                          key={option}
                          onClick={() => toggleDecoration(option)}
                          className={`group relative rounded-full border px-4 py-2 text-sm font-medium transition-all duration-200 ${isSelected
                            ? "border-pink-400 bg-gradient-to-r from-pink-50 to-violet-50 text-pink-700 shadow-sm"
                            : "border-zinc-200 bg-white text-zinc-600 hover:border-pink-300 hover:bg-pink-50/50"
                            }`}
                        >
                          {option}
                          {isSelected && (
                            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-pink-500 text-xs text-white">
                              ✓
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Settings Grid */}
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Image Count - Info Only */}
                  <div className="rounded-xl border border-zinc-200 bg-gradient-to-br from-white to-zinc-50/50 p-5">
                    <div className="mb-2 flex items-center justify-between">
                      <label className="text-sm font-semibold text-zinc-700">
                        Images to generate
                      </label>
                      <span className="rounded-full bg-pink-100 px-3 py-1 text-sm font-bold text-pink-700">
                        {selectedDecorations.length}
                      </span>
                    </div>
                    <p className="mt-3 text-xs text-zinc-600">
                      One custom image will be generated for each selected decoration type with type-specific styling and layouts
                    </p>
                    <p className="mt-2 text-xs text-zinc-500">
                      Select up to 6 decoration types above
                    </p>
                  </div>

                  {/* Size Options */}
                  <div className="rounded-xl border border-zinc-200 bg-gradient-to-br from-white to-zinc-50/50 p-5">
                    <label className="mb-4 block text-sm font-semibold text-zinc-700">
                      Canvas format
                    </label>
                    <div className="space-y-2">
                      {SIZE_OPTIONS.map((option) => {
                        const isActive = option.id === currentSizeOption.id;
                        return (
                          <button
                            type="button"
                            key={option.id}
                            onClick={() => setSizeChoice(option.id)}
                            className={`group w-full rounded-lg border px-4 py-3 text-left transition-all duration-200 ${isActive
                              ? "border-violet-400 bg-gradient-to-r from-violet-50 to-pink-50 shadow-sm"
                              : "border-zinc-200 bg-white hover:border-violet-300 hover:bg-violet-50/50"
                              }`}
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-xl">{option.icon}</span>
                              <div className="flex-1">
                                <p className={`text-sm font-semibold ${isActive ? "text-violet-700" : "text-zinc-900"
                                  }`}>
                                  {option.label}
                                </p>
                                <p className="mt-0.5 text-xs text-zinc-500">
                                  {option.description}
                                </p>
                              </div>
                              {isActive && (
                                <span className="text-violet-600">✓</span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Reference Images */}
                <div className="space-y-3">
                  <label className="block text-sm font-semibold text-zinc-700">
                    Reference images <span className="text-xs font-normal text-zinc-400">(optional)</span>
                  </label>
                  <label
                    htmlFor="reference-images"
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleReferenceDrop}
                    className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-all duration-200 ${isDragging
                      ? "border-pink-400 bg-pink-50/50 scale-[1.02]"
                      : "border-zinc-300 bg-white hover:border-pink-300 hover:bg-pink-50/30"
                      }`}
                  >
                    <input
                      id="reference-images"
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(event) => handleReferenceFiles(event.target.files)}
                    />
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-r from-pink-100 to-violet-100">
                      <svg className="h-6 w-6 text-pink-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <p className="text-sm font-semibold text-zinc-700">
                      Drop files or click to upload
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Up to {MAX_REFERENCE_IMAGES} images (5MB each)
                    </p>
                    <p className="mt-2 rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-500">
                      Helpful for matching palettes
                    </p>
                  </label>
                  {referenceImages.length > 0 && (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {referenceImages.map((src, index) => (
                        <div
                          key={`${src}-${index}`}
                          className="group relative overflow-hidden rounded-xl border border-zinc-200 bg-white"
                        >
                          <Image
                            src={src}
                            alt={`Reference ${index + 1}`}
                            width={320}
                            height={240}
                            className="h-32 w-full object-cover transition-transform duration-200 group-hover:scale-105"
                          />
                          <button
                            type="button"
                            onClick={() => removeReferenceImage(index)}
                            className="absolute right-2 top-2 rounded-full bg-white/95 px-2.5 py-1.5 text-xs font-medium text-zinc-700 shadow-md transition-all hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-500"
                            aria-label={`Remove reference image ${index + 1}`}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Submit Button & Error */}
                <div className="flex flex-col gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={isGenerating || !activeProject}
                    className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-xl bg-gradient-to-r from-pink-500 to-violet-500 px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-pink-200/50 transition-all duration-200 hover:from-pink-600 hover:to-violet-600 hover:shadow-xl hover:shadow-pink-300/50 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-lg"
                  >
                    {isGenerating ? (
                      <>
                        <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-b-transparent" />
                        <span>Generating magic…</span>
                      </>
                    ) : (
                      <>
                        <span>✨</span>
                        <span>Generate party set</span>
                      </>
                    )}
                  </button>
                  {error && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 animate-fade-in">
                      <div className="flex items-start gap-2">
                        <span className="text-red-500">⚠️</span>
                        <span>{error}</span>
                      </div>
                    </div>
                  )}
                </div>
              </form>
            </section>

            {/* History Section */}
            <section className="rounded-2xl border border-zinc-200/80 bg-white/90 p-8 shadow-lg backdrop-blur-sm sm:p-10">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-zinc-900">Project history</h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Every generation, archived and ready to reuse
                  </p>
                </div>
                {activeProject && (
                  <span className="hidden rounded-full bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-700 sm:inline-block">
                    {activeProject.iterations.length} {activeProject.iterations.length === 1 ? 'run' : 'runs'}
                  </span>
                )}
              </div>

              {!activeProject || activeProject.iterations.filter((it) => it !== null).length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-zinc-200 bg-zinc-50/50 p-12 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r from-pink-100 to-violet-100">
                    <span className="text-2xl">🎨</span>
                  </div>
                  <p className="text-base font-medium text-zinc-600">
                    No generations yet
                  </p>
                  <p className="mt-1 text-sm text-zinc-500">
                    Submit a theme above to start creating your party decorations
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {activeProject.iterations
                    .filter((iteration) => iteration !== null)
                    .map((iteration, index) => (
                      <article
                        key={iteration.id}
                        id={`iteration-${iteration.id}`}
                        className="group rounded-xl border border-zinc-200 bg-white p-6 shadow-sm transition-all duration-200 hover:shadow-md sm:p-8"
                        style={{ animationDelay: `${index * 100}ms` }}
                      >
                        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex-1">
                            <div className="mb-2 flex items-center gap-2">
                              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                                {iteration.createdAt ? formatTimestamp(iteration.createdAt) : 'Date unknown'}
                              </span>
                            </div>
                            <h3 className="mb-2 text-xl font-bold text-zinc-900">
                              {iteration.theme}
                            </h3>
                            {iteration.details && (
                              <p className="text-sm leading-relaxed text-zinc-600">
                                {iteration.details}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => reuseIteration(iteration)}
                              className="group/btn rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-all duration-200 hover:border-pink-300 hover:bg-pink-50 hover:text-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-500"
                              title="Reuse settings"
                            >
                              <span className="flex items-center gap-2">
                                <span>↻</span>
                                <span>Reuse</span>
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDuplicateIteration(iteration)}
                              className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-all duration-200 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500"
                              title="Duplicate iteration"
                            >
                              <span className="flex items-center gap-2">
                                <span>📋</span>
                                <span>Duplicate</span>
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => downloadAllImages(iteration)}
                              disabled={downloadingImages.size > 0}
                              className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-all duration-200 hover:border-green-300 hover:bg-green-50 hover:text-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
                              title="Download all images as ZIP"
                            >
                              <span className="flex items-center gap-2">
                                {downloadingImages.size > 0 ? (
                                  <>
                                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-b-transparent" />
                                    <span>Downloading...</span>
                                  </>
                                ) : (
                                  <>
                                    <span>⬇️</span>
                                    <span>Download All</span>
                                  </>
                                )}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm(`Delete this iteration? This cannot be undone.`)) {
                                  handleDeleteIteration(activeProject!.id, iteration.id);
                                }
                              }}
                              className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-all duration-200 hover:border-red-300 hover:bg-red-50 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                              title="Delete iteration"
                            >
                              <span className="flex items-center gap-2">
                                <span>🗑️</span>
                                <span>Delete</span>
                              </span>
                            </button>
                          </div>
                        </div>

                        {/* Decoration Tags */}
                        <div className="mb-4 flex flex-wrap gap-2">
                          {iteration.decorationTypes.map((decoration) => (
                            <span
                              key={decoration}
                              className="rounded-full bg-gradient-to-r from-pink-50 to-violet-50 px-3 py-1 text-xs font-semibold text-pink-700"
                            >
                              {decoration}
                            </span>
                          ))}
                        </div>

                        {/* Reference Images */}
                        {iteration.referenceImages.length > 0 && (
                          <div className="mb-4">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                              Reference inspiration
                            </p>
                            <div className="flex gap-2">
                              {iteration.referenceImages.map((src, index) => (
                                <div
                                  key={`${iteration.id}-ref-${index}`}
                                  className="overflow-hidden rounded-lg border border-zinc-200"
                                >
                                  <Image
                                    src={src}
                                    alt="Reference"
                                    width={80}
                                    height={80}
                                    className="h-16 w-16 object-cover"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Generated Images */}
                        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {iteration.decorationTypes.map((decorationType, index) => {
                            const src = iteration.images[index];
                            const imageDecorationType = iteration.imageDecorationTypes?.[index];
                            const isStreaming = iteration.id.startsWith('temp-') && !src;

                            return (
                              <div
                                key={`${iteration.id}-image-${index}`}
                                className="group/image relative overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 transition-all duration-200 hover:border-pink-300 hover:shadow-md"
                              >
                                {imageDecorationType && (
                                  <div className="absolute left-2 top-2 z-10">
                                    <span className="inline-block rounded-lg bg-gradient-to-r from-pink-500 to-violet-500 px-3 py-1 text-xs font-bold text-white shadow-md">
                                      {imageDecorationType}
                                    </span>
                                  </div>
                                )}
                                {isStreaming && (
                                  <div className="absolute left-2 top-2 z-10">
                                    <span className="inline-block rounded-lg bg-zinc-500 px-3 py-1 text-xs font-bold text-white shadow-md animate-pulse">
                                      {decorationType}...
                                    </span>
                                  </div>
                                )}
                                {src ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => openLightbox(src, index, iteration.images)}
                                      className="relative block w-full focus:outline-none focus:ring-2 focus:ring-pink-500"
                                      aria-label={`View ${imageDecorationType || 'decoration'} in full size`}
                                    >
                                      <Image
                                        src={src}
                                        alt={imageDecorationType ? `${imageDecorationType} decoration` : `Generated decoration ${index + 1}`}
                                        width={600}
                                        height={600}
                                        className="h-48 w-full object-cover transition-transform duration-300 group-hover/image:scale-105"
                                        loading="lazy"
                                      />
                                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-all duration-200 group-hover/image:bg-black/10">
                                        <div className="opacity-0 transition-opacity duration-200 group-hover/image:opacity-100">
                                          <svg className="h-8 w-8 text-white drop-shadow-lg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                                          </svg>
                                        </div>
                                      </div>
                                    </button>
                                    <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover/image:opacity-100">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const decorationType = iteration.imageDecorationTypes?.[index];
                                          const typePrefix = decorationType ? `${decorationType.replace(/[^a-z0-9]/gi, '_')}_` : '';
                                          downloadImage(src, `${iteration.theme.replace(/[^a-z0-9]/gi, '_')}_${typePrefix}${index + 1}.png`);
                                        }}
                                        disabled={downloadingImages.has(src)}
                                        className="rounded-full bg-white/95 p-2 shadow-md transition-all hover:bg-green-50 hover:text-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
                                        title="Download image"
                                        aria-label="Download image"
                                      >
                                        {downloadingImages.has(src) ? (
                                          <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                          </svg>
                                        ) : (
                                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                          </svg>
                                        )}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          copyImageToClipboard(src);
                                        }}
                                        className="rounded-full bg-white/95 p-2 shadow-md transition-all hover:bg-violet-50 hover:text-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
                                        title="Copy image"
                                        aria-label="Copy image"
                                      >
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                        </svg>
                                      </button>
                                    </div>
                                  </>
                                ) : (
                                  <div className="relative flex h-48 w-full items-center justify-center bg-zinc-100">
                                    <div className="flex flex-col items-center gap-2">
                                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-pink-500 border-b-transparent" />
                                      <span className="text-sm text-zinc-500">Generating {decorationType}...</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Prompt Details */}
                        <details className="group/details">
                          <summary className="cursor-pointer list-none rounded-lg bg-zinc-50 px-4 py-3 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-100">
                            <span className="flex items-center gap-2">
                              <span className="transition-transform group-open/details:rotate-90">▶</span>
                              <span>View prompt details</span>
                            </span>
                          </summary>
                          <div className="mt-3 rounded-lg bg-zinc-50 p-4">
                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-600">
                              {iteration.prompt}
                            </p>
                          </div>
                        </details>
                      </article>
                    ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>

      {/* Toast Container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2" role="region" aria-live="polite" aria-label="Notifications">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex min-w-[300px] items-start gap-3 rounded-lg border px-4 py-3 shadow-lg backdrop-blur-sm animate-fade-in ${toast.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-800'
              : toast.type === 'error'
                ? 'border-red-200 bg-red-50 text-red-800'
                : 'border-blue-200 bg-blue-50 text-blue-800'
              }`}
          >
            <div className="flex-1">
              <p className="text-sm font-medium">{toast.message}</p>
            </div>
            <button
              onClick={() => dismissToast(toast.id)}
              className="rounded p-1 transition-colors hover:bg-black/10"
              aria-label="Dismiss notification"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Delete Project Confirmation Modal */}
      {deletingProjectId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
          onClick={() => setDeletingProjectId(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Delete project confirmation"
        >
          <div
            className="mx-4 w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 text-lg font-bold text-zinc-900">Delete Project?</h3>
            <p className="mb-6 text-sm text-zinc-600">
              Are you sure you want to delete "{projects.find(p => p.id === deletingProjectId)?.name}"?
              This will delete all iterations and cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeletingProjectId(null)}
                className="flex-1 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-all hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleDeleteProject(deletingProjectId);
                }}
                className="flex-1 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm animate-fade-in"
          onClick={closeLightbox}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          role="dialog"
          aria-modal="true"
          aria-label="Image lightbox"
        >
          {/* Close Button */}
          <button
            onClick={closeLightbox}
            className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-all hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/50"
            aria-label="Close lightbox"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Navigation Buttons */}
          {lightboxImage.index > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigateLightbox('prev');
              }}
              className="absolute left-4 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-all hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/50"
              aria-label="Previous image"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          {lightboxImage.index < lightboxImage.images.length - 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigateLightbox('next');
              }}
              className="absolute right-4 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-all hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/50"
              aria-label="Next image"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}

          {/* Image Container */}
          <div
            className="relative mx-4 max-h-[90vh] max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={lightboxImage.src}
              alt={`Generated decoration ${lightboxImage.index + 1}`}
              width={1200}
              height={1200}
              className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
              priority
            />
          </div>

          {/* Image Counter */}
          <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/50 px-4 py-2 text-sm text-white backdrop-blur-sm">
            {lightboxImage.index + 1} / {lightboxImage.images.length}
          </div>

          {/* Download button in lightbox */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              downloadImage(
                lightboxImage.src,
                `decoration_${lightboxImage.index + 1}.png`
              );
            }}
            disabled={downloadingImages.has(lightboxImage.src)}
            className="absolute bottom-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-all hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/50 disabled:opacity-50"
            aria-label="Download image"
            title="Download image"
          >
            {downloadingImages.has(lightboxImage.src) ? (
              <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
