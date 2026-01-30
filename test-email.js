require('dotenv').config();
const nodemailer = require('nodemailer');

const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

transport.sendMail({
  from: process.env.SMTP_USER,
  to: process.env.SMTP_USER,
  subject: 'Caesar Test Email',
  text: 'Testing SMTP from Caesar\'s Legions backend.\n\nIf you receive this, email sending is operational. 🏛️'
})
.then(info => {
  console.log('✅ Email sent successfully:', info.messageId);
  console.log('📧 Check', process.env.SMTP_USER);
})
.catch(err => {
  console.error('❌ Error sending email:', err.message);
});
