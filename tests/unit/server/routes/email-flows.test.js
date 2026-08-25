import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const mailState = vi.hoisted(() => ({ enabled: true, sent: [] }));

vi.mock('../../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: () => {}, error: () => {}, warn: () => {}, debug: () => {} }),
}));

vi.mock('../../../../server/lib/mailer.js', async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    mailerEnabled: () => mailState.enabled,
    sendVerificationEmail: vi.fn(async (to, _u, token) => {
      mailState.sent.push({ to, subject: 'verify', token });
      return true;
    }),
    sendPasswordResetEmail: vi.fn(async (to, _u, token) => {
      mailState.sent.push({ to, subject: 'reset', token });
      return true;
    }),
  };
});

vi.mock('../../../../server/lib/auth.js', async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    generateToken: () => 'access-token',
    generateRefreshToken: () => 'refresh-token',
  };
});

import {
  handleRegister, handleVerifyEmail, handleForgotPassword, handleResetPassword,
} from '../../../../server/routes/_handlers/auth-handlers.js';

function makeUsersRepo() {
  const users = new Map();
  const repo = {
    findByUsername: (u) => [...users.values()].find(x => x.username === u) || null,
    findByEmail: (e) => [...users.values()].find(x => x.email === e) || null,
    create: ({ username, email, password_hash, confirmed }) => {
      const id = 'u_' + (users.size + 1);
      users.set(id, { id, username, email, password_hash, confirmed });
      return id;
    },
    setEmailVerificationToken: (id, { hash, expiresAt }) =>
      Object.assign(users.get(id), { email_verification_hash: hash, email_verification_expires: expiresAt }),
    findByVerificationTokenHash: (h) => [...users.values()].find(u => u.email_verification_hash === h) || null,
    markEmailVerified: (id) => {
      Object.assign(users.get(id), { confirmed: 1, email_verification_hash: null, email_verification_expires: null });
      return users.get(id);
    },
    setPasswordResetToken: (id, { hash, expiresAt }) =>
      Object.assign(users.get(id), { password_reset_hash: hash, password_reset_expires: expiresAt }),
    findByPasswordResetTokenHash: (h) => [...users.values()].find(u => u.password_reset_hash === h) || null,
    clearPasswordResetToken: (id) => Object.assign(users.get(id), { password_reset_hash: null, password_reset_expires: null }),
    update: (id, data) => Object.assign(users.get(id), data),
  };
  repo._all = users;
  return repo;
}

function makeRefreshRepo() {
  return { upsert: vi.fn(), deleteByToken: vi.fn(), deleteByUserId: vi.fn() };
}

function appWith(usersRepo, refreshTokensRepo = makeRefreshRepo()) {
  const app = express();
  app.use(express.json());
  app.post('/register', handleRegister(usersRepo, refreshTokensRepo));
  app.post('/verify-email', handleVerifyEmail(usersRepo));
  app.post('/forgot-password', handleForgotPassword(usersRepo));
  app.post('/reset-password', handleResetPassword(usersRepo, refreshTokensRepo));
  return { app, refreshTokensRepo };
}

describe('auth email flows', () => {
  beforeEach(() => {
    mailState.enabled = true;
    mailState.sent.length = 0;
  });

  it('register sends a verification email and starts unconfirmed when mailer is enabled', async () => {
    const usersRepo = makeUsersRepo();
    const res = await request(appWith(usersRepo).app)
      .post('/register')
      .send({ username: 'alice', email: 'alice@test.local', password: 'secret123' });
    expect(res.status).toBe(200);
    expect(res.body.data.verificationSent).toBe(true);
    expect(mailState.sent.some(s => s.subject === 'verify')).toBe(true);
    const user = usersRepo.findByEmail('alice@test.local');
    expect(user.confirmed).toBe(0);
    expect(user.email_verification_hash).toBeTruthy();
  });

  it('register auto-confirms when mailer disabled (dev parity)', async () => {
    mailState.enabled = false;
    const usersRepo = makeUsersRepo();
    const res = await request(appWith(usersRepo).app)
      .post('/register')
      .send({ username: 'bob', email: 'bob@test.local', password: 'secret123' });
    expect(res.body.data.verificationSent).toBe(false);
    expect(usersRepo.findByEmail('bob@test.local').confirmed).toBe(1);
  });

  it('verify-email consumes the token and marks the user confirmed', async () => {
    const usersRepo = makeUsersRepo();
    await request(appWith(usersRepo).app)
      .post('/register')
      .send({ username: 'carol', email: 'carol@test.local', password: 'secret123' });
    const token = mailState.sent[mailState.sent.length - 1].token;

    const bad = await request(appWith(usersRepo).app).post('/verify-email').send({ token: 'wrong' });
    expect(bad.status).toBe(400);

    const ok = await request(appWith(usersRepo).app).post('/verify-email').send({ token });
    expect(ok.status).toBe(200);
    expect(usersRepo.findByEmail('carol@test.local').confirmed).toBe(1);
  });

  it('forgot-password issues a single-use reset token that updates the password', async () => {
    const usersRepo = makeUsersRepo();
    const refresh = makeRefreshRepo();
    const { app } = appWith(usersRepo, refresh);
    await request(app).post('/register').send({ username: 'dave', email: 'dave@test.local', password: 'oldpass1' });
    usersRepo.markEmailVerified(usersRepo.findByEmail('dave@test.local').id);

    const req = await request(app).post('/forgot-password').send({ email: 'dave@test.local' });
    expect(req.status).toBe(200);
    const token = mailState.sent[mailState.sent.length - 1].token;

    const reset = await request(app).post('/reset-password').send({ token, password: 'newpass99' });
    if (reset.status !== 200) require('fs').writeFileSync('/tmp/reset-err.txt', JSON.stringify(reset.body));
    expect(reset.status).toBe(200);
    const user = usersRepo.findByEmail('dave@test.local');
    expect(user.password_reset_hash).toBeNull();
    expect(refresh.deleteByUserId).toHaveBeenCalledWith(user.id); // sessions revoked

    // token is single-use
    const again = await request(app).post('/reset-password').send({ token, password: 'another77' });
    expect(again.status).toBe(400);
  });

  it('forgot-password response is identical for unknown emails (anti-enumeration)', async () => {
    const { app } = appWith(makeUsersRepo());
    const res = await request(app).post('/forgot-password').send({ email: 'nobody@test.local' });
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('If that email is registered');
  });
});
