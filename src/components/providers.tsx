"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "sileo";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {children}
      </TooltipProvider>
      <Toaster
        position="top-center"
        offset={20}
        options={{
          duration: 4800,
          fill: "#ffffff",
          roundness: 20,
          autopilot: { expand: 120, collapse: 3800 },
          styles: {
            title: "sileo-modern-title",
            description: "sileo-modern-description",
            badge: "sileo-modern-badge",
            button: "sileo-modern-button",
          },
        }}
      />
    </QueryClientProvider>
  );
}
