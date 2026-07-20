const express = require('express');
const { requireAuth } = require('../middleware/rbac');
const { buildImageUpload } = require('../middleware/imageUpload');
const {
  renderProfile,
  renderEditProfile,
  updateProfileHandler,
  renderPasswordForm,
  changePasswordHandler,
} = require('../controller/profile/profile.controller');
const { updateProfileRules, changePasswordRules } = require('../validate/profile.validate');

const router = express.Router();

router.use(requireAuth);
router.get('/', renderProfile);
router.get('/edit', renderEditProfile);
// Avatar is now an uploaded image file (Cloudinary), not a manual URL.
router.post('/edit', buildImageUpload(['avatar']), updateProfileRules, updateProfileHandler);
router.get('/password', renderPasswordForm);
router.post('/password', changePasswordRules, changePasswordHandler);

module.exports = router;
