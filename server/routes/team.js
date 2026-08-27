import { Router } from 'express';
import crypto from 'crypto';
import { createLogger } from '../lib/logger.js';
import { requireAuth } from '../middleware/auth.js';

const log = createLogger('team');

const ROLES = ['owner', 'admin', 'viewer'];
const ROLE_PERMISSIONS = {
  owner: ['invite', 'revoke', 'update_role', 'billing', 'api_keys', 'settings', 'delete_account'],
  admin: ['invite', 'revoke', 'update_role', 'api_keys', 'settings'],
  viewer: ['read_only'],
};

function generateInviteToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function createTeamRouter(paymentsRepo, usersRepo, mailer) {
  const router = Router();
  router.use(requireAuth);

  // GET /api/team — list team members for current user (as owner)
  router.get('/', async (req, res) => {
    try {
      const members = paymentsRepo.findTeamMembersByOwner(req.user.id);
      res.json({ success: true, data: members });
    } catch (err) {
      log.error('Failed to list team members', { error: err.message, userId: req.user.id });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/team/my-memberships — list teams current user is a member of
  router.get('/my-memberships', async (req, res) => {
    try {
      const memberships = paymentsRepo.findTeamMembershipByUserId(req.user.id);
      res.json({ success: true, data: memberships });
    } catch (err) {
      log.error('Failed to list memberships', { error: err.message, userId: req.user.id });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/team/roles — list available roles
  router.get('/roles', (_req, res) => {
    res.json({ success: true, data: ROLES.map(r => ({ role: r, permissions: ROLE_PERMISSIONS[r] })) });
  });

  // POST /api/team/invite — invite a new team member
  router.post('/invite', async (req, res) => {
    try {
      const { email, role = 'viewer' } = req.body;
      if (!email || !email.includes('@')) {
        return res.status(400).json({ success: false, error: 'Valid email required' });
      }
      if (!ROLES.includes(role)) {
        return res.status(400).json({ success: false, error: `Invalid role. Must be one of: ${ROLES.join(', ')}` });
      }
      if (role === 'owner') {
        return res.status(400).json({ success: false, error: 'Cannot invite as owner' });
      }

      const teamOwnerId = req.user.id;

      // Check if already invited/active
      const existing = paymentsRepo.findTeamMemberByOwnerAndEmail(teamOwnerId, email);
      if (existing) {
        return res.status(409).json({ success: false, error: 'User already invited or is a team member' });
      }

      // Check if user exists in system
      const invitedUser = usersRepo.findByEmail?.(email);
      const invitedUserId = invitedUser?.id || null;

      // Create invite
      const inviteToken = generateInviteToken();
      const member = paymentsRepo.addTeamMember({
        teamOwnerId,
        userId: invitedUserId,
        email,
        role,
        status: 'pending',
      });

      // Send invite email if mailer available
      if (mailer && mailer.sendInvite) {
        try {
          const acceptUrl = `${process.env.WEB_APP_URL || 'https://adforge.aitradepulse.com'}/team/accept?token=${inviteToken}`;
          await mailer.sendInvite(email, {
            inviterName: req.user.username || req.user.email,
            role,
            acceptUrl,
            token: inviteToken,
          });
          log.info('Team invite email sent', { email, teamOwnerId });
        } catch (err) {
          log.warn('Failed to send invite email', { error: err.message, email });
        }
      }

      // Store invite token for acceptance (could use a separate table or embed in member record)
      // For simplicity, we'll use the member ID as reference and email token separately
      res.status(201).json({
        success: true,
        data: {
          ...member,
          inviteToken, // Only returned once for email construction
        },
      });
    } catch (err) {
      log.error('Failed to invite team member', { error: err.message, userId: req.user.id });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/team/accept — accept team invitation (public, no auth)
  router.post('/accept', async (req, res) => {
    try {
      const { email } = req.body;
      // In a real implementation, validate token against stored invite
      // For now, accept by email + find pending invite
      if (!email) {
        return res.status(400).json({ success: false, error: 'Email required' });
      }

      // Find pending invite for this email
      // This is simplified - in production, use the token to find the invite
      const user = usersRepo.findByEmail?.(email);
      if (!user) {
        return res.status(404).json({ success: false, error: 'No pending invite for this email. Create an account first.' });
      }

      // Find pending membership for this user
      const memberships = paymentsRepo.findTeamMembershipByUserId(user.id);
      const pending = memberships.find(m => m.status === 'pending' && m.email === email);
      if (!pending) {
        return res.status(404).json({ success: false, error: 'No pending invite found' });
      }

      const accepted = paymentsRepo.acceptTeamInvite(pending.id, user.id);
      res.json({ success: true, data: accepted });
    } catch (err) {
      log.error('Failed to accept invite', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // PATCH /api/team/:id — update member role
  router.patch('/:id', async (req, res) => {
    try {
      const { role } = req.body;
      if (!ROLES.includes(role)) {
        return res.status(400).json({ success: false, error: `Invalid role. Must be one of: ${ROLES.join(', ')}` });
      }
      if (role === 'owner') {
        return res.status(400).json({ success: false, error: 'Cannot change role to owner' });
      }

      const member = paymentsRepo.updateTeamMemberRole(req.params.id, req.user.id, role);
      if (!member) {
        return res.status(404).json({ success: false, error: 'Team member not found' });
      }
      res.json({ success: true, data: member });
    } catch (err) {
      log.error('Failed to update member role', { error: err.message, userId: req.user.id });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // DELETE /api/team/:id — revoke team member
  router.delete('/:id', async (req, res) => {
    try {
      const member = paymentsRepo.revokeTeamMember(req.params.id, req.user.id);
      if (!member) {
        return res.status(404).json({ success: false, error: 'Team member not found' });
      }
      res.json({ success: true, message: 'Team member revoked' });
    } catch (err) {
      log.error('Failed to revoke team member', { error: err.message, userId: req.user.id });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}