/**
 * email.service.js — Nodemailer-based email notifications
 *
 * Config via environment variables:
 *   SMTP_HOST     — e.g. smtp.gmail.com or smtp.sendgrid.net
 *   SMTP_PORT     — 587 (TLS) or 465 (SSL), default 587
 *   SMTP_SECURE   — 'true' for port 465, omit for STARTTLS
 *   SMTP_USER     — SMTP username / email address
 *   SMTP_PASS     — SMTP password or app-specific password
 *   ALERT_EMAIL_TO — comma-separated list of admin email addresses
 *   EMAIL_FROM    — sender address, defaults to SMTP_USER
 *
 * If SMTP_HOST is not configured, email is silently skipped (no crash).
 * This allows the system to run without email in dev/test environments.
 */

const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  if (!host) return null; // email not configured — skip silently

  transporter = nodemailer.createTransport({
    host,
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    // Timeout settings — don't hang the cron job
    connectionTimeout: 10000,
    greetingTimeout:   5000,
    socketTimeout:     10000,
  });

  return transporter;
}

/**
 * Send an email. Silently skips if SMTP is not configured.
 *
 * @param {object} opts
 * @param {string}   opts.subject
 * @param {string}   opts.text     — plain text body
 * @param {string}   [opts.html]   — optional HTML body
 * @param {string}   [opts.to]     — override recipient (defaults to ALERT_EMAIL_TO)
 */
async function sendEmail({ subject, text, html, to }) {
  const t = getTransporter();
  if (!t) return; // SMTP not configured

  const recipients = to || process.env.ALERT_EMAIL_TO;
  if (!recipients) {
    console.warn('[email] ALERT_EMAIL_TO not set — skipping email');
    return;
  }

  try {
    const info = await t.sendMail({
      from:    process.env.EMAIL_FROM || process.env.SMTP_USER,
      to:      recipients,
      subject,
      text,
      html:    html || text,
    });
    console.log(`[email] ✅ Sent: "${subject}" → ${recipients} (${info.messageId})`);
  } catch (err) {
    // Log but never throw — email failure must not crash the cron job
    console.error(`[email] ❌ Failed to send "${subject}":`, err.message);
  }
}

/**
 * Send a digest email summarising all new alerts created in a cron run.
 *
 * @param {Array<{type: string, message: string, severity: string}>} alerts
 */
async function sendAlertDigest(alerts) {
  if (!alerts.length) return;

  const high   = alerts.filter(a => a.severity === 'high');
  const medium = alerts.filter(a => a.severity === 'medium');
  const low    = alerts.filter(a => a.severity === 'low');

  const subject = `[ISOMAC] ${alerts.length} new alert${alerts.length > 1 ? 's' : ''} — ${high.length} high priority`;

  const text = [
    `ISOMAC Alert Digest — ${new Date().toLocaleDateString('en-IN', { dateStyle: 'full' })}`,
    `Total: ${alerts.length} new alert(s)`,
    '',
    high.length   ? `🔴 HIGH (${high.length}):\n${high.map(a => `  • ${a.message}`).join('\n')}` : '',
    medium.length ? `🟡 MEDIUM (${medium.length}):\n${medium.map(a => `  • ${a.message}`).join('\n')}` : '',
    low.length    ? `🟢 LOW (${low.length}):\n${low.map(a => `  • ${a.message}`).join('\n')}` : '',
    '',
    'Log in to ISOMAC to view and manage these alerts.',
  ].filter(Boolean).join('\n');

  const html = `
    <h2 style="color:#1e293b">ISOMAC Alert Digest</h2>
    <p style="color:#64748b">${new Date().toLocaleDateString('en-IN', { dateStyle: 'full' })}</p>
    <p><strong>${alerts.length}</strong> new alert(s) generated</p>
    ${high.length ? `
      <h3 style="color:#dc2626">🔴 High Priority (${high.length})</h3>
      <ul>${high.map(a => `<li>${a.message}</li>`).join('')}</ul>` : ''}
    ${medium.length ? `
      <h3 style="color:#d97706">🟡 Medium Priority (${medium.length})</h3>
      <ul>${medium.map(a => `<li>${a.message}</li>`).join('')}</ul>` : ''}
    ${low.length ? `
      <h3 style="color:#16a34a">🟢 Low Priority (${low.length})</h3>
      <ul>${low.map(a => `<li>${a.message}</li>`).join('')}</ul>` : ''}
    <hr/>
    <p style="color:#94a3b8;font-size:12px">Log in to ISOMAC to view and manage these alerts.</p>
  `;

  await sendEmail({ subject, text, html });
}

module.exports = { sendEmail, sendAlertDigest };
