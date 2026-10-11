export type DataSource = "mock" | "supabase" | "http";

// NEXT_PUBLIC_* values must be read statically so Next.js can inline them.
const requested = process.env.NEXT_PUBLIC_DATA_SOURCE;
const dataSource: DataSource =
  requested === "supabase" || requested === "http" || requested === "mock"
    ? requested
    : process.env.NEXT_PUBLIC_USE_MOCK_DATA === "false" ? "http" : "mock"; // legacy flag

/** Who does image quality checks and analysis: Google Gemini (via /api/ai/analyze) or the in-browser demo stub. */
const aiProvider: "gemini" | "mock" = process.env.NEXT_PUBLIC_AI_PROVIDER === "gemini" ? "gemini" : "mock";

export const config = {
  aiProvider,
  dataSource,
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "",
  /** True only when running on the built-in in-browser demo data. */
  useMockData: dataSource === "mock",
  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    photoBucket: process.env.NEXT_PUBLIC_SUPABASE_PHOTO_BUCKET ?? "observation-photos",
  },
  maxUploadBytes: Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? 10) * 1024 * 1024,
  acceptedImageTypes: ["image/jpeg", "image/png", "image/webp"],
  features: { voiceNotes: process.env.NEXT_PUBLIC_FEATURE_VOICE === "true" },
};

/** Demo-only failure toggles (Settings → Demo controls). */
export const simulate = { uploadError: false, aiFailure: false, environmentError: false, slow: false };
