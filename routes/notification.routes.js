const express = require('express');
const { requireAuth } = require('../middleware/rbac');
const notificationController = require('../controller/notification.controller');

const router = express.Router();

router.use(requireAuth);

router.get('/', notificationController.renderIndex);
router.post('/read-all', notificationController.markAllAsRead);
router.post('/:id/read', notificationController.markAsRead);

module.exports = router;
