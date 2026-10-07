import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Btn } from "@/components/qc";
import { beginGoogleLogin } from "@/services/auth";
import { friendlyError } from "@/services/errors";
export function GoogleButton() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="mt-5">
      <div className="mb-5 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
      <Btn
        type="button"
        variant="secondary"
        size="lg"
        className="w-full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            window.location.assign(await beginGoogleLogin());
          } catch (error) {
            setError(friendlyError(error));
            setBusy(false);
          }
        }}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5">
            <path
              fill="#4285F4"
              d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.25c1.9-1.75 2.97-4.33 2.97-7.36Z"
            />
            <path
              fill="#34A853"
              d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.25-2.51c-.9.6-2.05.96-3.37.96-2.6 0-4.81-1.76-5.6-4.13H3.05v2.6A10 10 0 0 0 12 22Z"
            />
            <path
              fill="#FBBC05"
              d="M6.4 13.91a6 6 0 0 1 0-3.82v-2.6H3.05a10 10 0 0 0 0 9.02l3.35-2.6Z"
            />
            <path
              fill="#EA4335"
              d="M12 5.96c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.95 5.49l3.35 2.6C7.19 7.72 9.4 5.96 12 5.96Z"
            />
          </svg>
        )}
        Continue with Google
      </Btn>
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
