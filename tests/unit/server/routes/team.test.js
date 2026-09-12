import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createDatabase } from '../../../../db/index.js';
import { createRepositories } from '../../../../server/app/repositories.js';
import { createTeamRouter } from '../../../../server/routes/team.js';
import { generateToken } from '../../../../server/lib/auth.js';

vi.mock('../../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

let db;
let repos;
let mailer;

const token = (id, email) => generateToken({ id, username: id, email });
const auth = (t) => ({ Authorization: `Bearer ${t}` });

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/team', createTeamRouter(repos.paymentsRepo, repos.usersRepo, mailer));
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ success: false, error: err.message });
  });
  return app;
}

const OWNER = { id: 'owner-1', email: 'owner1@example.com' };
const RIVAL = { id: 'owner-2', email: 'owner2@example.com' };
const INVITEE = { id: 'invitee-1', email: 'invitee@example.com' };

beforeEach(() => {
  db = createDatabase(':memory:');
  repos = createRepositories(db);
  repos.usersRepo.create({ username: 'owner1', email: OWNER.email, password_hash: 'x', confirmed: 1 });
  repos.usersRepo.create({ username: 'owner2', email: RIVAL.email, password_hash: 'x', confirmed: 1 });
  repos.usersRepo.create({ username: 'invitee', email: INVITEE.email, password_hash: 'x', confirmed: 1 });
  mailer = { sendInvite: vi.fn(async () => true) };
});

describe('GET /api/team — owner-scoped listing', () => {
  it('lists only the caller\'s own members, never another tenant\'s', async () => {
    repos.paymentsRepo.addTeamMember({
      teamOwnerId: RIVAL.id, userId: null, email: 'rival-member@example.com',
      role: 'viewer', status: 'pending', inviteToken: 'rival-token',
    });

    const res = await request(buildApp()).get('/api/team').set(auth(token(OWNER.id, OWNER.email)));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('reports the joined username once a member is active', async () => {
    repos.paymentsRepo.addTeamMember({
      teamOwnerId: OWNER.id, userId: INVITEE.id, email: INVITEE.email,
      role: 'admin', status: 'active', inviteToken: null,
    });

    const res = await request(buildApp()).get('/api/team').set(auth(token(OWNER.id, OWNER.email)));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ email: INVITEE.email, role: 'admin', status: 'active' });
  });
});

describe('POST /api/team/invite', () => {
  const invite = (body, who = OWNER) =>
    request(buildApp()).post('/api/team/invite').set(auth(token(who.id, who.email))).send(body);

  it('creates a pending invite with a token, a deadline, and reports delivery', async () => {
    const res = await invite({ email: 'newbie@example.com', role: 'admin' });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ email: 'newbie@example.com', role: 'admin', status: 'pending', emailSent: true });
    // The token must travel by email only — never echoed back to the inviter.
    expect(res.body.data).not.toHaveProperty('invite_token');

    const row = repos.paymentsRepo.findTeamMemberByOwnerAndEmail(OWNER.id, 'newbie@example.com');
    expect(row.invite_token).toBeTruthy();
    expect(row.expires_at).toBeTruthy();
    expect(mailer.sendInvite).toHaveBeenCalledOnce();
  });

  it('reports emailSent false when no mail provider is configured', async () => {
    mailer.sendInvite = vi.fn(async () => false);

    const res = await invite({ email: 'newbie@example.com' });

    expect(res.status).toBe(201);
    expect(res.body.data.emailSent).toBe(false);
  });

  it('still stores the invite when the mailer is absent', async () => {
    mailer = undefined;

    const res = await invite({ email: 'newbie@example.com' });

    expect(res.status).toBe(201);
    expect(res.body.data.emailSent).toBe(false);
    expect(repos.paymentsRepo.findTeamMemberByOwnerAndEmail(OWNER.id, 'newbie@example.com')).toBeTruthy();
  });

  it('rejects a duplicate invite for the same email, ignoring case', async () => {
    await invite({ email: 'newbie@example.com' });

    const res = await invite({ email: 'Newbie@Example.com' });

    expect(res.status).toBe(409);
  });

  it('rejects an invalid email and the owner role', async () => {
    expect((await invite({ email: 'not-an-email' })).status).toBe(400);
    expect((await invite({ email: 'x@example.com', role: 'owner' })).status).toBe(400);
    expect((await invite({ email: 'x@example.com', role: 'root' })).status).toBe(400);
  });

  it('invites an email that has no account yet, leaving user_id unset', async () => {
    const res = await invite({ email: 'stranger@example.com' });

    expect(res.status).toBe(201);
    const row = repos.paymentsRepo.findTeamMemberByOwnerAndEmail(OWNER.id, 'stranger@example.com');
    expect(row.user_id).toBeNull();
  });
});

describe('POST /api/team/accept', () => {
  async function createInvite(email, { expiresAt } = {}) {
    const inviteToken = `tok-${email}`;
    repos.paymentsRepo.addTeamMember({
      teamOwnerId: OWNER.id, userId: null, email, role: 'viewer',
      status: 'pending', inviteToken, expiresAt,
    });
    return inviteToken;
  }

  it('activates the membership and burns the token so it cannot be replayed', async () => {
    const inviteToken = await createInvite(INVITEE.email);
    const app = buildApp();

    const first = await request(app).post('/api/team/accept')
      .set(auth(token(INVITEE.id, INVITEE.email))).send({ email: INVITEE.email, token: inviteToken });

    expect(first.status).toBe(200);
    // The membership binds to the authenticated user's real id, resolved from
    // the account that owns this email.
    expect(first.body.data).toMatchObject({
      status: 'active',
      user_id: repos.usersRepo.findByEmail(INVITEE.email).id,
    });
    expect(first.body.data.accepted_at).toBeTruthy();

    const replay = await request(app).post('/api/team/accept')
      .set(auth(token(INVITEE.id, INVITEE.email))).send({ email: INVITEE.email, token: inviteToken });

    expect(replay.status).toBe(404);
  });

  it('refuses an expired invitation', async () => {
    const inviteToken = await createInvite(INVITEE.email, { expiresAt: '2000-01-01 00:00:00' });

    const res = await request(buildApp()).post('/api/team/accept')
      .set(auth(token(INVITEE.id, INVITEE.email))).send({ email: INVITEE.email, token: inviteToken });

    expect(res.status).toBe(409);
    const row = repos.paymentsRepo.findTeamMemberByOwnerAndEmail(OWNER.id, INVITEE.email);
    expect(row.status).toBe('pending');
  });

  it('refuses a token that does not belong to the submitted email', async () => {
    const inviteToken = await createInvite(INVITEE.email);

    const res = await request(buildApp()).post('/api/team/accept')
      .set(auth(token('someone-else', 'someone-else@example.com')))
      .send({ email: 'someone-else@example.com', token: inviteToken });

    expect(res.status).toBe(403);
  });
});

describe('PATCH/DELETE /api/team/:id — owner-scoped mutations', () => {
  it('updates a member role for the owning tenant', async () => {
    const member = repos.paymentsRepo.addTeamMember({
      teamOwnerId: OWNER.id, userId: INVITEE.id, email: INVITEE.email,
      role: 'viewer', status: 'active', inviteToken: null,
    });

    const res = await request(buildApp()).patch(`/api/team/${member.id}`)
      .set(auth(token(OWNER.id, OWNER.email))).send({ role: 'admin' });

    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('admin');
  });

  it('cannot update or revoke another tenant\'s member', async () => {
    // addTeamMember() re-reads the row it just wrote; with a null user_id the
    // NULL-safe lookup finds nothing and returns undefined, so fetch the invite
    // explicitly to get its id.
    repos.paymentsRepo.addTeamMember({
      teamOwnerId: RIVAL.id, userId: null, email: 'rival-member@example.com',
      role: 'viewer', status: 'active', inviteToken: null,
    });
    const rival = repos.paymentsRepo.findTeamMemberByOwnerAndEmail(RIVAL.id, 'rival-member@example.com');
    const app = buildApp();

    const patch = await request(app).patch(`/api/team/${rival.id}`)
      .set(auth(token(OWNER.id, OWNER.email))).send({ role: 'admin' });
    const del = await request(app).delete(`/api/team/${rival.id}`)
      .set(auth(token(OWNER.id, OWNER.email)));

    expect(patch.status).toBe(404);
    expect(del.status).toBe(404);
    expect(repos.paymentsRepo.findTeamMemberByOwnerAndEmail(RIVAL.id, 'rival-member@example.com').role).toBe('viewer');
  });

  it('revokes a member and is idempotent-safe (second revoke is a 404)', async () => {
    const member = repos.paymentsRepo.addTeamMember({
      teamOwnerId: OWNER.id, userId: INVITEE.id, email: INVITEE.email,
      role: 'viewer', status: 'active', inviteToken: null,
    });
    const app = buildApp();

    const first = await request(app).delete(`/api/team/${member.id}`).set(auth(token(OWNER.id, OWNER.email)));
    const second = await request(app).delete(`/api/team/${member.id}`).set(auth(token(OWNER.id, OWNER.email)));

    expect(first.status).toBe(200);
    expect(second.status).toBe(404);
    expect(repos.paymentsRepo.findTeamMemberByOwnerAndEmail(OWNER.id, INVITEE.email).status).toBe('revoked');
  });
});
