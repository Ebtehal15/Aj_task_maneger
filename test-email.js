// Email Test Script
// Bu script ile email yapılandırmanızı test edebilirsiniz

require('dotenv').config();
const { sendNotificationEmail } = require('./backend/services/email');

// Test email adresinizi buraya yazın
const testEmail = process.env.TEST_EMAIL || 'your-test-email@gmail.com';

console.log('Testing email configuration...');
console.log('SMTP_HOST:', process.env.SMTP_HOST || 'NOT SET');
console.log('SMTP_PORT:', process.env.SMTP_PORT || 'NOT SET');
console.log('SMTP_USER:', process.env.SMTP_USER || 'NOT SET');
console.log('SMTP_PASS:', process.env.SMTP_PASS ? '***SET***' : 'NOT SET');
console.log('MAIL_FROM:', process.env.MAIL_FROM || 'NOT SET');
console.log('');
console.log(`Sending test email to: ${testEmail}`);
console.log('');

sendNotificationEmail(
  testEmail,
  'Bu bir test bildirimidir. Email yapılandırmanız çalışıyorsa bu mesajı görmelisiniz.',
  null
);

// Script'in hemen kapanmaması için
setTimeout(() => {
  console.log('\nTest completed. Check your email inbox (and spam folder).');
  process.exit(0);
}, 5000);

