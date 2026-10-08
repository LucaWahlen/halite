import { Navigate, Route, Routes } from "react-router";
import { I18nProvider, ToastProvider } from "@heroui/react";

import { AdminLayout } from "./pages/AdminLayout";
import { AdminRecipes } from "./pages/AdminRecipes";
import { AdminSettings } from "./pages/AdminSettings";
import { RecipeEditor } from "./pages/RecipeEditor";
import { RecipeListPage } from "./pages/RecipeListPage";
import { RecipeDetailPage } from "./pages/RecipeDetailPage";
import { ShoppingListPage } from "./pages/ShoppingListPage";
import { LoginPage } from "./pages/LoginPage";
import { LegalPage } from "./pages/LegalPage";

export default function App() {
  return (
    <I18nProvider locale="de-DE">
      <Routes>
        <Route path="/" element={<RecipeListPage />} />
        <Route path="/rezept/:id" element={<RecipeDetailPage />} />
        <Route path="/einkaufsliste" element={<ShoppingListPage />} />
        <Route path="/impressum" element={<LegalPage kind="imprint" />} />
        <Route path="/datenschutz" element={<LegalPage kind="privacy" />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminRecipes />} />
          <Route path="neu" element={<RecipeEditor />} />
          <Route path="rezept/:id" element={<RecipeEditor />} />
          <Route path="einstellungen" element={<AdminSettings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastProvider />
    </I18nProvider>
  );
}
