import { screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import { ProductPolyList } from "./list";
import { ProductPolyCreate } from "./create";
import { ProductPolyEdit } from "./edit";
import { renderWithI18n as render, i18n } from "../../../test-utils/i18n-wrapper";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
        useParams: () => ({ id: "inst-1" }),
    };
});

const mockForm = {
    onFinish: vi.fn(),
    mutation: { isLoading: false },
    mutationResult: { isLoading: false },
    formLoading: false,
    queryResult: {
        data: { data: { id: "inst-1", name: "Warehouse A", product_model_name: "Bolts", engine_type: "bucket" } },
    },
};

vi.mock("@refinedev/core", () => ({
    useList: () => ({
        data: { data: [{ id: "inst-1", name: "Warehouse A", engine_type: "bucket", stock_value: [] }] },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
    }),
    useDelete: () => ({ mutate: vi.fn() }),
    useForm: () => mockForm,
    useSelect: () => ({ options: [] }),
}));

const withIt = async (fn: () => Promise<void> | void) => {
    try {
        await i18n.changeLanguage("it");
        await fn();
    } finally {
        await i18n.changeLanguage("en");
    }
};

describe("ProductPolyList", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    it("renders English page title, headers and actions", () => {
        render(<BrowserRouter><ProductPolyList /></BrowserRouter>);
        expect(screen.getByText("Product Instances")).toBeInTheDocument();
        expect(screen.getByText("Engine")).toBeInTheDocument();
        expect(screen.getByText("Batch / Kit")).toBeInTheDocument();
        expect(screen.getByText("Widget")).toBeInTheDocument();
    });

    it("renders Italian page title and headers when language switched", () =>
        withIt(() => {
            render(<BrowserRouter><ProductPolyList /></BrowserRouter>);
            expect(screen.getByText("Istanze Prodotto")).toBeInTheDocument();
            expect(screen.getByText("Motore")).toBeInTheDocument();
            expect(screen.getByText("Lotto / Kit")).toBeInTheDocument();
        }));
});

describe("ProductPolyCreate", () => {
    beforeEach(() => vi.clearAllMocks());

    it("renders English form strings", () => {
        render(<BrowserRouter><ProductPolyCreate /></BrowserRouter>);
        expect(screen.getByText("New Product Instance")).toBeInTheDocument();
        expect(screen.getByText("Instance Name")).toBeInTheDocument();
        expect(screen.getByText("Create Instance")).toBeInTheDocument();
    });

    it("renders Italian form strings when language switched", () =>
        withIt(() => {
            render(<BrowserRouter><ProductPolyCreate /></BrowserRouter>);
            expect(screen.getByText("Nuova Istanza Prodotto")).toBeInTheDocument();
            expect(screen.getByText("Nome Istanza")).toBeInTheDocument();
            expect(screen.getByText("Crea Istanza")).toBeInTheDocument();
        }));
});

describe("ProductPolyEdit", () => {
    beforeEach(() => vi.clearAllMocks());

    it("renders English edit strings", async () => {
        render(<BrowserRouter><ProductPolyEdit /></BrowserRouter>);
        await waitFor(() => {
            expect(screen.getByText("Edit Product Instance")).toBeInTheDocument();
        });
        expect(screen.getByText("Engine Type")).toBeInTheDocument();
        expect(screen.getByText("Save Changes")).toBeInTheDocument();
    });

    it("renders Italian edit strings when language switched", () =>
        withIt(async () => {
            render(<BrowserRouter><ProductPolyEdit /></BrowserRouter>);
            await waitFor(() => {
                expect(screen.getByText("Modifica Istanza Prodotto")).toBeInTheDocument();
            });
            expect(screen.getByText("Tipo di Motore")).toBeInTheDocument();
            expect(screen.getByText("Salva Modifiche")).toBeInTheDocument();
        }));
});
