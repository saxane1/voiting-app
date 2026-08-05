"use client";

import { useState } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";

import { AuthProvider } from "@/context/auth-context";

/**
 * Every client-side provider the app needs, mounted once in the root layout.
 *
 * This is a client-fetching app: authed data is read in client components via
 * React Query + the axios instance, because the access token only exists in
 * browser memory. Server components have no way to reach it, so `page.js` files
 * stay thin parents.
 */

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // 401 and 403 are answers, not blips. Retrying a 401 fights the
        // refresh-and-retry the axios interceptor already performed.
        retry: (failureCount, error) => {
          const status = error?.response?.status;

          if (status === 401 || status === 403 || status === 404) return false;

          return failureCount < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}

export default function Providers({ children }) {
  // Lazy state, not a module-level client: one QueryClient per browser session,
  // never one shared across requests on the server.
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {children}

        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: "var(--color-surface)",
              color: "var(--color-ink)",
              border: "1px solid var(--color-line)",
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-lg)",
              fontSize: "0.875rem",
            },
          }}
        />
      </AuthProvider>
    </QueryClientProvider>
  );
}
