import magenLogo from "../../assets/magen-logo.svg";

interface MagenLogoProps {
  className?: string;
}

/**
 * Real Magen Security logo (Management_system_UI.svg, provided
 * 2026-09-15) - replaces the earlier hand-drawn approximation entirely.
 *
 * This file is a single horizontal lockup (shield mark + "MAGEN"
 * wordmark combined in one SVG, ~2.83:1 aspect ratio) rather than
 * separate icon-only and full-lockup assets, so there's no true
 * "mark-only" crop to offer - every usage renders the same image.
 * If a separate icon-only version of the logo becomes available later,
 * add it as its own asset + prop rather than trying to crop this one
 * with CSS, since the shield and wordmark aren't laid out as cleanly
 * separable regions in the source paths.
 */
export default function MagenLogo({ className = "" }: MagenLogoProps) {
  return <img src={magenLogo} alt="Magen Security" className={className} />;
}
