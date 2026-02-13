const express = require('express');
const { getAllForUser, markAllReadForUser } = require('../services/notifications');

const router = express.Router();

// List all notifications for current user and mark all as read (bildirimler kaybolmaz, sadece okundu işareti gider)
router.get('/', async (req, res) => {
  if (!req.user) {
    return res.redirect('/login');
  }

  try {
    // Tüm bildirimleri getir (okunmuş ve okunmamış)
    const notifications = await getAllForUser(req.user.id);
    
    // Sadece okunmamış bildirimleri okundu olarak işaretle (bildirimler kaybolmaz)
    await markAllReadForUser(req.user.id);
    
    res.render('common/notifications', {
      pageTitle: 'Notifications',
      notifications
    });
  } catch (err) {
    console.error('Error loading notifications', err);
    res.sendStatus(500);
  }
});

module.exports = router;
