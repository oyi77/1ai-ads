import crypto from 'crypto';
import { createRequire } from 'module';
import { createLogger } from './logger.js';
import config from '../config/index.js';

const require = createRequire(import.meta.url);
const log = createLogger('mailer');

let smtpTransport = null;
const hasSmtpEnv = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
function getSmtpTransport() {
  if (!hasSmtpEnv()) return null;
  if (!smtpTransport) {
    // Lazy require: keeps nodemailer off the boot path until a real send happens.
    const nodemailer = require('nodemailer');
    smtpTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: parseInt(process.env.SMTP_PORT || '587', 10) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return smtpTransport;
}

export const mailerEnabled = () => Boolean(config.resendApiKey || hasSmtpEnv());

async function send(to, subject, html) {
  try {
    if (config.resendApiKey) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: config.mailFrom, to: [to], subject, html }),
      });
      if (!res.ok) {
        const body = await res.text();
        log.error('Resend send failed', { to, status: res.status, body: body.slice(0, 200) });
        return false;
      }
      log.info('Email sent via Resend', { to, subject });
      return true;
    }

    const transport = getSmtpTransport();
    if (transport) {
      await transport.sendMail({ from: config.mailFrom, to, subject, html });
      log.info('Email sent via SMTP', { to, subject });
      return true;
    }

    log.warn('No mail provider configured — email suppressed', { to, subject });
    return false;
  } catch (err) {
    log.error('Email send error', { to, error: err.message });
    return false;
  }
}

const layout = (title, bodyHtml) => `
<div style="font-family:Arial,Helvetica,sans-serif;background:#0b0d12;padding:32px">
  <div style="max-width:480px;margin:0 auto;background:#151823;border:1px solid #2a2f42;border-radius:12px;padding:32px">
    <div style="font-size:20px;font-weight:700;color:#fff;margin-bottom:4px">Ad<span style="color:#818cf8">Forge</span></div>
    <h2 style="color:#fff;font-size:16px;margin:16px 0">${title}</h2>
    ${bodyHtml}
    <p style="color:#6b7280;font-size:11px;margin-top:28px">If you didn't request this, you can safely ignore this email.</p>
  </div>
</div>`;

const button = (url, label) =>
  `<a href="${url}" style="display:inline-block;background:#6366f1;color:#0b0d12;font-weight:700;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px">${label}</a>`;

export function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function sendVerificationEmail(email, username, token) {
  const url = `${config.publicBaseUrl}/verify-email?token=${token}`;
  return send(
    email,
    'Verify your AdForge account',
    layout('Confirm your email', `
      <p style="color:#9ca3af;font-size:13px;line-height:1.6">Hi ${username}, welcome to AdForge! Confirm your email address to activate your account.</p>
      <p style="margin:20px 0">${button(url, 'Verify Email')}</p>
      <p style="color:#6b7280;font-size:11px;word-break:break-all">Or paste this link: ${url}</p>`)
  );
}

export async function sendPasswordResetEmail(email, username, token) {
  const url = `${config.publicBaseUrl}/reset-password?token=${token}`;
  return send(
    email,
    'Reset your AdForge password',
    layout('Password reset', `
      <p style="color:#9ca3af;font-size:13px;line-height:1.6">Hi ${username}, we received a request to reset your password. This link expires in 1 hour.</p>
      <p style="margin:20px 0">${button(url, 'Reset Password')}</p>
      <p style="color:#6b7280;font-size:11px;word-break:break-all">Or paste this link: ${url}</p>`)
  );
}
