const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (!SMTP_HOST || !SMTP_PORT) {
    console.warn(
      'Email not configured (SMTP_HOST / SMTP_PORT missing). Task assignment emails will be skipped.'
    );
    return null;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined
  });

  return transporter;
}

function sendTaskAssignedEmail(toEmail, taskTitle, deadline, taskId) {
  const transport = getTransporter();
  if (!transport || !toEmail) return;

  const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
  const taskLink = `${baseUrl}/user/tasks/${taskId}`;

  const subject = `Yeni Görev Atandı: ${taskTitle}`;
  const lines = [
    `Size yeni bir görev atandı: ${taskTitle}`,
    '',
    deadline ? `Teslim tarihi: ${deadline}` : '',
    `Görevi görüntülemek için: ${taskLink}`,
    '',
    'Bu sistemden otomatik gönderilmiştir.'
  ].filter(Boolean);

  const text = lines.join('\n');

  transport.sendMail(
    {
      from: process.env.MAIL_FROM || 'no-reply@aj-group.local',
      to: toEmail,
      subject,
      text
    },
    (err) => {
      if (err) {
        console.error('Error sending assignment email', err);
      } else {
        console.log(`Task assignment email sent to: ${toEmail}`);
      }
    }
  );
}

function sendNotificationEmail(toEmail, message, taskId = null) {
  const transport = getTransporter();
  if (!transport) {
    console.warn('Email transporter not available. Check SMTP configuration in .env file.');
    return;
  }
  
  if (!toEmail) {
    console.warn('No email address provided for notification');
    return;
  }

  const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
  const taskLink = taskId ? `${baseUrl}/user/tasks/${taskId}` : null;

  const subject = `Yeni Bildirim: Task Manager`;
  const lines = [
    message,
    '',
    taskLink ? `Detaylar için: ${taskLink}` : '',
    '',
    'Bu sistemden otomatik gönderilmiştir.'
  ].filter(Boolean);

  const text = lines.join('\n');

  console.log(`Attempting to send notification email to: ${toEmail}`);

  transport.sendMail(
    {
      from: process.env.MAIL_FROM || 'no-reply@aj-group.local',
      to: toEmail,
      subject,
      text
    },
    (err, info) => {
      if (err) {
        console.error('Error sending notification email:', err);
        console.error('Error details:', {
          code: err.code,
          command: err.command,
          response: err.response
        });
      } else {
        console.log(`✅ Notification email sent successfully to: ${toEmail}`);
        console.log('Email info:', info.messageId);
      }
    }
  );
}

module.exports = {
  sendTaskAssignedEmail,
  sendNotificationEmail
};



