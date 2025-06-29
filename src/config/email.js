import { createTransport } from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Email configuration
export const emailConfig = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
};

// Create transporter
export const transporter = createTransport(emailConfig);

// Email templates
export const emailTemplates = {
  verification: (username, verificationLink) => ({
    subject: 'Verify Your Evently Account',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Your Account</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
          .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 20px; border-radius: 10px; box-shadow: 0 0 20px rgba(0,0,0,0.1); }
          .header { text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; margin: -20px -20px 30px -20px; }
          .logo { font-size: 32px; font-weight: bold; margin-bottom: 10px; }
          .button { display: inline-block; padding: 15px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; transition: transform 0.2s; }
          .button:hover { transform: translateY(-2px); }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 14px; }
          .warning { background-color: #fff3cd; border: 1px solid #ffeaa7; color: #856404; padding: 15px; border-radius: 8px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">🎉 Evently</div>
            <p>Welcome to the future of event management</p>
          </div>
          
          <h2>Welcome, ${username}!</h2>
          <p>Thank you for joining Evently. To complete your registration and start creating amazing events, please verify your email address by clicking the button below:</p>
          
          <div style="text-align: center;">
            <a href="${verificationLink}" class="button">Verify My Account</a>
          </div>
          
          <div class="warning">
            <strong>⚠️ Security Notice:</strong> This verification link will expire in 24 hours for your security. If you didn't create an account with Evently, please ignore this email.
          </div>
          
          <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
          <p style="word-break: break-all; background-color: #f8f9fa; padding: 10px; border-radius: 4px; font-family: monospace;">${verificationLink}</p>
          
          <div class="footer">
            <p>© 2024 Evently. All rights reserved.</p>
            <p>Need help? Contact us at support@evently.com</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      Welcome to Evently, ${username}!
      
      Please verify your email address by visiting: ${verificationLink}
      
      This link will expire in 24 hours.
      
      If you didn't create an account with Evently, please ignore this email.
    `
  })
};

// Send email function
export const sendEmail = async (to, template) => {
  try {
    const info = await transporter.sendMail({
      from: `"Evently" <${process.env.SMTP_USER}>`,
      to,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });

    console.log('Email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Email send error:', error);
    throw new Error('Failed to send email');
  }
};