import { useEffect, useMemo, useState } from "react";
import { Authenticated, Refine } from "@refinedev/core";
import { safeDataProvider } from "./providers/safe-data-provider";
import { BrowserRouter, Outlet, Route, Routes, Navigate, useSearchParams } from "react-router-dom";
import { useCapabilities, DEFAULT_CAPABILITIES, type Capabilities } from "./hooks/useCapabilities";
import { RequireCapability } from "./components/RequireCapability";
import { RequireSuperuser } from "./components/RequireSuperuser";

import "./App.css";
import { authProvider } from "./providers/authProvider";
import { axiosInstance } from "./providers/axios-client";
import { AxiosErrorHandler } from "./providers/AxiosErrorHandler";
import { notificationProvider, NotificationBridge } from "./providers/notificationProvider";
import { Layout } from "./components/layout";
import { Login } from "./features/auth/Login";
import { Dashboard } from "./features/core/dashboard";
import { ApiKeyList } from "./features/settings/api-keys";
import { UsersList } from "./features/settings/users/UsersList";
import { QRCodeList } from "./features/settings/qr-codes";
import { WidgetGenerator } from "./features/widget/generator/WidgetGenerator";
import { WidgetPreview } from "./features/widget/preview/WidgetPreview";
import { Widget } from "./features/widget/app/Widget";
import { PolymorphicWidget } from "./features/widget/app/PolymorphicWidget";
import { ConfigPlayground } from "./features/widget/calculator/ConfigPlayground";
import { CalculatorList, CalculatorCreate, CalculatorEdit } from "./features/settings/calculators";
import { NotificationChannelList } from "./features/settings/notifications";
import { ProductImport } from "./features/settings/import/ProductImport";
import { CompanyDataExport } from "./features/settings/export/CompanyDataExport";
import { AppearanceSettings } from "./features/settings/appearance";

import { LocationList, LocationCreate, LocationEdit, LocationShow } from "./features/inventory/locations";
import { SupplierList, SupplierCreate, SupplierEdit } from "./features/inventory/suppliers";
import { CustomerList, CustomerCreate, CustomerEdit } from "./features/inventory/customers";
import { ProductModelList, ProductModelCreate, ProductModelEdit, ProductModelShow } from "./features/products/models";
import { ProductPolyList, ProductPolyCreate, ProductPolyShow, ProductPolyEdit } from "./features/products/poly";
import { PhysicalProductList, PhysicalProductCreate, PhysicalProductEdit, PhysicalProductShow } from "./features/inventory/stock";
import { MovementList, MovementCreate, TransferCreate, MovementHub } from "./features/inventory/movements";
import { ReservationList } from "./features/inventory/reservations";
import { WorkOrderList, WorkOrderCreate, WorkOrderEdit, WorkOrderShow } from "./features/inventory/work-orders";
import { RestockBoard } from "./features/inventory/restock/RestockBoard";
import { PurchaseOrderList, PurchaseOrderCreate, PurchaseOrderEdit, PurchaseOrderReceive } from "./features/purchasing";
import { SalesOrderList, SalesOrderCreate, SalesOrderEdit, SalesOrderView } from "./features/sales";
import { TransferOrderList, TransferOrderCreate, TransferOrderEdit, TransferOrderReceive } from "./features/inventory/transfers";
import { ReturnOrderList, ReturnOrderCreate, ReturnOrderEdit, ReturnOrderResolve } from "./features/inventory/returns";
import { StocktakeList, StocktakeCreate, StocktakeView } from "./features/inventory/stocktake";
import { ValuationReport, CogsReport } from "./features/inventory/reports";

import { TenantList, TenantCreate } from "./features/tenants";
import { ConsoleLayout, Overview as ConsoleOverview, Companies as ConsoleCompanies, CompanyDetail as ConsoleCompanyDetail, Insights as ConsoleInsights, ApiUsage as ConsoleApiUsage, Audit as ConsoleAudit } from "./features/console";
import { RegisterPage, SetupWizard } from "./features/onboarding";
import { ToastProvider } from "./components/ui/Toast";
import { ThemeProvider } from "./theme/ThemeProvider";
import { ActingTenantProvider } from "./context/ActingTenantProvider";
import { buildResources } from "./resources";
import { API_URL } from "./config";

/** Show MovementHub unless ?direction= is present, then show create form */
const MovementCreateRoute = () => {
  const [searchParams] = useSearchParams();
  return searchParams.get("direction") ? <MovementCreate /> : <MovementHub />;
};

/**
 * Bridges identity-derived capabilities (only available inside Refine via
 * `useGetIdentity`) back up to the `resources` prop on the root `<Refine>`.
 * Resources start fail-closed and are widened once identity resolves.
 */
function CapabilitySync({
  onChange,
  onSuperuserChange,
}: {
  onChange: (caps: Capabilities) => void;
  onSuperuserChange: (isSuperuser: boolean) => void;
}) {
  const { capabilities, is_superuser, isLoading } = useCapabilities();
  // Serialize the full capability map so the effect refires whenever ANY flag
  // changes (including the GOVERNANCE-11 role-gated keys), without listing each.
  const capsKey = JSON.stringify(capabilities);
  useEffect(() => {
    if (isLoading) return;
    onChange(capabilities);
    onSuperuserChange(is_superuser);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, capsKey, is_superuser]);
  return null;
}

function App() {
  // Fail-closed: start without developer resources, widen once identity loads.
  const [capabilities, setCapabilities] = useState<Capabilities>(DEFAULT_CAPABILITIES);
  // Superuser is platform-wide, tracked separately from the capability map.
  const [isSuperuser, setIsSuperuser] = useState(false);
  // Stable resources reference: rebuilding the array every render makes Refine
  // re-initialize, which refetches identity and re-fires CapabilitySync — a
  // /users/me/ request storm. Memoize on the capability values.
  const resources = useMemo(() => buildResources(capabilities, isSuperuser), [capabilities, isSuperuser]);
  return (
    <BrowserRouter>
      <ThemeProvider>
      <Refine
        dataProvider={safeDataProvider((API_URL.endsWith("/") ? API_URL.slice(0, -1) : API_URL) + "/api/v1", axiosInstance)}
        authProvider={authProvider}
        notificationProvider={notificationProvider}
        resources={resources}
        options={{
          syncWithLocation: false,
          warnWhenUnsavedChanges: false,
          projectId: "portable-inventory",
          reactQuery: {
            clientConfig: {
              defaultOptions: {
                queries: {
                  staleTime: 0,
                  retry: 1,
                  refetchOnWindowFocus: false,
                },
              },
            },
          },
        }}
      >
        <ToastProvider>
         <NotificationBridge />
         <ActingTenantProvider>
          <AxiosErrorHandler />
          <CapabilitySync onChange={setCapabilities} onSuperuserChange={setIsSuperuser} />
          <Routes>
          <Route
            element={
              <Authenticated
                key="authenticated-inner"
                fallback={<Navigate to="/login" />}
              >
                <Layout>
                  <Outlet />
                </Layout>
              </Authenticated>
            }
          >
            <Route
              index
              element={<Dashboard />}
            />
            <Route
              path="/settings/api-keys"
              element={
                <RequireCapability capability="manage_api_keys">
                  <ApiKeyList />
                </RequireCapability>
              }
            />
            <Route
              path="/settings/users"
              element={
                <RequireCapability capability="manage_users">
                  <UsersList />
                </RequireCapability>
              }
            />
            <Route
              path="/widget-generator"
              element={
                <RequireCapability capability="view_widget_generator">
                  <WidgetGenerator />
                </RequireCapability>
              }
            />
            <Route
              path="/widget-preview"
              element={
                <RequireCapability capability="view_widget_preview">
                  <WidgetPreview />
                </RequireCapability>
              }
            />

            <Route path="/locations">
              <Route index element={<LocationList />} />
              <Route path="create" element={<LocationCreate />} />
              <Route path="edit/:id" element={<LocationEdit />} />
              <Route path=":id" element={<LocationShow />} />
            </Route>

            <Route path="/suppliers">
              <Route index element={<SupplierList />} />
              <Route path="create" element={<SupplierCreate />} />
              <Route path="edit/:id" element={<SupplierEdit />} />
            </Route>

            <Route path="/customers">
              <Route index element={<CustomerList />} />
              <Route path="create" element={<CustomerCreate />} />
              <Route path="edit/:id" element={<CustomerEdit />} />
            </Route>

            <Route path="/products">
              <Route index element={<ProductModelList />} />
              <Route path="create" element={<ProductModelCreate />} />
              <Route path="edit/:id" element={<ProductModelEdit />} />
              <Route path=":id" element={<ProductModelShow />} />
            </Route>

            <Route path="/products-poly">
              <Route index element={<ProductPolyList />} />
              <Route path="create" element={<ProductPolyCreate />} />
              <Route path="edit/:id" element={<ProductPolyEdit />} />
              <Route path=":id" element={<ProductPolyShow />} />
            </Route>

            <Route path="/stock">
              <Route index element={<PhysicalProductList />} />
              <Route path="create" element={<PhysicalProductCreate />} />
              <Route path="edit/:id" element={<PhysicalProductEdit />} />
              <Route path=":id" element={<PhysicalProductShow />} />
            </Route>

            <Route path="/movements">
              <Route index element={<MovementList />} />
              <Route path="create" element={<MovementCreateRoute />} />
              <Route path="transfer" element={<TransferCreate />} />
            </Route>

            <Route path="/reservations" element={<ReservationList />} />

            <Route path="/work-orders">
              <Route index element={<WorkOrderList />} />
              <Route path="create" element={<WorkOrderCreate />} />
              <Route path="edit/:id" element={<WorkOrderEdit />} />
              <Route path=":id" element={<WorkOrderShow />} />
            </Route>

            <Route path="/purchasing">
              <Route index element={<PurchaseOrderList />} />
              <Route path="create" element={<PurchaseOrderCreate />} />
              <Route path="edit/:id" element={<PurchaseOrderEdit />} />
              <Route path="receive/:id" element={<PurchaseOrderReceive />} />
            </Route>

            <Route path="/sales">
              <Route index element={<SalesOrderList />} />
              <Route path="create" element={<SalesOrderCreate />} />
              <Route path="edit/:id" element={<SalesOrderEdit />} />
              <Route path=":id" element={<SalesOrderView />} />
            </Route>

            <Route path="/transfers">
              <Route index element={<TransferOrderList />} />
              <Route path="create" element={<TransferOrderCreate />} />
              <Route path="edit/:id" element={<TransferOrderEdit />} />
              <Route path="receive/:id" element={<TransferOrderReceive />} />
            </Route>

            <Route path="/returns">
              <Route index element={<ReturnOrderList />} />
              <Route path="create" element={<ReturnOrderCreate />} />
              <Route path="edit/:id" element={<ReturnOrderEdit />} />
              <Route path="resolve/:id" element={<ReturnOrderResolve />} />
            </Route>

            <Route path="/stocktake">
              <Route index element={<StocktakeList />} />
              <Route path="create" element={<StocktakeCreate />} />
              <Route path=":id" element={<StocktakeView />} />
            </Route>

            <Route path="/restock" element={<RestockBoard />} />

            <Route path="/reports">
              <Route
                path="valuation"
                element={
                  <RequireCapability capability="manage_own_inventory">
                    <ValuationReport />
                  </RequireCapability>
                }
              />
              <Route
                path="cogs"
                element={
                  <RequireCapability capability="manage_own_inventory">
                    <CogsReport />
                  </RequireCapability>
                }
              />
            </Route>

            <Route path="/tenants">
              <Route
                index
                element={
                  <RequireCapability capability="manage_tenants">
                    <TenantList />
                  </RequireCapability>
                }
              />
              <Route
                path="create"
                element={
                  <RequireCapability capability="manage_tenants">
                    <TenantCreate />
                  </RequireCapability>
                }
              />
            </Route>

            <Route path="/qr-codes" element={<QRCodeList />} />

            <Route path="/settings/notifications" element={<NotificationChannelList />} />

            <Route path="/settings/import" element={<ProductImport />} />

            <Route path="/settings/export" element={<CompanyDataExport />} />

            <Route path="/settings/appearance" element={<AppearanceSettings />} />

            <Route path="/settings/calculators">
              <Route index element={<CalculatorList />} />
              <Route path="create" element={<CalculatorCreate />} />
              <Route path="edit/:id" element={<CalculatorEdit />} />
            </Route>

            <Route path="/playground" element={<ConfigPlayground />} />
          </Route>
          {/* Superadmin console — own layout, superuser-gated (SUPERADMIN-06) */}
          <Route
            element={
              <Authenticated
                key="authenticated-console"
                fallback={<Navigate to="/login" />}
              >
                <RequireSuperuser>
                  <ConsoleLayout>
                    <Outlet />
                  </ConsoleLayout>
                </RequireSuperuser>
              </Authenticated>
            }
          >
            <Route path="/console">
              <Route index element={<ConsoleOverview />} />
              <Route path="companies" element={<ConsoleCompanies />} />
              <Route path="companies/:id" element={<ConsoleCompanyDetail />} />
              <Route path="insights" element={<ConsoleInsights />} />
              <Route path="api-usage" element={<ConsoleApiUsage />} />
              <Route path="audit" element={<ConsoleAudit />} />
            </Route>
          </Route>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/setup" element={<SetupWizard />} />
          {/* Public Widget Route - No Layout/Auth */}
          <Route path="/widget" element={<Widget />} />
          <Route path="/p-widget/:id" element={<PolymorphicWidget />} />
          </Routes>
         </ActingTenantProvider>
        </ToastProvider>
      </Refine>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
