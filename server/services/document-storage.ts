import { ApiError } from "../middleware/auth.ts";
export const medicalBucket = "queuecare-medical";
export interface DocumentStorage {
  uploadUrl(path: string): Promise<string>;
  read(path: string): Promise<Uint8Array>;
  signedUrl(path: string): Promise<string>;
  remove(path: string): Promise<void>;
}
export class SupabaseDocumentStorage implements DocumentStorage {
  private async request(path: string, method = "GET", body?: unknown) {
    const url = process.env["SUPABASE_URL"],
      key = process.env["SUPABASE_SECRET_KEY"];
    if (!url || !key)
      throw new ApiError(503, "STORAGE_UNAVAILABLE", "Document storage is not configured.");
    const r = await fetch(url + "/storage/v1/" + path, {
      method,
      signal: AbortSignal.timeout(30000),
      headers: {
        apikey: key,
        Authorization: "Bearer " + key,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!r.ok)
      throw new ApiError(
        502,
        "STORAGE_ERROR",
        "Unable to access private document storage. Please try again.",
      );
    return r;
  }
  async uploadUrl(path: string) {
    const r = await (
      await this.request("object/upload/sign/" + medicalBucket + "/" + path, "POST", {})
    ).json();
    return process.env["SUPABASE_URL"] + "/storage/v1" + r.url;
  }
  async read(path: string) {
    const r = await this.request("object/authenticated/" + medicalBucket + "/" + path);
    const size = Number(r.headers.get("content-length"));
    if (size > 10485760)
      throw new ApiError(400, "FILE_TOO_LARGE", "Files must be no larger than 10 MB.");
    return new Uint8Array(await r.arrayBuffer());
  }
  async signedUrl(path: string) {
    const r = await (
      await this.request("object/sign/" + medicalBucket + "/" + path, "POST", { expiresIn: 60 })
    ).json();
    return process.env["SUPABASE_URL"] + "/storage/v1" + r.signedURL;
  }
  async remove(path: string) {
    await this.request("object/" + medicalBucket, "DELETE", { prefixes: [path] });
  }
}
export function actualMime(data: Uint8Array) {
  const b = Buffer.from(data);
  if (b.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return "image/jpeg";
  throw new ApiError(400, "INVALID_FILE", "Upload a valid PDF, JPEG or PNG file.");
}
