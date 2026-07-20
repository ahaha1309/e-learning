const express = require('express');
const {
  renderHome,
  renderCatalog,
  renderCategory,
  renderCourseDetail,
} = require('../controller/common/home.controller');

const router = express.Router();

router.get('/', renderHome);
router.get('/catalog', renderCatalog);
router.get('/search', renderCatalog);
router.get('/category/:category', renderCategory);
router.get('/catalog/:slug', renderCourseDetail);

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
