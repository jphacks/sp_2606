import type { ProfileAttributes } from "@/lib/profile-attributes";

export default function BackgroundBadge({
  attributes,
}: {
  attributes?: ProfileAttributes | null;
}) {
  const background = attributes?.background;
  if (background !== "humanities" && background !== "science") return null;
  return (
    <span className="background-badge">
      {background === "humanities" ? "文系" : "理系"}
    </span>
  );
}
