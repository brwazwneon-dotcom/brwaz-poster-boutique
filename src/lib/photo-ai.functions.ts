import { createServerFn } from "@tanstack/react-start";

/**
 * Public server function — enhances or restyles a customer photo using
 * the Lovable AI Gateway (Gemini Nano Banana image model). No user auth
 * required (checkout is anonymous) but rate-limited by file size.
 */

export type PhotoAiAction =
  | "enhance"
  | "colors"
  | "sharpen_face"
  | "remove_blur"
  | "prepare_print"
  | "suit";

const PROMPTS: Record<PhotoAiAction, string> = {
  enhance:
    "Enhance this photo for 4x6 print quality. Improve sharpness, denoise, and expand dynamic range. Keep the person's face, skin tone, hair, clothing and background exactly the same. Do not add or remove any content.",
  colors:
    "Improve the color balance, contrast and vibrancy of this photo for a natural, print-ready look. Keep skin tones natural. Do not change composition or content.",
  sharpen_face:
    "Sharpen the facial features (eyes, hair, skin detail) in this photo while keeping natural skin texture and expression. Do not alter identity or background.",
  remove_blur:
    "Reduce motion blur and focus blur in this photo to make it print-sharp. Keep the exact same subject, composition, and colors.",
  prepare_print:
    "Prepare this photo for high-quality 4x6 photo print: optimize contrast, sharpness, saturation, and remove digital noise. Preserve all original detail.",
  suit:
    "Transform the person in this photo so they are wearing a professional formal business suit (dark navy or charcoal black jacket with white shirt and tie). Keep the exact same face, hairstyle, skin tone, pose, and background. Do NOT change the identity of the person. Do NOT add or remove people. If the photo does not clearly show a person, respond with the exact text ONLY: NO_PERSON",
};

type Input = {
  imageBase64: string; // data URL: data:image/jpeg;base64,...
  action: PhotoAiAction;
};

export type PhotoAiResult = {
  ok: boolean;
  imageBase64?: string; // data URL of edited image
  error?: "no_person" | "ai_failed" | "invalid_input";
  message?: string;
};

const MAX_INPUT_BYTES = 8 * 1024 * 1024; // 8 MB

export const enhancePhoto = createServerFn({ method: "POST" })
  .inputValidator((data: unknown): Input => {
    const d = data as Input;
    if (!d || typeof d.imageBase64 !== "string" || !d.imageBase64.startsWith("data:image/")) {
      throw new Error("invalid image");
    }
    if (!["enhance", "colors", "sharpen_face", "remove_blur", "prepare_print", "suit"].includes(d.action)) {
      throw new Error("invalid action");
    }
    // Rough size check (base64 is ~1.37x binary size)
    const approxBytes = (d.imageBase64.length * 3) / 4;
    if (approxBytes > MAX_INPUT_BYTES) throw new Error("image too large (max 8MB)");
    return { imageBase64: d.imageBase64, action: d.action };
  })
  .handler(async ({ data }): Promise<PhotoAiResult> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { ok: false, error: "ai_failed", message: "AI unavailable" };

    const prompt = PROMPTS[data.action];
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          modalities: ["image", "text"],
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: data.imageBase64 } },
              ],
            },
          ],
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { ok: false, error: "ai_failed", message: `Gateway ${res.status}: ${body.slice(0, 120)}` };
      }
      const json = (await res.json()) as {
        choices?: Array<{
          message?: {
            content?: string | Array<{ type?: string; image_url?: { url?: string }; text?: string }>;
            images?: Array<{ image_url?: { url?: string } }>;
          };
        }>;
      };
      const msg = json.choices?.[0]?.message;

      // Look for image in `images` array (Nano Banana standard output)
      const imgFromArray = msg?.images?.[0]?.image_url?.url;
      if (imgFromArray && imgFromArray.startsWith("data:image/")) {
        return { ok: true, imageBase64: imgFromArray };
      }

      // Fallback: image inside content array
      if (Array.isArray(msg?.content)) {
        for (const c of msg.content) {
          const url = c?.image_url?.url;
          if (typeof url === "string" && url.startsWith("data:image/")) {
            return { ok: true, imageBase64: url };
          }
        }
      }

      // Person-detection sentinel for suit action
      const textOut =
        typeof msg?.content === "string"
          ? msg.content
          : Array.isArray(msg?.content)
          ? msg.content.map((c) => c?.text ?? "").join(" ")
          : "";
      if (data.action === "suit" && /NO_PERSON/i.test(textOut)) {
        return { ok: false, error: "no_person" };
      }

      return { ok: false, error: "ai_failed", message: "No image returned" };
    } catch (e) {
      return {
        ok: false,
        error: "ai_failed",
        message: e instanceof Error ? e.message : "AI failed",
      };
    }
  });