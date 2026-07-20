const express = require('express');
const { requireAdminAuth, attachAdminLocals } = require('../middleware/adminAuth');
const { revokeRefreshToken } = require('../controller/auth/auth.service');
const { renderAdminDashboard, getDashboardApi } = require('../controller/admin/dashboard.controller');
const { listUsers, renderNewUser, createUser, renderEditUser, updateUser, deleteUser } = require('../controller/admin/user.controller');
const { listStudents } = require('../controller/admin/student.controller');
const { listClassrooms, showClassroom } = require('../controller/admin/classroom.controller');
const { listExams, showExam } = require('../controller/admin/exam.controller');
const { listAssignments, showAssignment } = require('../controller/admin/assignment.controller');
const { listDiscussions, showDiscussion } = require('../controller/admin/discussion.controller');
const { listNotifications } = require('../controller/admin/notification.controller');
const { renderSettings, updateSettingsHandler } = require('../controller/admin/setting.controller');
const { buildImageUpload } = require('../middleware/imageUpload');
const {
  renderTeacherApprovals,
  approveTeacherHandler,
  rejectTeacherHandler,
} = require('../controller/admin/teacherApproval.controller');
const { listAuditLogs } = require('../controller/admin/audit.controller');
const { teacherIdRules } = require('../validate/admin/teacherApproval.validate');

const router = express.Router();

// Admin login routes (no auth required)
router.get('/login', (req, res) => {
  if (req.user && req.user.role === 'admin') {
    return res.redirect('/admin');
  }
  res.render('admin/auth/login', {
    title: 'Admin Login',
    formData: {},
    errorMessage: null,
    siteName: 'Admin Panel'
  });
});

router.post('/login', (req, res, next) => {
  const passport = require('passport');

  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      return res.status(422).render('admin/auth/login', {
        title: 'Admin Login',
        formData: req.body,
        errorMessage: info ? info.message : 'Invalid credentials.',
        siteName: 'Admin Panel'
      });
    }
    if (user.role !== 'admin') {
      return res.status(403).render('admin/auth/login', {
        title: 'Admin Login',
        formData: req.body,
        errorMessage: 'This login is for administrators only.',
        siteName: 'Admin Panel'
      });
    }
    if (user.status !== 'active') {
      return res.status(403).render('admin/auth/login', {
        title: 'Admin Login',
        formData: req.body,
        errorMessage: 'Your account is not active.',
        siteName: 'Admin Panel'
      });
    }

    req.session.regenerate((sessionErr) => {
      if (sessionErr) return next(sessionErr);
      req.logIn(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        req.session.role = user.role;
        req.session.save((saveErr) => {
          if (saveErr) return next(saveErr);
          return res.redirect('/admin');
        });
      });
    });
  })(req, res, next);
});

// All routes below require admin auth
router.use(requireAdminAuth, attachAdminLocals);

router.get('/', (req, res) => res.redirect('/admin/dashboard'));

router.get('/dashboard', renderAdminDashboard);
router.get('/api/dashboard', getDashboardApi);

// Admin logout
router.post('/logout', async (req, res, next) => {
  try {
    if (req.user?.id) {
      await revokeRefreshToken(req.user.id);
    }
    req.session.destroy((error) => {
      if (error) return next(error);
      res.clearCookie('accessToken');
      res.clearCookie('refreshToken');
      return res.redirect('/admin/login');
    });
  } catch (error) {
    return next(error);
  }
});

// User management
router.get('/users', listUsers);
router.get('/users/new', renderNewUser);
router.post('/users', createUser);
router.get('/users/:userId', renderEditUser);
router.get('/users/:userId/edit', renderEditUser);
router.post('/users/:userId', updateUser);
router.post('/users/:userId/delete', deleteUser);

// Student management
router.get('/students', listStudents);

// Teacher management
router.get('/teachers', (req, res, next) => {
  const User = require('../models/User');
  User.find({ role: 'teacher' }).sort({ createdAt: -1 }).then(allTeachers => {
    const pendingTeachers = allTeachers.filter(t => t.status === 'pending');
    const tab = req.query.tab || (pendingTeachers.length > 0 ? 'pending' : 'all');
    res.render('admin/teachers/index', {
      title: 'Teachers',
      tab,
      pendingTeachers,
      allTeachers,
      pendingCount: pendingTeachers.length
    });
  }).catch(next);
});
router.get('/teachers/pending', renderTeacherApprovals);
router.post('/teachers/:teacherId/approve', teacherIdRules, approveTeacherHandler);
router.post('/teachers/:teacherId/reject', teacherIdRules, rejectTeacherHandler);

// Classroom management
router.get('/classrooms', listClassrooms);
router.get('/classrooms/:classroomId', showClassroom);

// Category management
const { listCategories, renderNewCategory, createCategory, renderEditCategory, updateCategory, deleteCategory } = require('../controller/admin/category.controller');
router.get('/categories', listCategories);
router.get('/categories/new', renderNewCategory);
router.post('/categories', createCategory);
router.get('/categories/:categoryId/edit', renderEditCategory);
router.post('/categories/:categoryId/edit', updateCategory);
router.post('/categories/:categoryId/delete', deleteCategory);

// Exam management
router.get('/exams', listExams);
router.get('/exams/:examId', showExam);

// Assignment management
router.get('/assignments', listAssignments);
router.get('/assignments/:assignmentId', showAssignment);

// Discussion management
router.get('/discussions', listDiscussions);
router.get('/discussions/:topicId', showDiscussion);

// Notifications
router.get('/notifications', listNotifications);

// Settings
router.get('/settings', renderSettings);
// Logo & favicon are now uploaded image files (Cloudinary), not manual URLs.
router.post('/settings', buildImageUpload(['logo', 'favicon']), updateSettingsHandler);

// Audit Logs
router.get('/audit', listAuditLogs);

module.exports = router;
