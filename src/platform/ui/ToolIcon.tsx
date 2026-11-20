import { Boxes, icons, type LucideProps } from "lucide-react";

/** Renders a lucide icon by name (from a tool manifest). */
export function ToolIcon({ name, ...props }: { name: string } & LucideProps) {
  const Icon = icons[name as keyof typeof icons] ?? Boxes;
  return <Icon {...props} />;
}
