const nodemailer = require('nodemailer');

function smtpConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || 'false') === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) return null;

  return {
    host,
    port,
    secure,
    auth: { user, pass }
  };
}

async function sendOtpEmail({ to, otp }) {
  const cfg = smtpConfig();
  if (!cfg) return;

  const from = process.env.FROM_EMAIL || 'no-reply@assuredgig.local';
  const transport = nodemailer.createTransport(cfg);

  await transport.sendMail({
    from,
    to,
    subject: 'AssuredGig password reset OTP',
    text: `Your OTP is ${otp}. It will expire soon.`
  });
}

module.exports = { sendOtpEmail };

