const { Resend } = require('resend');

async function sendOtpEmail({ to, otp }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const from = process.env.FROM_EMAIL || 'onboarding@resend.dev';
  const resend = new Resend(apiKey);

  await resend.emails.send({
    from,
    to,
    subject: 'AssuredGig password reset OTP',
    html: `<p>Your OTP is <strong>${otp}</strong>. It will expire soon.</p>`
  });
}

module.exports = { sendOtpEmail };
