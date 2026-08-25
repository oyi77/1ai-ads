import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Shell } from './components/layout/shell';
import { ErrorBoundary } from './components/ErrorBoundary';
import { RequireAuth } from './components/RequireAuth';
import { RequirePro } from './components/RequirePro';
import { CookieConsent } from './components/CookieConsent';
import { initTelegramWebApp } from './lib/telegram';

// Lazy-loaded pages
const LoginPage = lazy(() => import('./pages/login').then(m => ({ default: m.LoginPage })));
const LandingPage = lazy(() => import('./pages/landing').then(m => ({ default: m.LandingPage })));
const DashboardPage = lazy(() => import('./pages/dashboard').then(m => ({ default: m.DashboardPage })));
const CampaignsPage = lazy(() => import('./pages/campaigns').then(m => ({ default: m.CampaignsPage })));
const AdsPage = lazy(() => import('./pages/ads').then(m => ({ default: m.AdsPage })));
const SettingsPage = lazy(() => import('./pages/settings').then(m => ({ default: m.SettingsPage })));
const CreativeLibraryPage = lazy(() => import('./pages/creative-library').then(m => ({ default: m.CreativeLibraryPage })));
const CreativeFatiguePage = lazy(() => import('./pages/creative-fatigue').then(m => ({ default: m.CreativeFatiguePage })));
const ABTestsPage = lazy(() => import('./pages/ab-tests').then(m => ({ default: m.ABTestsPage })));
const ReportingPage = lazy(() => import('./pages/reporting').then(m => ({ default: m.ReportingPage })));
const AutomationPage = lazy(() => import('./pages/automation').then(m => ({ default: m.AutomationPage })));
const CompetitorsPage = lazy(() => import('./pages/competitors').then(m => ({ default: m.CompetitorsPage })));
const TrendingPage = lazy(() => import('./pages/trending').then(m => ({ default: m.TrendingPage })));
const MetaAiPage = lazy(() => import('./pages/meta-ai').then(m => ({ default: m.MetaAiPage })));
const TemplatesPage = lazy(() => import('./pages/templates').then(m => ({ default: m.TemplatesPage })));
const LandingPagesPage = lazy(() => import('./pages/landing-pages').then(m => ({ default: m.LandingPagesPage })));
const AudienceIntelligencePage = lazy(() => import('./pages/audience-intelligence').then(m => ({ default: m.AudienceIntelligencePage })));
const DraftsPage = lazy(() => import('./pages/drafts').then(m => ({ default: m.DraftsPage })));
const PlatformsPage = lazy(() => import('./pages/platforms').then(m => ({ default: m.PlatformsPage })));
const AttributionPage = lazy(() => import('./pages/attribution').then(m => ({ default: m.AttributionPage })));
const WidgetsPage = lazy(() => import('./pages/widgets').then(m => ({ default: m.WidgetsPage })));
const NotFoundPage = lazy(() => import('./pages/not-found').then(m => ({ default: m.NotFoundPage })));
const PrivacyPage = lazy(() => import('./pages/privacy').then(m => ({ default: m.PrivacyPage })));
const TermsPage = lazy(() => import('./pages/terms').then(m => ({ default: m.TermsPage })));
const OnboardingPage = lazy(() => import('./pages/onboarding').then(m => ({ default: m.OnboardingPage })));
const InvoicesPage = lazy(() => import('./pages/invoices').then(m => ({ default: m.InvoicesPage })));
const AdsetsPage = lazy(() => import('./pages/adsets').then(m => ({ default: m.AdsetsPage })));
const AudiencesPage = lazy(() => import('./pages/audiences').then(m => ({ default: m.AudiencesPage })));
const TargetingPage = lazy(() => import('./pages/targeting').then(m => ({ default: m.TargetingPage })));
const AuditTrailPage = lazy(() => import('./pages/audit-trail').then(m => ({ default: m.AuditTrailPage })));
const BillingPage = lazy(() => import('./pages/billing').then(m => ({ default: m.BillingPage })));
const VerifyEmailPage = lazy(() => import('./pages/verify-email').then(m => ({ default: m.VerifyEmailPage })));
const ResetPasswordPage = lazy(() => import('./pages/reset-password').then(m => ({ default: m.ResetPasswordPage })));
const AccountReportsPage = lazy(() => import('./pages/account-reports').then(m => ({ default: m.AccountReportsPage })));

function Loading() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: 'var(--bg-deep)', color: 'var(--text-secondary)',
      fontFamily: 'var(--font)', fontSize: '0.85rem',
    }}>
      Loading...
    </div>
  );
}

let telegramBootstrapped = false;

export function App() {
  // Inside Telegram? exchange initData for a session once.
  if (!telegramBootstrapped) {
    telegramBootstrapped = true;
    initTelegramWebApp();
  }

  return (
    <ErrorBoundary>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/onboarding" element={<RequireAuth><OnboardingPage /></RequireAuth>} />
          <Route element={<RequireAuth><Shell /></RequireAuth>}>
            <Route path="/app" element={<DashboardPage />} />
            <Route path="/campaigns" element={<CampaignsPage />} />
            <Route path="/ads" element={<AdsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/creative-library" element={<CreativeLibraryPage />} />
            <Route path="/creative-fatigue" element={<CreativeFatiguePage />} />
            <Route path="/ab-tests" element={<RequirePro><ABTestsPage /></RequirePro>} />
            <Route path="/reporting" element={<ReportingPage />} />
            <Route path="/automation" element={<RequirePro><AutomationPage /></RequirePro>} />
            <Route path="/competitors" element={<CompetitorsPage />} />
            <Route path="/trending" element={<TrendingPage />} />
            <Route path="/meta-ai" element={<MetaAiPage />} />
            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="/landing-pages" element={<LandingPagesPage />} />
            <Route path="/audiences" element={<RequirePro><AudienceIntelligencePage /></RequirePro>} />
            <Route path="/adsets" element={<AdsetsPage />} />
            <Route path="/invoices" element={<InvoicesPage />} />
            <Route path="/saved-audiences" element={<AudiencesPage />} />
            <Route path="/targeting" element={<TargetingPage />} />
            <Route path="/attribution" element={<RequirePro><AttributionPage /></RequirePro>} />
            <Route path="/widgets" element={<WidgetsPage />} />
            <Route path="/audit" element={<AuditTrailPage />} />
            <Route path="/drafts" element={<DraftsPage />} />
            <Route path="/platforms" element={<PlatformsPage />} />
            <Route path="/billing" element={<BillingPage />} />
            <Route path="/reports" element={<AccountReportsPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
      <CookieConsent />
    </ErrorBoundary>
  );
}
