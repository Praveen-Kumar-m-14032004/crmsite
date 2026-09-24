import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import { ProtectedRoute, PermissionRoute } from './components/layout/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AddCustomer from './pages/customers/AddCustomer';
import ManageCustomer from './pages/customers/ManageCustomer';
import AddProduct from './pages/products/AddProduct';
import ManageProduct from './pages/products/ManageProduct';
import AddInvoice from './pages/invoices/AddInvoice';
import ManageInvoice from './pages/invoices/ManageInvoice';
import ManageQuotation from './pages/quotations/ManageQuotation';
import AddQuotation from './pages/quotations/AddQuotation';
import QuotationView from './pages/quotations/QuotationView';
import Reports from './pages/reports/Reports';
import AddUser from './pages/users/AddUser';
import ManageUsers from './pages/users/ManageUsers';
import RolesPermissions from './pages/users/RolesPermissions';
import CompanySettings from './pages/settings/CompanySettings';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route path="/dashboard" element={<PermissionRoute permission="dashboard.view"><Dashboard /></PermissionRoute>} />

        <Route path="/customers" element={<PermissionRoute permission="customers.view"><ManageCustomer /></PermissionRoute>} />
        <Route path="/customers/add" element={<PermissionRoute permission="customers.create"><AddCustomer /></PermissionRoute>} />
        <Route path="/customers/:id/edit" element={<PermissionRoute permission="customers.edit"><AddCustomer /></PermissionRoute>} />

        <Route path="/products" element={<PermissionRoute permission="products.view"><ManageProduct /></PermissionRoute>} />
        <Route path="/products/add" element={<PermissionRoute permission="products.create"><AddProduct /></PermissionRoute>} />
        <Route path="/products/:id/edit" element={<PermissionRoute permission="products.edit"><AddProduct /></PermissionRoute>} />

        <Route path="/invoices" element={<PermissionRoute permission="invoices.view"><ManageInvoice /></PermissionRoute>} />
        <Route path="/invoices/trash" element={<PermissionRoute permission="invoices.delete"><ManageInvoice /></PermissionRoute>} />
        <Route path="/invoices/add" element={<PermissionRoute permission="invoices.create"><AddInvoice /></PermissionRoute>} />
        <Route path="/invoices/:id/edit" element={<PermissionRoute permission="invoices.edit"><AddInvoice /></PermissionRoute>} />

        <Route path="/estimates" element={<PermissionRoute permission={['quotations.view', 'invoices.view']}><ManageQuotation /></PermissionRoute>} />
        <Route path="/estimates/add" element={<PermissionRoute permission={['quotations.create', 'invoices.create']}><AddQuotation /></PermissionRoute>} />
        <Route path="/estimates/:id" element={<PermissionRoute permission={['quotations.view', 'invoices.view']}><QuotationView /></PermissionRoute>} />
        <Route path="/estimates/:id/edit" element={<PermissionRoute permission={['quotations.edit', 'invoices.edit']}><AddQuotation /></PermissionRoute>} />
        <Route path="/quotations" element={<Navigate to="/estimates" replace />} />

        <Route path="/reports" element={<PermissionRoute permission="reports.view"><Reports /></PermissionRoute>} />

        <Route path="/users" element={<PermissionRoute permission="users.manage"><ManageUsers /></PermissionRoute>} />
        <Route path="/users/add" element={<PermissionRoute permission="users.manage"><AddUser /></PermissionRoute>} />
        <Route path="/roles" element={<PermissionRoute permission="roles.manage"><RolesPermissions /></PermissionRoute>} />

        <Route path="/settings" element={<PermissionRoute permission="settings.manage"><CompanySettings /></PermissionRoute>} />

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
