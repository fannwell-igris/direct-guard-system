import dgLogo from "../../assets/dg-logo.svg";

interface MagenLogoProps {
  className?: string;
}

/**
 * Direct Guard Limited logo — horizontal lockup (shield mark + wordmark).
 * Replace dg-logo.svg with the official branded asset when available.
 */
export default function MagenLogo({ className = "" }: MagenLogoProps) {
  return <img src={dgLogo} alt="Direct Guard Limited" className={className} />;
}
