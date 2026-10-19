import type { ReactNode } from "react";

export function MainContent({ children }: { children: ReactNode }) {
  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-[100] focus-visible:rounded-md focus-visible:bg-white focus-visible:px-4 focus-visible:py-3 focus-visible:font-semibold focus-visible:text-gray-900 focus-visible:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      >
        Skip to main content
      </a>
      <main id="main-content" tabIndex={-1} className="w-full">
        {children}
      </main>
    </>
  );
}