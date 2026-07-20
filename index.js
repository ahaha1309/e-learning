const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const xssClean = require('xss-clean');
const rateLimit = require('express-rate-limit');
const MongoStore = require('connect-mongo');
const passport = require('passport');
require('dotenv').config();

const { connectDatabase } = require('./config/db');
const configurePassport = require('./config/passport');
const { attachCurrentUser } = require('./middleware/currentUser');
const { csrfProtection } = require('./middleware/csrf');
const AppError = require('./utils/AppError');

// ── Dedicated Auth Rate Limiter (stricter) ────────────────
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again after 15 minutes.' },
  skipSuccessfulRequests: false,
});

// ── Login / Register extra strict limiter ─────────────────
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait 15 minutes.' },
  skipSuccessfulRequests: true,
});

const authRoutes = require('./routes/auth.routes');
const profileRoutes = require('./routes/profile.routes');
const indexRoutes = require('./routes/index.routes');
const adminRoutes = require('./routes/admin.routes');
const teacherLectureRoutes = require('./routes/teacher.lecture.routes');
const teacherAssignmentRoutes = require('./routes/teacher.assignment.routes');
const teacherSubmissionRoutes = require('./routes/teacher.submission.routes');
const studentLectureRoutes = require('./routes/student.lecture.routes');
const studentAssignmentRoutes = require('./routes/student.assignment.routes');
const studentSubmissionRoutes = require('./routes/student.submission.routes');
const teacherRoutes = require('./routes/teacher.routes');
const studentRoutes = require('./routes/student.routes');
const notificationRoutes = require('./routes/notification.routes');

const app = express();

configurePassport(passport);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(compression());

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());
app.use(mongoSanitize());
app.use(xssClean());
app.use(express.static(path.join(__dirname, 'public')));

const sessionStore = process.env.MONGO_URL
  ? MongoStore.create({
      mongoUrl: process.env.MONGO_URL,
      collectionName: 'sessions',
      ttl: 60 * 60 * 24 * 7,
    })
  : undefined;

app.use(
  session({
    name: process.env.SESSION_NAME || 'elearning.sid',
    secret: process.env.SESSION_SECRET || 'change-this-session-secret',
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

// CSRF protection — skip multipart POST (body not parsed by urlencoded yet)
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/auth/refresh')) {
    return next();
  }
  if (req.method === 'POST' && req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
    return next();
  }
  csrfProtection(req, res, next);
});

app.use((req, res, next) => {
  if (req.csrfToken) {
    res.locals.csrfToken = req.csrfToken();
  }
  next();
});

app.use(attachCurrentUser);

// Flash messages via session
app.use((req, res, next) => {
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  res.flash = (type, message) => { req.session.flash = { type, message }; };
  next();
});

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// ── Client Routes ─────────────────────────────────────────
app.use('/auth/login', loginRateLimit);
app.use('/auth/register', loginRateLimit);
app.use('/auth', authRateLimit, authRoutes);
app.use('/profile', profileRoutes);
app.use('/', indexRoutes);
app.use('/teacher/classrooms/:classroomId/lectures', teacherLectureRoutes);
app.use('/teacher/classrooms/:classroomId/assignments', teacherAssignmentRoutes);
app.use('/teacher/classrooms/:classroomId/assignments/:assignmentId/submissions', teacherSubmissionRoutes);
app.use('/student/classrooms/:classroomId/lectures', studentLectureRoutes);
app.use('/student/classrooms/:classroomId/assignments', studentAssignmentRoutes);
app.use('/student/classrooms/:classroomId/assignments/:assignmentId/submission', studentSubmissionRoutes);
app.use('/teacher', teacherRoutes);
app.use('/student', studentRoutes);
app.use('/notifications', notificationRoutes);

// ── Admin Routes ──────────────────────────────────────────
app.use('/admin', adminRoutes);

// ── API Health ────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ── 404 Handler ───────────────────────────────────────────
app.use((req, res, next) => {
  next(new AppError(`Page not found: ${req.originalUrl}`, 404));
});

// ── Global Error Handler ──────────────────────────────────
app.use((err, req, res, next) => {
  require('fs').appendFileSync('server_err.txt', err.stack + '\n');
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.statusCode || 500;
  const isAdminPath = req.originalUrl.startsWith('/admin');

  // API routes get JSON errors
  if (req.path.startsWith('/api/')) {
    return res.status(statusCode).json({
      error: {
        message: statusCode === 500 ? 'An unexpected error occurred.' : err.message,
        status: statusCode,
      },
    });
  }

  // Admin gets admin error pages
  if (isAdminPath) {
    const view = statusCode === 404 ? 'admin/errors/notFound' : 'admin/errors/serverError';
    return res.status(statusCode).render(view, {
      title: statusCode === 404 ? 'Not found' : 'Error',
      path: req.originalUrl,
      statusCode,
    });
  }

  // Regular pages
  const errorViews = {
    403: 'errors/403',
    404: 'errors/404',
  };

  const view = errorViews[statusCode] || 'errors/error';
  return res.status(statusCode).render(view, {
    title: statusCode === 404 ? 'Page not found' : statusCode === 403 ? 'Access denied' : 'Application error',
    message: statusCode === 500 ? 'An unexpected error occurred.' : err.message,
    path: req.originalUrl,
    statusCode,
  });
});

async function startServer() {
  await connectDatabase();

  // Seed default categories and auto-assign to unassigned classrooms (idempotent)
  const { seedCategories } = require('./seeds/categories.seed');
  await seedCategories();

  const port = Number(process.env.PORT || 3000);
  const server = http.createServer(app);
  const allowedOrigin = process.env.ALLOWED_ORIGIN || (process.env.NODE_ENV === 'production' ? false : '*');
  const io = new Server(server, {
    cors: {
      origin: allowedOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Exam monitoring namespace
  // NOTE (audit H3): this namespace has no authenticated socket middleware yet;
  // join-exam/teacher-join accept any connection and any examId, and sender
  // identity is not verified. Full socket auth is tracked separately. The
  // violation persistence below is intentionally defensive about payload shape
  // and caps the per-submission stored array, but does NOT yet close the auth
  // gap — that is the audit's Phase-1 H3 work.
  const examMonitor = io.of('/exam-monitor');
  examMonitor.on('connection', (socket) => {
    socket.on('join-exam', (data) => {
      if (data && data.examId) socket.join(data.examId);
    });
    socket.on('teacher-join', (data) => {
      if (data && data.examId) socket.join(data.examId);
    });
    // Student anti-cheat signals. Persisted SERVER-side so the record can't be
    // forged or dropped by the client the way req.body.violationsJson could be.
    // The HTTP submit path no longer writes violations — this is the only path.
    socket.on('cheat-violation', async (data) => {
      if (!data || !data.examId || !data.studentId || !data.type) return;
      try {
        const ExamSubmission = require('./models/ExamSubmission');
        const submission = await ExamSubmission.findOne({
          exam: data.examId,
          student: data.studentId,
          status: 'in_progress',
        });
        if (!submission) return;
        // Cap the embedded array; the rest are counted, not stored verbatim,
        // to avoid unbounded growth flagged in the audit (ExamSubmission.violations).
        if (submission.violations.length < 200) {
          submission.violations.push({
            type: data.type,
            time: new Date(),
            details: data.details ? String(data.details).slice(0, 500) : '',
          });
          await submission.save();
        }
      } catch (err) {
        console.error('Exam violation persist error', err);
      }
      examMonitor.to(data.examId).emit('student-violation', data);
    });
  });

  // Chat namespace
  const chatMonitor = io.of('/chat');
  chatMonitor.on('connection', (socket) => {
    socket.on('join_chat', (data) => { socket.join(data.classroomId); });
    socket.on('send_message', async (data) => {
      try {
        const ChatMessage = require('./models/ChatMessage');
        const newMessage = await ChatMessage.create({
          classroom: data.classroomId,
          sender: data.senderId,
          content: data.content,
        });
        const populatedMessage = await newMessage.populate('sender', 'name avatarUrl');
        chatMonitor.to(data.classroomId).emit('receive_message', {
          id: populatedMessage._id,
          content: populatedMessage.content,
          sender: populatedMessage.sender,
          createdAt: populatedMessage.createdAt,
        });
      } catch (err) {
        console.error('Chat error', err);
      }
    });
  });

  server.listen(port, () => {
    console.log(`E-Learning LMS listening on port ${port}`);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

module.exports = app;
// Trigger restart
