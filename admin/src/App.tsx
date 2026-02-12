import { Routes, Route } from "react-router-dom";
import { Providers } from "./providers";
import LoginPage from "./pages/auth/LoginPage";
import DashboardLayout from "./layouts/DashboardLayout";
import DashboardHome from "./pages/dashboard/DashboardHome";
import AdsPage from "./pages/products/AdsPage";
import AdminProfilePage from "./pages/profile/AdminProfilePage";
import MerchantsPage from "./pages/merchants/MerchantsPage";
import MerchantDetailPage from "./pages/merchants/MerchantDetailPage";
import RequireAdmin from "./components/RequireAdmin";

function App() {
  return (
    <Providers>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        {/* Protected Routes */}
        <Route
          path="/"
          element={
            <RequireAdmin allowedRoles={["admin"]}>
              <DashboardLayout />
            </RequireAdmin>
          }
        >
          <Route index element={<DashboardHome />} />
          <Route path="ads" element={<AdsPage />} />
          <Route path="merchants" element={<MerchantsPage />} />
          <Route path="merchants/:merchantId" element={<MerchantDetailPage />} />
          <Route path="profile" element={<AdminProfilePage />} />
        </Route>
      </Routes>
    </Providers>
  );
}

export default App;

