import { screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { renderWithI18n } from "../../../test-utils/i18n-wrapper";
import { StatCard } from "../StatCard";

describe("StatCard", () => {
    it("renders title and value", () => {
        renderWithI18n(
            <MemoryRouter>
                <StatCard title="Total Products" value={42} />
            </MemoryRouter>,
        );
        expect(screen.getByText("Total Products")).toBeInTheDocument();
        expect(screen.getByText("42")).toBeInTheDocument();
    });

    it("renders formatted number value", () => {
        renderWithI18n(
            <MemoryRouter>
                <StatCard title="Items" value={1234} />
            </MemoryRouter>,
        );
        expect(screen.getByText("1,234")).toBeInTheDocument();
    });

    it("renders string value as-is", () => {
        renderWithI18n(
            <MemoryRouter>
                <StatCard title="Status" value="N/A" />
            </MemoryRouter>,
        );
        expect(screen.getByText("N/A")).toBeInTheDocument();
    });

    it("wraps in Link when href provided", () => {
        renderWithI18n(
            <MemoryRouter>
                <StatCard title="Products" value={10} href="/products" />
            </MemoryRouter>,
        );
        const link = screen.getByRole("link");
        expect(link).toHaveAttribute("href", "/products");
    });

    it("does not render link when no href", () => {
        renderWithI18n(
            <MemoryRouter>
                <StatCard title="Products" value={10} />
            </MemoryRouter>,
        );
        expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });

    it("applies hover styles when clickable", () => {
        const { container } = renderWithI18n(
            <MemoryRouter>
                <StatCard title="Products" value={10} href="/products" />
            </MemoryRouter>,
        );
        const card = container.querySelector("[class*='cursor-pointer']");
        expect(card).toBeInTheDocument();
    });

    it("does not apply hover styles when not clickable", () => {
        const { container } = renderWithI18n(
            <MemoryRouter>
                <StatCard title="Products" value={10} />
            </MemoryRouter>,
        );
        const card = container.querySelector("[class*='cursor-pointer']");
        expect(card).not.toBeInTheDocument();
    });

    it("shows skeleton when loading", () => {
        const { container } = renderWithI18n(
            <MemoryRouter>
                <StatCard title="Products" value={0} isLoading />
            </MemoryRouter>,
        );
        expect(container.querySelector("[class*='animate-pulse']")).toBeInTheDocument();
    });

    it("renders trend indicator", () => {
        renderWithI18n(
            <MemoryRouter>
                <StatCard title="Items" value={50} trend={{ value: 12, direction: "up" }} />
            </MemoryRouter>,
        );
        expect(screen.getByText("12%")).toBeInTheDocument();
    });
});
