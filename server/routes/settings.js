/**
 * Settings Routes — Thin wiring layer.
 * Handlers extracted to _handlers/settings-handlers.js.
 */

import { Router } from 'express';
import {
  handleGetGeneralSettings,
  handleGetPlan,
  handleGetAi,
  handlePutAi,
  handleTestAiConnection,
  handleListAiModels,
  handleTestAiPrompt,
  handleListAccounts,
  handleCreateAccount,
  handleUpdateAccount,
  handleDeleteAccount,
  handleTestAccount,
  handleExchangeMetaToken,
  handleConnectToken,
  handleGetCredentials,
  handlePostCredentials,
  handleGetIntegrations,
  handleToggleIntegration,
  handlePutSetting,
} from './_handlers/settings-handlers.js';

export function createSettingsRouter(settingsRepo, llmClient, db, metaApi, nangoAuth) {
  const router = Router();

  // General settings
  router.get('/', handleGetGeneralSettings(settingsRepo));
  router.get('/plan', handleGetPlan(db));

  // AI / LLM config
  router.get('/ai', handleGetAi(settingsRepo));
  router.put('/ai', handlePutAi(settingsRepo, llmClient));
  router.post('/ai/test-connection', handleTestAiConnection(llmClient));
  router.post('/ai/models', handleListAiModels(llmClient));
  router.post('/ai/test-prompt', handleTestAiPrompt(llmClient));

  // Multi-account API
  router.get('/accounts', handleListAccounts(settingsRepo));
  router.post('/accounts', handleCreateAccount(settingsRepo));
  router.put('/accounts/:id', handleUpdateAccount(settingsRepo));
  router.delete('/accounts/:id', handleDeleteAccount(settingsRepo));
  router.post('/accounts/test', handleTestAccount(metaApi));
  router.post('/accounts/meta/exchange-token', handleExchangeMetaToken(settingsRepo, metaApi));
  router.post('/accounts/connect-token', handleConnectToken(settingsRepo, metaApi, nangoAuth));

  // Legacy support
  router.get('/credentials/:platform', handleGetCredentials(settingsRepo));
  router.post('/credentials/:platform', handlePostCredentials(settingsRepo));

  // Integrations
  router.get('/integrations', handleGetIntegrations(settingsRepo));
  router.post('/integrations/:name', handleToggleIntegration(settingsRepo));

  // General setting
  router.put('/:key', handlePutSetting(settingsRepo));

  return router;
}
