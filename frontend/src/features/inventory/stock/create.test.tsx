import { render, screen } from "@testing-library/react";
import { PhysicalProductCreate } from "./create";
import { describe, it, expect, vi } from "vitest";
import { BrowserRouter } from "react-router-dom";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

vi.mock("@refinedev/core", () => ({
    useForm: () => ({
        onFinish: vi.fn(),
        mutationResult: { isLoading: false, isError: false, error: null },
    }),
    useList: ({ resource }: { resource: string }) => {
        if (resource === "product-models") {
            return {
                data: {
                    data: [
                        { id: "pm-1", sku: "SER-001", name: "Serialized Widget" },
                    ],
                },
            };
        }
        if (resource === "locations") {
            return {
                data: {
                    data: [{ id: "loc-1", name: "Main Warehouse" }],
                },
            };
        }
        return { data: { data: [] } };
    },
}));

vi.mock("../../../components/ui/Select", () => ({
    Select: (props: {
        name?: string;
        options?: { value: string; label: string }[];
    }) => (
        <select data-testid={`select-${props.name}`} name={props.name}>
            {(props.options || []).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
            ))}
        </select>
    ),
}));

vi.mock("../../../components/ui/ErrorState", () => ({
    FormErrorBanner: () => null,
}));

const renderPage = () =>
    render(
        <BrowserRouter>
            <PhysicalProductCreate />
        </BrowserRouter>
    );

describe("PhysicalProductCreate", () => {
    it("renders info banner explaining page is for serialized items", () => {
        renderPage();
        expect(
            screen.getByText(/registers individually tracked items \(serial numbers\)/i)
        ).toBeInTheDocument();
    });

    it("renders info banner with movements explanation", () => {
        renderPage();
        expect(
            screen.getByText(/bulk or batch products, use Movements to record stock changes/i)
        ).toBeInTheDocument();
    });

    it("renders 'Record a movement instead' link pointing to /movements/create", () => {
        renderPage();
        const link = screen.getByText(/Record a movement instead/);
        expect(link).toBeInTheDocument();
        expect(link.closest("a")).toHaveAttribute("href", "/movements/create");
    });

    it("renders info banner with role='note'", () => {
        renderPage();
        expect(screen.getByRole("note")).toBeInTheDocument();
    });

    it("shows expanded helper text on product model selector", () => {
        renderPage();
        expect(
            screen.getByText(/Only individually tracked products are shown\. Bulk and batch products manage stock through movements\./i)
        ).toBeInTheDocument();
    });

    it("renders page title", () => {
        renderPage();
        expect(screen.getByText("Register Physical Item")).toBeInTheDocument();
    });

    it("renders product model options filtered to serialized", () => {
        renderPage();
        const select = screen.getByTestId("select-product_model");
        expect(select).toBeInTheDocument();
        expect(screen.getByText("SER-001 - Serialized Widget")).toBeInTheDocument();
    });
});
