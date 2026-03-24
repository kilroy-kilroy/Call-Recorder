import Link from "next/link";

export function Nav() {
  return (
    <nav className="border-b border-zinc-800 px-6 py-4">
      <div className="mx-auto flex max-w-4xl items-center justify-between">
        <Link href="/dashboard" className="text-lg font-semibold">
          Meeting Hub
        </Link>
        <Link
          href="/settings"
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          Settings
        </Link>
      </div>
    </nav>
  );
}
