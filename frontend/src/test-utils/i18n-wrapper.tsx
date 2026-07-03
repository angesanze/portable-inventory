import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMemo, type ReactElement, type ReactNode } from "react";
import i18n from "../i18n";

/**
 * Provides i18n context to components under test.
 *
 * The shared `i18n` instance is already auto-initialized for the test
 * environment via `src/setupTests.ts`, so wrapping with this provider makes the
 * i18n dependency explicit at the render site (and keeps renders working if the
 * global auto-init is ever removed). Defaults to English; switch languages in a
 * test with `i18n.changeLanguage("it")` and reset in a `finally`.
 */
export const I18nWrapper = ({ children }: { children: ReactNode }) => {
    // A QueryClient so components that reach for React Query (e.g. anything under
    // ActingTenantProvider, which invalidates the cache on tenant switch) render
    // in tests the same way they do under <Refine> in the app.
    const queryClient = useMemo(() => new QueryClient(), []);
    return (
        <QueryClientProvider client={queryClient}>
            <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
        </QueryClientProvider>
    );
};

/**
 * Drop-in replacement for Testing Library's `render` that wraps the UI in
 * {@link I18nWrapper}. Use for new test renders going forward.
 */
// eslint-disable-next-line react-refresh/only-export-components -- test-only render helper co-located with the I18nWrapper it uses; this module is never part of the Fast Refresh component graph.
export function renderWithI18n(
    ui: ReactElement,
    options?: Omit<RenderOptions, "wrapper">,
): RenderResult {
    return render(ui, { wrapper: I18nWrapper, ...options });
}

// eslint-disable-next-line react-refresh/only-export-components -- re-export of the shared test i18n instance from a test-utils module (not a Fast Refresh boundary).
export { i18n };
