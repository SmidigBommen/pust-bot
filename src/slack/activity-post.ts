import type { KnownBlock } from "@slack/types";

interface UploadedImage {
  id: string;
  mimetype: string;
  filetype: string;
}

export function validateActivityImage(files: readonly UploadedImage[]): string | undefined {
  if (files.length > 1) return "Velg bare ett bilde.";
  const file = files[0];
  if (!file) return undefined;
  const supported =
    (file.mimetype === "image/jpeg" && ["jpg", "jpeg"].includes(file.filetype)) ||
    (file.mimetype === "image/png" && file.filetype === "png") ||
    (file.mimetype === "image/gif" && file.filetype === "gif");
  if (!supported || !/^F[A-Z0-9]+$/.test(file.id)) {
    return "Last opp et JPG-, PNG- eller GIF-bilde.";
  }
  return undefined;
}

interface ActivityPost {
  text: string;
  blocks: KnownBlock[];
}

function activityPost(text: string, imageFileId?: string): ActivityPost {
  return {
    text,
    blocks: imageFileId
      ? [
          { type: "section", text: { type: "mrkdwn", text } },
          { type: "image", slack_file: { id: imageFileId }, alt_text: "Bilde fra aktiviteten" },
        ]
      : [],
  };
}

function imageWasRejected(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("data" in error)) return false;
  const data = error.data;
  return typeof data === "object" && data !== null && "error" in data &&
    ["invalid_blocks", "file_not_found", "file_deleted", "file_is_deleted"].includes(String(data.error));
}

/** Retry only explicit image rejections, never ambiguous network failures. */
export async function sendActivityPost<T>(
  send: (post: ActivityPost) => Promise<T>,
  text: string,
  imageFileId?: string,
): Promise<{ response: T; imageFileId: string | undefined }> {
  try {
    return { response: await send(activityPost(text, imageFileId)), imageFileId };
  } catch (error) {
    if (!imageFileId || !imageWasRejected(error)) throw error;
    return { response: await send(activityPost(text)), imageFileId: undefined };
  }
}
