"use client";

import { useEffect } from "react";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center py-24 text-center">
      <p className="text-sm font-medium text-zinc-950">Something went wrong.</p>
      <p className="mt-1 text-sm text-zinc-400">
        Could not load jobs. Check your connection or try again.
      </p>
      <button
        onClick={unstable_retry}
        className="mt-4 rounded-md border border-zinc-200 px-4 py-2 text-sm text-zinc-600 transition-colors hover:border-blue-200 hover:text-blue-600"
      >
        Try again
      </button>
    </div>
  );
}
