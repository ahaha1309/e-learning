const express = require('express');
const {
  renderHome,
} = require('../controller/common/home.controller');

const router = express.Router();

router.get('/', renderHome);

// Legal pages
router.get('/legal/privacy', (req, res) => {
  res.render('legal/privacy', { title: 'Privacy Policy' });
});

router.get('/legal/terms', (req, res) => {
  res.render('legal/terms', { title: 'Terms of Service' });
});

router.get('/legal/contact', (req, res) => {
  res.render('legal/contact', { title: 'Contact Us' });
});

module.exports = router;
