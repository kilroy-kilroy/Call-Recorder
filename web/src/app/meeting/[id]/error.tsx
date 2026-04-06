"use client";

export default function MeetingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="max-w-md space-y-4 text-center">
        <h2 className="text-xl font-semibold">Something went wrong</h2>
        <p className="text-sm text-zinc-400">{error.message}</p>
        <button
          onClick={reset}
          className="rounded bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
