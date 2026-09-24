import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import AppLayout from "./components/layout/AppLayout";
import LoginPage from "./pages/auth/LoginPage";
import DashboardPage from "./pages/dashboard/DashboardPage";
import ClientsPage from "./pages/clients/ClientsPage";
import SitesPage from "./pages/sites/SitesPage";
import EmployeesPage from "./pages/employees/EmployeesPage";
import RosterPage from "./pages/roster/RosterPage";
import ContractsPage from "./pages/contracts/ContractsPage";
import OperationsPage from "./pages/operations/OperationsPage";
import AttendanceCalendarPage from "./pages/operations/AttendanceCalendarPage";
import "./App.css";
import InventoryPage from "./pages/inventory/InventoryPage";
import InvoicesPage from "./pages/invoices/InvoicesPage";
import PayrollPage from "./pages/payroll/PayrollPage";
import TasksPage from "./pages/tasks/TasksPage";
import DepartmentRequestsPage from "./pages/departments/DepartmentRequestsPage";
import ExpensesPage from "./pages/expenses/ExpensesPage";
import UsersPage from "./pages/users/UsersPage";
import SettingsPage from "./pages/settings/SettingsPage";
import AlertsPage from "./pages/alerts/AlertsPage";
import SiteCoveragePage from "./pages/site-coverage/SiteCoveragePage";
import FinancePage from "./pages/finance/FinancePage";
import MessagesPage from "./pages/messages/MessagesPage";
import DeploymentPage from "./pages/deployment/DeploymentPage";
import ProspectsPage from "./pages/marketing/ProspectsPage";
import ActivitiesPage from "./pages/marketing/ActivitiesPage";
import MarketingDashboardPage from "./pages/marketing/MarketingDashboardPage";
import FieldVisitsPage from "./pages/marketing/FieldVisitsPage";

// NOTE (2026-09-13, MB.2): this file previously still had the default
// Vite starter template in it -- AuthProvider/router/AppLayout/LoginPage/
// DashboardPage all already existed as real files, but nothing here ever
// actually used them, so the app rendered the Vite splash screen instead
// of a login page. This is the fix: wire up the router for real.
//
// UPDATE (2026-09-13, continued): Clients/Sites/Employees/Roster/
// Contracts are now all real, routed pages. Every other section in the
// handoff's "Build order for remaining pages" list still only has a
// folder under src/pages/ with no component inside yet.

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<AppLayout />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/invoices" element={<InvoicesPage />} />
            <Route path="/payroll" element={<PayrollPage />} />
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/sites" element={<SitesPage />} />
            <Route path="/employees" element={<EmployeesPage />} />
            <Route path="/roster" element={<RosterPage />} />
            <Route path="/contracts" element={<ContractsPage />} />
            <Route path="/operations" element={<OperationsPage />} />
            <Route path="/operations/calendar" element={<AttendanceCalendarPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/department-requests" element={<DepartmentRequestsPage />} />
            <Route path="/expenses" element={<ExpensesPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/site-coverage" element={<SiteCoveragePage />} />
            <Route path="/finance" element={<FinancePage />} />
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/deployment" element={<DeploymentPage />} />
            <Route path="/marketing/prospects" element={<ProspectsPage />} />
            <Route path="/marketing/activities" element={<ActivitiesPage />} />
            <Route path="/marketing/dashboard" element={<MarketingDashboardPage />} />
            <Route path="/marketing/field-visits" element={<FieldVisitsPage />} />
          </Route>

          {/* Anything unmatched falls back to the dashboard (or login, via AppLayout's own redirect if not authenticated) */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;



