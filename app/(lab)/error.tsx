"use client";
import { AlertOctagon } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LabError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card mx-auto max-w-lg p-10 text-center">
      <AlertOctagon className="mx-auto size-8 text-bad-ink" aria-hidden />
      <h2 className="mt-4 text-lg font-semibold">Something went wrong loading this page</h2>
      <p className="mt-2 text-sm text-ink-2">
        {error.digest ? `Reference: ${error.digest}. ` : ""}Check the storage and ML service configuration in Settings, then retry.
      </p>
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
