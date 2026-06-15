import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import enCommon from "./locales/en/common.json";
import enNav from "./locales/en/nav.json";
import enDashboard from "./locales/en/dashboard.json";
import enProducts from "./locales/en/products.json";
import enInventory from "./locales/en/inventory.json";
import enSettings from "./locales/en/settings.json";
import enOnboarding from "./locales/en/onboarding.json";
import enWidget from "./locales/en/widget.json";
import enRestock from "./locales/en/restock.json";
import enPurchasing from "./locales/en/purchasing.json";
import enSales from "./locales/en/sales.json";
import enTransfers from "./locales/en/transfers.json";
import enReturns from "./locales/en/returns.json";
import enStocktake from "./locales/en/stocktake.json";
import enReports from "./locales/en/reports.json";
import enImport from "./locales/en/import.json";

import itCommon from "./locales/it/common.json";
import itNav from "./locales/it/nav.json";
import itDashboard from "./locales/it/dashboard.json";
import itProducts from "./locales/it/products.json";
import itInventory from "./locales/it/inventory.json";
import itSettings from "./locales/it/settings.json";
import itOnboarding from "./locales/it/onboarding.json";
import itWidget from "./locales/it/widget.json";
import itRestock from "./locales/it/restock.json";
import itPurchasing from "./locales/it/purchasing.json";
import itSales from "./locales/it/sales.json";
import itTransfers from "./locales/it/transfers.json";
import itReturns from "./locales/it/returns.json";
import itStocktake from "./locales/it/stocktake.json";
import itReports from "./locales/it/reports.json";
import itImport from "./locales/it/import.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: enCommon,
        nav: enNav,
        dashboard: enDashboard,
        products: enProducts,
        inventory: enInventory,
        settings: enSettings,
        onboarding: enOnboarding,
        widget: enWidget,
        restock: enRestock,
        purchasing: enPurchasing,
        sales: enSales,
        transfers: enTransfers,
        returns: enReturns,
        stocktake: enStocktake,
        reports: enReports,
        import: enImport,
      },
      it: {
        common: itCommon,
        nav: itNav,
        dashboard: itDashboard,
        products: itProducts,
        inventory: itInventory,
        settings: itSettings,
        onboarding: itOnboarding,
        widget: itWidget,
        restock: itRestock,
        purchasing: itPurchasing,
        sales: itSales,
        transfers: itTransfers,
        returns: itReturns,
        stocktake: itStocktake,
        reports: itReports,
        import: itImport,
      },
    },
    fallbackLng: "en",
    defaultNS: "common",
    ns: ["common", "nav", "dashboard", "products", "inventory", "settings", "onboarding", "widget", "restock", "purchasing", "sales", "transfers", "returns", "stocktake", "reports", "import"],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "language",
      caches: ["localStorage"],
    },
  });

export default i18n;
