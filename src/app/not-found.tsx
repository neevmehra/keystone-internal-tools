import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 text-center">
      <p className="text-sm font-medium">Page not found</p>
      <Link href="/" className="text-sm text-primary hover:underline">
        Back to Keystone
      </Link>
    </div>
  );
}
