/**
 * "Amina Hassan Yusuf" -> "AH". Used by every avatar fallback in the app
 * (voter candidate portraits, the admin student roll), so the same person is
 * always shown with the same two letters.
 */

export function initialsOf(name) {
  return String(name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
