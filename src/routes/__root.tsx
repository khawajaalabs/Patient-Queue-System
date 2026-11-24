import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";

import { AuthProvider } from "@/providers/auth-provider";
import { ClinicProvider } from "@/providers/clinic-provider";
import { QueueProvider } from "@/providers/queue-provider";
import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Neuro Spine Care Center — Clinic queue & token management" },
      {
        name: "description",
        content: "Join the clinic queue remotely and arrive closer to your turn.",
      },
      {
        property: "og:title",
        content: "Neuro Spine Care Center — Clinic queue & token management",
      },
      {
        property: "og:description",
        content: "Join the clinic queue remotely and arrive closer to your turn.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

/** One listener for all invalidation events instead of every page refetching itself. */
function QueryInvalidator() {
  const queryClient = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      clearTimeout(timer);
      // Mutations commonly emit both events; coalesce them into one refetch.
      timer = setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ["api"] });
      }, 50);
    };
    window.addEventListener("queuecare:updated", schedule);
    window.addEventListener("queuecare:refresh", schedule);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("queuecare:updated", schedule);
      window.removeEventListener("queuecare:refresh", schedule);
    };
  }, [queryClient]);
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const publicOnly = pathname === "/public-display";
  // Auth screens need no queue or clinic data. Avoiding those requests makes
  // the login page load immediately instead of waiting on the API.
  const queueEnabled =
    publicOnly ||
    pathname === "/" ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/patient") ||
    pathname.startsWith("/staff");
  return (
    <QueryClientProvider client={queryClient}>
      <QueryInvalidator />
      <AuthProvider>
        <ClinicProvider publicOnly={publicOnly} enabled={queueEnabled}>
          <QueueProvider publicOnly={publicOnly} enabled={queueEnabled}>
            <a href="#main-content" className="skip-link">
              Skip to content
            </a>
            <Outlet />
            <Toaster position="top-center" />
          </QueueProvider>
        </ClinicProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
