import { Buffer } from "node:buffer";
import { customProvider } from "ai";
import type { ImageModelV2 } from "@ai-sdk/provider";

const OPENROUTER_IMAGE_MODEL_ID =
  process.env.OPENROUTER_MODEL_ID ?? "google/gemini-2.5-flash-image";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

const getOpenRouterApiKey = () => {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error(
      "OPENROUTER_API_KEY is not configured. Add it to your environment variables.",
    );
  }
  return key;
};

type GatewayProviderOptions = {
  referenceImages?: string[];
  extraBody?: Record<string, unknown>;
};

const normalizeHeaders = (
  headers?: Record<string, string | undefined>,
): Record<string, string> => {
  if (!headers) {
    return {};
  }

  return Object.entries(headers).reduce<Record<string, string>>(
    (acc, [key, value]) => {
      if (typeof value === "string") {
        acc[key] = value;
      }
      return acc;
    },
    {},
  );
};

const ensureDataUrl = (value: string) =>
  value.startsWith("data:") ? value : `data:image/png;base64,${value.trim()}`;

const parseDataUrl = (
  value: string,
): { mediaType: string; base64: string } | null => {
  const match = value.match(/^data:(.+?);base64,(.+)$/);
  if (!match) {
    return null;
  }

  return {
    mediaType: match[1],
    base64: match[2],
  };
};

const fetchAsDataUrl = async (url: string, signal?: AbortSignal) => {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(
      `Unable to download generated image (${response.status}) from ${url}`,
    );
  }

  const mimeType = response.headers.get("content-type") ?? "image/png";
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
};

const collectImagesFromResponse = async (
  payload: unknown,
  limit: number,
  abortSignal?: AbortSignal,
): Promise<{ images: string[]; warnings: string[] }> => {
  const images: string[] = [];
  const warnings: string[] = [];

  const pushImage = (value?: string | null) => {
    if (!value) return;
    images.push(value);
    return images.length >= limit;
  };

  const processPart = async (part: unknown) => {
    if (!part || typeof part !== "object") {
      return false;
    }

    const type = (part as { type?: string }).type;
    if (type === "output_warning" || type === "warning") {
      const warningText =
        typeof (part as { text?: string }).text === "string"
          ? (part as { text?: string }).text
          : typeof (part as { message?: string }).message === "string"
            ? (part as { message?: string }).message
            : undefined;
      if (warningText) {
        warnings.push(warningText);
      }
      return false;
    }

    if (type === "image_url") {
      const url =
        (part as { image_url?: { url?: string } }).image_url?.url ??
        (part as { imageUrl?: string }).imageUrl;

      if (!url) {
        return false;
      }

      if (url.startsWith("data:")) {
        return pushImage(url);
      }

      try {
        const dataUrl = await fetchAsDataUrl(url, abortSignal);
        return pushImage(dataUrl);
      } catch (error) {
        warnings.push(
          error instanceof Error
            ? error.message
            : `Failed to download generated image from ${url}`,
        );
      }
      return false;
    }

    if (type === "image" || type === "output_image") {
      const base64 =
        typeof (part as { b64_json?: string }).b64_json === "string"
          ? (part as { b64_json?: string }).b64_json
          : typeof (part as { base64?: string }).base64 === "string"
            ? (part as { base64?: string }).base64
            : typeof (part as { data?: string }).data === "string"
              ? (part as { data?: string }).data
              : undefined;

      if (base64) {
        return pushImage(`data:image/png;base64,${base64}`);
      }

      const url =
        typeof (part as { url?: string }).url === "string"
          ? (part as { url?: string }).url
          : undefined;
      if (url) {
        return pushImage(url);
      }
    }

    if (type === "image_base64") {
      const base64 =
        typeof (part as { image_base64?: string }).image_base64 === "string"
          ? (part as { image_base64?: string }).image_base64
          : undefined;
      if (base64) {
        return pushImage(`data:image/png;base64,${base64}`);
      }
    }

    // Handle inline_data format (used by Gemini)
    if ("inline_data" in part && part.inline_data && typeof part.inline_data === "object") {
      const inlineData = part.inline_data as { mime_type?: string; data?: string };
      if (typeof inlineData.data === "string") {
        const mimeType = inlineData.mime_type ?? "image/png";
        return pushImage(`data:${mimeType};base64,${inlineData.data}`);
      }
    }

    // Handle inlineData format variant
    if ("inlineData" in part && part.inlineData && typeof part.inlineData === "object") {
      const inlineData = part.inlineData as { mimeType?: string; data?: string };
      if (typeof inlineData.data === "string") {
        const mimeType = inlineData.mimeType ?? "image/png";
        return pushImage(`data:${mimeType};base64,${inlineData.data}`);
      }
    }

    return false;
  };

  const processContent = async (content: unknown) => {
    if (!content) {
      return false;
    }

    if (typeof content === "string") {
      if (content.startsWith("data:")) {
        return pushImage(content);
      }
      return false;
    }

    if (Array.isArray(content)) {
      for (const part of content) {
        if (await processPart(part)) {
          return true;
        }
      }
      return false;
    }

    return processPart(content);
  };

  if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { data?: unknown[] }).data)
  ) {
    for (const entry of (payload as { data: unknown[] }).data) {
      if (
        entry &&
        typeof entry === "object" &&
        (typeof (entry as { b64_json?: string }).b64_json === "string" ||
          typeof (entry as { url?: string }).url === "string")
      ) {
        const base64 = (entry as { b64_json?: string }).b64_json;
        if (base64 && pushImage(`data:image/png;base64,${base64}`)) {
          return { images, warnings };
        }

        const url = (entry as { url?: string }).url;
        if (url) {
          if (url.startsWith("data:")) {
            if (pushImage(url)) {
              return { images, warnings };
            }
          } else {
            try {
              const dataUrl = await fetchAsDataUrl(url, abortSignal);
              if (pushImage(dataUrl)) {
                return { images, warnings };
              }
            } catch (error) {
              warnings.push(
                error instanceof Error
                  ? error.message
                  : `Failed to download generated image from ${url}`,
              );
            }
          }
        }
      }
    }
  }

  if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { choices?: unknown[] }).choices)
  ) {
    for (const choice of (payload as { choices: unknown[] }).choices) {
      if (
        !choice ||
        typeof choice !== "object" ||
        (!("message" in choice) && !("content" in choice))
      ) {
        continue;
      }

      // Check for images array in message (used by OpenRouter/Gemini)
      const message = (choice as { message?: unknown }).message;
      if (message && typeof message === "object" && "images" in message) {
        const imagesArray = (message as { images?: unknown }).images;
        console.log("Found images array in message:", Array.isArray(imagesArray) ? `array of ${(imagesArray as unknown[]).length}` : typeof imagesArray);
        if (Array.isArray(imagesArray)) {
          for (let i = 0; i < imagesArray.length; i++) {
            const img = imagesArray[i];
            console.log(`Processing image ${i} from message.images:`, JSON.stringify(img).substring(0, 200));
            await processPart(img);
            console.log(`After processing image ${i}, collected ${images.length} images so far`);
            if (images.length >= limit) {
              console.log(`Reached limit of ${limit} images, returning`);
              return { images, warnings };
            }
          }
          console.log(`Finished processing ${imagesArray.length} images from message.images array, total collected: ${images.length}`);
        }
      }

      const messageContent =
        typeof (choice as { message?: { content?: unknown } }).message ===
          "object"
          ? (choice as { message?: { content?: unknown } }).message?.content
          : undefined;
      if (await processContent(messageContent)) {
        return { images, warnings };
      }

      if (await processContent((choice as { content?: unknown }).content)) {
        return { images, warnings };
      }
    }
  }

  return { images, warnings };
};

const openRouterImageModel: ImageModelV2 = {
  specificationVersion: "v2",
  provider: "openrouter",
  modelId: OPENROUTER_IMAGE_MODEL_ID,
  maxImagesPerCall: 6,
  async doGenerate({
    prompt,
    n,
    size,
    aspectRatio,
    seed,
    providerOptions,
    abortSignal,
    headers,
  }) {
    const url = OPENROUTER_API_URL;
    const apiKey = getOpenRouterApiKey();

    const gatewayOptions =
      (providerOptions?.gateway as GatewayProviderOptions | undefined) ?? {};

    const referenceImages =
      gatewayOptions.referenceImages?.filter(
        (value): value is string => typeof value === "string" && value.length > 0,
      ) ?? [];

    const userContent: Array<Record<string, unknown>> = [
      {
        type: "text",
        text: prompt,
      },
      ...referenceImages.map((image) => ({
        type: "image_url",
        image_url: {
          url: ensureDataUrl(image),
        },
      })),
    ];

    const systemMessage = [
      "You are a playful party stylist that designs printable kids party decorations.",
      "Provide only finished artwork output that can be turned into toppers, banners, or signage.",
    ].join(" ");

    // Build the user message based on whether we have reference images
    const userMessage = referenceImages.length > 0
      ? userContent // Use array format with text and images
      : prompt; // Use simple string format

    const body: Record<string, unknown> = {
      model: OPENROUTER_IMAGE_MODEL_ID,
      messages: [
        {
          role: "system",
          content: systemMessage,
        },
        {
          role: "user",
          content: userMessage,
        },
      ],
      ...gatewayOptions.extraBody,
    };

    // Note: Gemini image models may not support 'n' parameter for multiple images in a single request
    // Instead, we'll need to make multiple requests if n > 1
    const requestCount = n && n > 1 ? n : 1;
    if (requestCount > 1) {
      console.log(`Requesting ${requestCount} images from OpenRouter via ${requestCount} parallel API calls.`);
    }

    if (size) {
      body.size = size;
    }
    if (aspectRatio) {
      body.aspect_ratio = aspectRatio;
    }
    if (typeof seed === "number") {
      body.seed = seed;
    }

    console.log("OpenRouter request body:", JSON.stringify(body, null, 2));

    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...normalizeHeaders(headers),
    };

    const referer = process.env.OPENROUTER_SITE_URL;
    if (referer) {
      requestHeaders["HTTP-Referer"] = referer;
    }
    const title = process.env.OPENROUTER_APP_NAME;
    if (title) {
      requestHeaders["X-Title"] = title;
    }

    // Helper function to make a single API call
    const makeSingleRequest = async () => {
      const timestamp = new Date();
      const response = await fetch(url, {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify(body),
        signal: abortSignal,
      });

      const responseText = await response.text();
      let parsed: unknown;
      try {
        parsed = responseText ? JSON.parse(responseText) : {};
      } catch {
        throw new Error(
          `OpenRouter responded with non-JSON payload (status ${response.status}): ${responseText.slice(0, 200)}`,
        );
      }

      if (!response.ok) {
        const message =
          (parsed &&
            typeof parsed === "object" &&
            "error" in parsed &&
            parsed.error &&
            typeof parsed.error === "object" &&
            "message" in parsed.error &&
            typeof (parsed.error as { message?: string }).message === "string" &&
            (parsed.error as { message?: string }).message) ||
          (parsed &&
            typeof parsed === "object" &&
            "error" in parsed &&
            typeof (parsed as { error?: string }).error === "string" &&
            (parsed as { error?: string }).error) ||
          (parsed &&
            typeof parsed === "object" &&
            "message" in parsed &&
            typeof (parsed as { message?: string }).message === "string" &&
            (parsed as { message?: string }).message) ||
          `OpenRouter image generation failed (${response.status}).`;

        throw new Error(message as string);
      }

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      return { parsed, timestamp, responseHeaders };
    };

    // Make multiple parallel requests if n > 1
    const results = await Promise.all(
      Array.from({ length: requestCount }, () => makeSingleRequest())
    );

    // Collect all images from all responses
    const allDataUrls: string[] = [];
    const allWarnings: string[] = [];

    for (let i = 0; i < results.length; i++) {
      const { parsed } = results[i];

      // Debug: Log the response structure (only for first request to reduce noise)
      if (i === 0) {
        console.log("OpenRouter response structure:", JSON.stringify(parsed, null, 2));
      }

      const { images: dataUrls, warnings } = await collectImagesFromResponse(
        parsed,
        1, // Only collect 1 image per response
        abortSignal,
      );

      console.log(`Collected ${dataUrls.length} images from request ${i + 1}/${requestCount}`);

      if (dataUrls.length > 0) {
        allDataUrls.push(...dataUrls);
        console.log(`First few characters of image from request ${i + 1}:`, dataUrls[0]?.substring(0, 50));
      }

      if (warnings.length > 0) {
        allWarnings.push(...warnings);
      }
    }

    console.log(`Total collected ${allDataUrls.length} images from ${requestCount} requests`);

    if (!allDataUrls.length) {
      console.error("Failed to extract images. Full response from first request:", JSON.stringify(results[0]?.parsed, null, 2));
      throw new Error("OpenRouter returned an empty image response.");
    }

    const imageBuffers = allDataUrls.map((dataUrl) => {
      const parsedData = parseDataUrl(dataUrl);
      if (!parsedData) {
        throw new Error("Received invalid image data from OpenRouter.");
      }

      return new Uint8Array(Buffer.from(parsedData.base64, "base64"));
    });

    const modelId =
      ((results[0].parsed &&
        typeof results[0].parsed === "object" &&
        typeof (results[0].parsed as { model?: string }).model === "string" &&
        (results[0].parsed as { model?: string }).model) as string) ||
      OPENROUTER_IMAGE_MODEL_ID;

    return {
      images: imageBuffers,
      warnings: allWarnings as any,
      providerMetadata: {
        openRouter: {
          images: allDataUrls,
          raw: results.map(r => r.parsed) as any,
        },
      },
      response: {
        timestamp: results[0].timestamp,
        modelId,
        headers: results[0].responseHeaders,
      },
    };
  },
};

const openRouterProvider = customProvider({
  imageModels: {
    [OPENROUTER_IMAGE_MODEL_ID]: openRouterImageModel,
  },
});

export const gatewayImage = openRouterProvider.imageModel(OPENROUTER_IMAGE_MODEL_ID);

export type StreamImageOptions = {
  prompt: string;
  size?: string;
  aspectRatio?: string;
  referenceImages?: string[];
  abortSignal?: AbortSignal;
};

export type StreamImageChunk = {
  image: string;
  decorationType: string;
  index: number;
  prompt: string;
};

/**
 * Stream image generation from OpenRouter API
 * Returns a ReadableStream that yields image chunks as they arrive
 */
export async function streamImageGeneration(
  options: StreamImageOptions,
): Promise<ReadableStream<StreamImageChunk>> {
  const { prompt, size, aspectRatio, referenceImages = [], abortSignal } = options;
  const apiKey = getOpenRouterApiKey();

  const userContent: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: prompt,
    },
    ...referenceImages.map((image) => ({
      type: "image_url",
      image_url: {
        url: ensureDataUrl(image),
      },
    })),
  ];

  const systemMessage = [
    "You are a playful party stylist that designs printable kids party decorations.",
    "Provide only finished artwork output that can be turned into toppers, banners, or signage.",
  ].join(" ");

  const userMessage = referenceImages.length > 0
    ? userContent
    : prompt;

  const body: Record<string, unknown> = {
    model: OPENROUTER_IMAGE_MODEL_ID,
    messages: [
      {
        role: "system",
        content: systemMessage,
      },
      {
        role: "user",
        content: userMessage,
      },
    ],
    modalities: ["image", "text"],
    stream: true,
  };

  if (size) {
    body.size = size;
  }
  if (aspectRatio) {
    body.aspect_ratio = aspectRatio;
  }

  const requestHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    Authorization: `Bearer ${apiKey}`,
  };

  const referer = process.env.OPENROUTER_SITE_URL;
  if (referer) {
    requestHeaders["HTTP-Referer"] = referer;
  }
  const title = process.env.OPENROUTER_APP_NAME;
  if (title) {
    requestHeaders["X-Title"] = title;
  }

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: requestHeaders,
    body: JSON.stringify(body),
    signal: abortSignal,
  });

  // Handle errors before streaming starts
  if (!response.ok) {
    const responseText = await response.text();
    let errorMessage = `OpenRouter image generation failed (${response.status}).`;
    
    try {
      const parsed = JSON.parse(responseText);
      if (parsed && typeof parsed === "object") {
        if ("error" in parsed && parsed.error && typeof parsed.error === "object" && "message" in parsed.error) {
          errorMessage = parsed.error.message as string;
        } else if ("error" in parsed && typeof parsed.error === "string") {
          errorMessage = parsed.error;
        } else if ("message" in parsed && typeof parsed.message === "string") {
          errorMessage = parsed.message;
        }
      }
    } catch {
      // Use default error message
    }
    
    throw new Error(errorMessage);
  }

  // Create a readable stream that processes SSE chunks
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Response body is not readable");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  return new ReadableStream<StreamImageChunk>({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Keep incomplete line in buffer

          for (const line of lines) {
            if (!line.trim()) continue;

            // Handle SSE format: "data: {...}" or "data: [DONE]"
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") {
                controller.close();
                return;
              }

              try {
                const parsed = JSON.parse(data);

                // Debug: log all parsed chunks to understand the format
                if (parsed.choices || parsed.type || parsed.delta) {
                  console.log("[Gateway] Received chunk:", JSON.stringify(parsed).substring(0, 300));
                }

                // Handle errors during streaming
                if (parsed && typeof parsed === "object" && "error" in parsed) {
                  const errorMsg = 
                    (parsed.error && typeof parsed.error === "object" && "message" in parsed.error)
                      ? parsed.error.message
                      : typeof parsed.error === "string"
                        ? parsed.error
                        : "Unknown error during streaming";
                  controller.error(new Error(errorMsg));
                  return;
                }

                // Extract images from delta.images (OpenRouter streaming format)
                if (parsed.choices && Array.isArray(parsed.choices)) {
                  for (const choice of parsed.choices) {
                    if (choice && typeof choice === "object" && "delta" in choice) {
                      const delta = choice.delta as { 
                        images?: Array<{ 
                          type?: string; 
                          image_url?: { url?: string } 
                        }> 
                      };
                      
                      if (delta.images && Array.isArray(delta.images)) {
                        for (const image of delta.images) {
                          if (image.image_url?.url) {
                            const imageUrl = image.image_url.url;
                            // Ensure it's a data URL (OpenRouter sends base64 data URLs)
                            const dataUrl = imageUrl.startsWith("data:") 
                              ? imageUrl 
                              : `data:image/png;base64,${imageUrl}`;
                            
                            // Note: decorationType and index will be set by the API route
                            controller.enqueue({
                              image: dataUrl,
                              decorationType: "", // Set by API route
                              index: 0, // Set by API route
                              prompt: prompt,
                            });
                          }
                        }
                      }
                    }
                  }
                }
                
                // Also check for images in message.content format (alternative format)
                if (parsed.choices && Array.isArray(parsed.choices)) {
                  for (const choice of parsed.choices) {
                    if (choice && typeof choice === "object" && "message" in choice) {
                      const message = (choice as { message?: { content?: unknown } }).message;
                      if (message && typeof message === "object" && "content" in message) {
                        const content = message.content;
                        if (Array.isArray(content)) {
                          for (const part of content) {
                            if (part && typeof part === "object" && "type" in part) {
                              if (part.type === "image_url" && "image_url" in part) {
                                const imgUrl = (part as { image_url?: { url?: string } }).image_url?.url;
                                if (imgUrl) {
                                  const dataUrl = imgUrl.startsWith("data:") 
                                    ? imgUrl 
                                    : `data:image/png;base64,${imgUrl}`;
                                  controller.enqueue({
                                    image: dataUrl,
                                    decorationType: "",
                                    index: 0,
                                    prompt: prompt,
                                  });
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              } catch (parseError) {
                // Skip invalid JSON lines
                continue;
              }
            }
          }
        }

        // Process any remaining buffer
        if (buffer.trim()) {
          if (buffer.startsWith("data: ")) {
            const data = buffer.slice(6);
            if (data !== "[DONE]") {
              try {
                const parsed = JSON.parse(data);
                if (parsed.choices && Array.isArray(parsed.choices)) {
                  for (const choice of parsed.choices) {
                    if (choice && typeof choice === "object" && "delta" in choice) {
                      const delta = choice.delta as { images?: Array<{ type?: string; image_url?: { url?: string } }> };
                      if (delta.images && Array.isArray(delta.images)) {
                        for (const image of delta.images) {
                          if (image.image_url?.url) {
                            const imageUrl = image.image_url.url;
                            const dataUrl = imageUrl.startsWith("data:") 
                              ? imageUrl 
                              : `data:image/png;base64,${imageUrl}`;
                            controller.enqueue({
                              image: dataUrl,
                              decorationType: "",
                              index: 0,
                              prompt: prompt,
                            });
                          }
                        }
                      }
                    }
                  }
                }
              } catch {
                // Ignore parse errors
              }
            }
          }
        }

        controller.close();
      } catch (error) {
        controller.error(error instanceof Error ? error : new Error("Streaming error"));
      }
    },
  });
}
