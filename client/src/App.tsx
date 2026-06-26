import { Routes, Route, Navigate } from 'react-router-dom';
import { Shell } from './components/layout/shell';
import { LoginPage } from './pages/login';
import { DashboardPage } from './pages/dashboard';
import { CampaignsPage } from './pages/campaigns';
import { SettingsPage } from './pages/settings';
import { CreativeLibraryPage } from './pages/creative-library';
import { CreativeFatiguePage } from './pages/creative-fatigue';
import { ABTestsPage } from './pages/ab-tests';
import { ReportingPage } from './pages/reporting';
import { AutomationPage } from './pages/automation';
import { CompetitorsPage } from './pages/competitors';
import { AttributionPage } from './pages/attribution';
import { WidgetsPage } from './pages/widgets';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Shell />}>
        <Route index element={<Navigate to="/app" replace />} />
        <Route path="app" element={<DashboardPage />} />
        <Route path="campaigns" element={<CampaignsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="creative-library" element={<CreativeLibraryPage />} />
        <Route path="creative-fatigue" element={<CreativeFatiguePage />} />
        <Route path="ab-tests" element={<ABTestsPage />} />
        <Route path="reporting" element={<ReportingPage />} />
        <Route path="automation" element={<AutomationPage />} />
        <Route path="competitors" element={<CompetitorsPage />} />
        <Route path="attribution" element={<AttributionPage />} />
        <Route path="widgets" element={<WidgetsPage />} />
      </Route>
    </Routes>
  );
}
