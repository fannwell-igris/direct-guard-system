/**
 * Minimal classname joiner. Deliberately NOT using the installed "cn"
 * package here — its exact export shape wasn't verified, and importing
 * it wrong would be a build error costing a full round-trip to catch.
 * This does the same job for plain conditional classes; swap in a real
 * clsx/tailwind-merge combo later if class-conflict resolution is
 * actually needed (e.g. two components both setting `p-4`).
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
