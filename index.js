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
const meetingRoutes = require('./routes/meeting.routes');
const chatRoutes = require('./routes/chat.routes');

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
app.use('/', meetingRoutes);
app.use('/', chatRoutes);

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
  // In dev, wildcard '*' cannot be used together with credentials:true (browser blocks it).
  // Use an explicit list of localhost origins instead.
  const defaultLocalOrigins = [
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
  ];
  const allowedOrigin = process.env.ALLOWED_ORIGIN
    ? process.env.ALLOWED_ORIGIN.split(',')
    : (process.env.NODE_ENV === 'production' ? false : defaultLocalOrigins);
  const io = new Server(server, {
    cors: {
      origin: allowedOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Allow polling fallback so localhost works even if WebSocket upgrade is slow
    transports: ['websocket', 'polling'],
  });

  function parseCookie(cookieString, name) {
    if (!cookieString) return null;
    const match = cookieString.match(new RegExp('(^|;\\s*)' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[2]) : null;
  }

  // Common authentication middleware for Socket.IO namespaces
  const socketAuthMiddleware = (socket, next) => {
    try {
      let token = null;
      const cookieHeader = socket.handshake.headers.cookie;
      if (cookieHeader) {
        token = parseCookie(cookieHeader, 'accessToken');
      }
      if (!token && socket.handshake.auth && socket.handshake.auth.token) {
        token = socket.handshake.auth.token;
      }
      if (!token && socket.handshake.headers.authorization) {
        const parts = socket.handshake.headers.authorization.split(' ');
        if (parts.length === 2 && parts[0] === 'Bearer') {
          token = parts[1];
        }
      }

      if (token) {
        const jwt = require('jsonwebtoken');
        const payload = jwt.verify(token, process.env.JWT_SECRET || 'test_secret');
        socket.userId = payload.sub;
        socket.userRole = payload.role;
        return next();
      }

      // Fallback 1: Check express session cookie (elearning.sid)
      if (cookieHeader) {
        const rawSid = parseCookie(cookieHeader, process.env.SESSION_NAME || 'elearning.sid');
        if (rawSid) {
          const sid = rawSid.startsWith('s:') ? rawSid.slice(2).split('.')[0] : rawSid;
          sessionStore.get(sid, (err, sess) => {
            if (!err && sess && sess.passport && sess.passport.user) {
              socket.userId = sess.passport.user;
              socket.userRole = sess.userRole || 'student';
              return next();
            }
            if (socket.handshake.auth && socket.handshake.auth.userId) {
              socket.userId = socket.handshake.auth.userId;
              return next();
            }
            return next(new Error('Authentication error: Session expired'));
          });
          return;
        }
      }

      // Fallback 2: Check handshake auth userId
      if (socket.handshake.auth && socket.handshake.auth.userId) {
        socket.userId = socket.handshake.auth.userId;
        return next();
      }

      return next(new Error('Authentication error: No token or session provided'));
    } catch (err) {
      return next(new Error('Authentication error: Invalid token'));
    }
  };

  // Exam monitoring namespace
  const examMonitor = io.of('/exam-monitor');
  examMonitor.use(socketAuthMiddleware);

  examMonitor.on('connection', (socket) => {
    socket.on('join-exam', async (data) => {
      if (!data || !data.examId) return;
      const studentId = socket.userId;
      if (!studentId) return;

      const Exam = require('./models/Exam');
      const exam = await Exam.findById(data.examId);
      if (!exam) return;

      const ClassroomMember = require('./models/ClassroomMember');
      const isMember = await ClassroomMember.findOne({
        classroom: exam.classroom,
        student: studentId,
        status: 'approved'
      });
      const isTeacher = (socket.userRole === 'teacher' || socket.userRole === 'admin') && String(exam.teacher) === studentId;

      if (isMember || isTeacher) {
        socket.join(data.examId);
      }
    });

    socket.on('teacher-join', async (data) => {
      if (!data || !data.examId) return;
      if (socket.userRole !== 'teacher' && socket.userRole !== 'admin') return;

      const Exam = require('./models/Exam');
      const exam = await Exam.findOne({ _id: data.examId, teacher: socket.userId });
      if (exam || socket.userRole === 'admin') {
        socket.join(data.examId);
      }
    });

    // Student anti-cheat signals. Persisted SERVER-side.
    socket.on('cheat-violation', async (data) => {
      if (!data || !data.examId) return;
      const studentId = socket.userId;
      if (!studentId) return;

      const vObj = data.violation || data;
      const vType    = vObj.type    || data.type;
      const vDetails = vObj.details || data.details;
      if (!vType) return;

      try {
        const ExamSubmission = require('./models/ExamSubmission');
        const submission = await ExamSubmission.findOne({
          exam: data.examId,
          student: studentId,
          status: 'in_progress',
        });
        if (!submission) return;
        // Cap the embedded array to avoid unbounded growth.
        if (submission.violations.length < 200) {
          submission.violations.push({
            type: vType,
            time: new Date(),
            details: vDetails ? String(vDetails).slice(0, 500) : '',
          });
          await submission.save();
        }

        const User = require('./models/User');
        const studentUser = await User.findById(studentId);
        const studentName = studentUser ? studentUser.name : 'Student';

        // Forward to teacher monitor room
        examMonitor.to(data.examId).emit('student-violation', {
          examId:      data.examId,
          studentId:   studentId,
          studentName: studentName,
          violation: {
            type:    vType,
            time:    vObj.time || new Date().toISOString(),
            details: vDetails || '',
          },
        });
      } catch (err) {
        console.error('Exam violation persist error', err);
      }
    });
  });

  // Chat namespace
  const chatMonitor = io.of('/chat');
  chatMonitor.use(socketAuthMiddleware);

  chatMonitor.on('connection', (socket) => {
    socket.on('join_user_dm_room', () => {
      if (socket.userId) {
        socket.join(`user:${socket.userId}`);
        socket.emit('user_authenticated', { userId: socket.userId });
      }
    });

    socket.on('send_direct_message', async (data) => {
      try {
        if (!data || !data.recipientId) return;
        const senderId = socket.userId;
        if (!senderId) return;

        const chatService = require('./services/chat.service');
        const dm = await chatService.saveDirectMessage({
          senderId,
          recipientId: data.recipientId,
          content: data.content || '',
          fileUrl: data.fileUrl || null,
          fileName: data.fileName || null,
          fileType: data.fileType || null,
          fileSize: data.fileSize || 0,
        });

        // Send to recipient personal room & sender room
        chatMonitor.to(`user:${data.recipientId}`).to(`user:${senderId}`).emit('receive_direct_message', dm);
      } catch (err) {
        console.error('Direct chat socket error:', err);
      }
    });

    socket.on('join_chat', async (data) => {
      if (!data || !data.classroomId) return;
      const senderId = socket.userId;
      const ClassroomMember = require('./models/ClassroomMember');
      const isMember = await ClassroomMember.findOne({
        classroom: data.classroomId,
        student: senderId,
        status: 'approved'
      });
      const Classroom = require('./models/Classroom');
      const isTeacher = await Classroom.findOne({
        _id: data.classroomId,
        teacher: senderId
      });
      if (isMember || isTeacher || socket.userRole === 'admin') {
        socket.join(data.classroomId);
      }
    });

    socket.on('send_message', async (data) => {
      try {
        if (!data || !data.classroomId) return;
        const senderId = socket.userId;
        if (!senderId) return;

        const content = String(data.content || '').trim().slice(0, 1000);
        if (!content && !data.fileUrl) return;

        const ClassroomMember = require('./models/ClassroomMember');
        const isMember = await ClassroomMember.findOne({
          classroom: data.classroomId,
          student: senderId,
          status: 'approved'
        });
        const Classroom = require('./models/Classroom');
        const isTeacher = await Classroom.findOne({
          _id: data.classroomId,
          teacher: senderId
        });
        if (!isMember && !isTeacher && socket.userRole !== 'admin') {
          return; // Access denied
        }

        const ChatMessage = require('./models/ChatMessage');
        const newMessage = await ChatMessage.create({
          classroom: data.classroomId,
          sender: senderId,
          content: content,
          fileUrl: data.fileUrl || null,
          fileName: data.fileName || null,
          fileType: data.fileType || null,
          fileSize: data.fileSize || 0,
        });
        const populatedMessage = await newMessage.populate('sender', 'name avatarUrl');
        chatMonitor.to(data.classroomId).emit('receive_message', {
          id: populatedMessage._id,
          content: populatedMessage.content,
          fileUrl: populatedMessage.fileUrl,
          fileName: populatedMessage.fileName,
          fileType: populatedMessage.fileType,
          fileSize: populatedMessage.fileSize,
          sender: populatedMessage.sender,
          createdAt: populatedMessage.createdAt,
        });
      } catch (err) {
        console.error('Chat error', err);
      }
    });
  });

  app.set('io', io);

  // Meeting namespace & WebRTC signaling
  const meetingMonitor = io.of('/meeting');
  meetingMonitor.use(socketAuthMiddleware);

  const meetingRoomsState = {}; // roomId -> { socketId: { userId, userName, userRole, audioActive, videoActive } }
  const meetingWaitingRoomsState = {}; // roomId -> { socketId: { userId, userName, audioActive, videoActive } }

  meetingMonitor.on('connection', (socket) => {
    socket.on('join-classroom-meeting', ({ classroomId }) => {
      if (classroomId) {
        socket.join(`classroom:${classroomId}`);
      }
    });

    socket.on('join-room', ({ meetingId, classroomId, userId, userName, userRole, audioActive, videoActive }) => {
      if (!meetingId) return;
      socket.meetingId = meetingId;
      socket.classroomId = classroomId;
      socket.userName = userName || 'Thành viên';
      socket.userRole = userRole || 'student';
      socket.userId = userId;

      socket.join(meetingId);

      if (!meetingRoomsState[meetingId]) {
        meetingRoomsState[meetingId] = {};
      }
      if (!meetingWaitingRoomsState[meetingId]) {
        meetingWaitingRoomsState[meetingId] = {};
      }

      // Purge any stale socket connections belonging to the same userId
      if (userId) {
        Object.keys(meetingRoomsState[meetingId]).forEach((oldSocketId) => {
          if (
            oldSocketId !== socket.id &&
            String(meetingRoomsState[meetingId][oldSocketId].userId) === String(userId)
          ) {
            delete meetingRoomsState[meetingId][oldSocketId];
            meetingMonitor.to(meetingId).emit('user_left', { socketId: oldSocketId });
          }
        });
        Object.keys(meetingWaitingRoomsState[meetingId]).forEach((oldSocketId) => {
          if (
            oldSocketId !== socket.id &&
            String(meetingWaitingRoomsState[meetingId][oldSocketId].userId) === String(userId)
          ) {
            delete meetingWaitingRoomsState[meetingId][oldSocketId];
          }
        });
      }

      // If user is Teacher, admit immediately
      if (socket.userRole === 'teacher') {
        meetingRoomsState[meetingId][socket.id] = {
          userId,
          userName: socket.userName,
          userRole: socket.userRole,
          audioActive: audioActive !== false,
          videoActive: videoActive !== false,
        };

        // Notify active peers
        socket.to(meetingId).emit('user_joined', {
          socketId: socket.id,
          user: meetingRoomsState[meetingId][socket.id],
        });

        // Send existing active room users to Teacher
        const roomUsers = Object.entries(meetingRoomsState[meetingId]).map(([sId, uInfo]) => ({
          socketId: sId,
          user: uInfo,
        }));
        socket.emit('room_users', roomUsers);

        // Send current waiting list to Teacher
        const waitingList = Object.entries(meetingWaitingRoomsState[meetingId]).map(([sId, uInfo]) => ({
          socketId: sId,
          user: uInfo,
        }));
        socket.emit('waiting_students_list', waitingList);
      } else {
        // If user is Student, put in Waiting Room
        meetingWaitingRoomsState[meetingId][socket.id] = {
          userId,
          userName: socket.userName,
          userRole: socket.userRole,
          audioActive: audioActive !== false,
          videoActive: videoActive !== false,
        };

        socket.emit('waiting_for_approval');

        // Notify Teacher(s) in room about new waiting student
        const waitingList = Object.entries(meetingWaitingRoomsState[meetingId]).map(([sId, uInfo]) => ({
          socketId: sId,
          user: uInfo,
        }));
        socket.to(meetingId).emit('waiting_students_list', waitingList);
      }
    });

    socket.on('approve_student_join', ({ targetSocketId }) => {
      const mId = socket.meetingId;
      if (mId && socket.userRole === 'teacher' && meetingWaitingRoomsState[mId]?.[targetSocketId]) {
        const studentInfo = meetingWaitingRoomsState[mId][targetSocketId];
        delete meetingWaitingRoomsState[mId][targetSocketId];

        meetingRoomsState[mId][targetSocketId] = studentInfo;

        // Notify approved student socket
        meetingMonitor.to(targetSocketId).emit('join_approved');

        // Send active room users list to the newly approved student
        const roomUsers = Object.entries(meetingRoomsState[mId]).map(([sId, uInfo]) => ({
          socketId: sId,
          user: uInfo,
        }));
        meetingMonitor.to(targetSocketId).emit('room_users', roomUsers);

        // Notify everyone in active room that student joined
        meetingMonitor.to(mId).emit('user_joined', {
          socketId: targetSocketId,
          user: studentInfo,
        });

        // Send updated waiting list to Teacher
        const waitingList = Object.entries(meetingWaitingRoomsState[mId]).map(([sId, uInfo]) => ({
          socketId: sId,
          user: uInfo,
        }));
        meetingMonitor.to(mId).emit('waiting_students_list', waitingList);
      }
    });

    socket.on('decline_student_join', ({ targetSocketId }) => {
      const mId = socket.meetingId;
      if (mId && socket.userRole === 'teacher' && meetingWaitingRoomsState[mId]?.[targetSocketId]) {
        delete meetingWaitingRoomsState[mId][targetSocketId];

        // Notify declined student socket
        meetingMonitor.to(targetSocketId).emit('join_declined');

        // Send updated waiting list to Teacher
        const waitingList = Object.entries(meetingWaitingRoomsState[mId]).map(([sId, uInfo]) => ({
          socketId: sId,
          user: uInfo,
        }));
        meetingMonitor.to(mId).emit('waiting_students_list', waitingList);
      }
    });

    socket.on('webrtc_offer', ({ targetSocketId, offer }) => {
      if (targetSocketId && offer) {
        meetingMonitor.to(targetSocketId).emit('webrtc_offer', {
          senderSocketId: socket.id,
          offer,
          senderUser: meetingRoomsState[socket.meetingId]?.[socket.id],
        });
      }
    });

    socket.on('webrtc_answer', ({ targetSocketId, answer }) => {
      if (targetSocketId && answer) {
        meetingMonitor.to(targetSocketId).emit('webrtc_answer', {
          senderSocketId: socket.id,
          answer,
        });
      }
    });

    socket.on('ice_candidate', ({ targetSocketId, candidate }) => {
      if (targetSocketId && candidate) {
        meetingMonitor.to(targetSocketId).emit('ice_candidate', {
          senderSocketId: socket.id,
          candidate,
        });
      }
    });

    socket.on('toggle_media', ({ audioActive, videoActive }) => {
      const mId = socket.meetingId;
      if (mId && meetingRoomsState[mId]?.[socket.id]) {
        meetingRoomsState[mId][socket.id].audioActive = audioActive;
        meetingRoomsState[mId][socket.id].videoActive = videoActive;
        socket.to(mId).emit('user_media_state', {
          socketId: socket.id,
          audioActive,
          videoActive,
        });
      }
    });

    socket.on('send_room_message', ({ meetingId, content }) => {
      if (meetingId && content) {
        const cleanContent = String(content).trim().slice(0, 1000);
        if (!cleanContent) return;

        meetingMonitor.to(meetingId).emit('room_message', {
          senderName: socket.userName,
          senderRole: socket.userRole,
          content: cleanContent,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });
      }
    });

    socket.on('toggle_raise_hand', ({ raisedHand }) => {
      const mId = socket.meetingId;
      if (mId && meetingRoomsState[mId]?.[socket.id]) {
        meetingRoomsState[mId][socket.id].raisedHand = raisedHand;
        meetingMonitor.to(mId).emit('user_raise_hand', {
          socketId: socket.id,
          userName: socket.userName,
          raisedHand,
        });
      }
    });

    socket.on('send_reaction', ({ emoji }) => {
      const mId = socket.meetingId;
      if (mId && emoji) {
        meetingMonitor.to(mId).emit('room_reaction', {
          socketId: socket.id,
          userName: socket.userName,
          emoji,
        });
      }
    });

    socket.on('mute_all_participants', () => {
      const mId = socket.meetingId;
      if (mId && socket.userRole === 'teacher') {
        socket.to(mId).emit('force_mute_mic');
      }
    });

    socket.on('screen_share_status', ({ isSharing, streamId }) => {
      const mId = socket.meetingId;
      if (mId) {
        if (meetingRoomsState[mId]?.[socket.id]) {
          meetingRoomsState[mId][socket.id].isSharingScreen = !!isSharing;
          meetingRoomsState[mId][socket.id].screenStreamId = isSharing ? streamId : null;
        }
        socket.to(mId).emit('user_screen_share', {
          socketId: socket.id,
          userName: socket.userName,
          isSharing: !!isSharing,
          streamId: isSharing ? streamId : null,
        });
      }
    });

    socket.on('disconnect', () => {
      const mId = socket.meetingId;
      if (mId) {
        // Remove from active room
        if (meetingRoomsState[mId]) {
          delete meetingRoomsState[mId][socket.id];
          socket.to(mId).emit('user_left', { socketId: socket.id });

          const remainingCount = Object.keys(meetingRoomsState[mId]).length;
          if (remainingCount === 0) {
            delete meetingRoomsState[mId];
            const meetingService = require('./services/meeting.service');
            setTimeout(async () => {
              if (!meetingRoomsState[mId] || Object.keys(meetingRoomsState[mId]).length === 0) {
                await meetingService.autoEndEmptyMeeting(mId, io);
              }
            }, 4000);
          }
        }

        // Remove from waiting room and notify teacher
        if (meetingWaitingRoomsState[mId] && meetingWaitingRoomsState[mId][socket.id]) {
          delete meetingWaitingRoomsState[mId][socket.id];

          const waitingList = Object.entries(meetingWaitingRoomsState[mId]).map(([sId, uInfo]) => ({
            socketId: sId,
            user: uInfo,
          }));
          meetingMonitor.to(mId).emit('waiting_students_list', waitingList);
        }
      }
    });
  });

  // Background timer for automatic meeting status synchronization
  const meetingService = require('./services/meeting.service');
  setInterval(() => {
    meetingService.runBackgroundStatusSync(io);
  }, 15000);

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
