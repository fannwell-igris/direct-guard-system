import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines conditional class names (via clsx) and then resolves any
 * conflicting Tailwind classes (via tailwind-merge) so the last one wins
 * cleanly instead of both ending up in the DOM. Standard shadcn/ui
 * convention -- most shadcn components import this exact helper.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
