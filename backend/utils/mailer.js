const nodemailer = require('nodemailer');

/**
 * Sends an email using Brevo HTTP API (preferred on Vercel to avoid SMTP blocks)
 * @param {string} toEmail - The recipient's email address
 * @param {string} subject - The subject of the email
 * @param {string} htmlContent - The HTML content of the email
 * @param {string} toName - Optional recipient name
 * @returns {boolean} - true if successful, false otherwise
 */
async function sendEmail(toEmail, subject, htmlContent, toName = '') {
  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  const SENDER_EMAIL = process.env.EMAIL_USER || 'admin@collegebus.com';

  if (!BREVO_API_KEY) {
    console.error('❌ BREVO_API_KEY is not set in environment variables');
    return false;
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': BREVO_API_KEY
      },
      body: JSON.stringify({
        sender: {
          name: "College Bus Admin",
          email: SENDER_EMAIL
        },
        to: [{
          email: toEmail,
          name: toName || toEmail
        }],
        subject: subject,
        htmlContent: htmlContent
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ Brevo API Error:', JSON.stringify(errorData));
      return false;
    }

    console.log(`✅ Email sent successfully to ${toEmail}`);
    return true;
  } catch (error) {
    console.error('❌ Email sending error:', error.message);
    return false;
  }
}

module.exports = { sendEmail };
