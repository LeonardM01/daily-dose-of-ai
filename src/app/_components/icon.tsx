/**
 * Renders an SVG from /public/icons/ as a masked element so it inherits
 * the parent's text color via `currentColor` (just like an inline SVG).
 */
export function Icon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const url = `/icons/${name}.svg`;

  return (
    <span
      role="img"
      aria-hidden="true"
      className={`inline-block shrink-0 ${className ?? ""}`}
      style={{
        backgroundColor: "currentColor",
        maskImage: `url(${url})`,
        WebkitMaskImage: `url(${url})`,
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
      }}
    />
  );
}
