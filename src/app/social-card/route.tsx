import { socialImage } from "@/lib/social-image";

/** Branded 1200x630 social card (no statistics). Referenced from metadata only when a validated site origin is configured. */
export function GET() {
  return socialImage();
}
