import { Routes, Route, Navigate } from 'react-router-dom';
import { Shell } from './components/layout/shell';
import { LoginPage } from './pages/login';
import { DashboardPage } from './pages/dashboard';
import { CampaignsPage } from './pages/campaigns';
import { SettingsPage } from './pages/settings';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Shell />}>
        <Route index element={<Navigate to="/app" replace />} />
        <Route path="app" element={<DashboardPage />} />
        <Route path="campaigns" element={<CampaignsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
