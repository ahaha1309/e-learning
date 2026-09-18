const SystemSetting = require('../../models/SystemSetting');
const { uploadImageBuffer } = require('../../middleware/imageUpload');
const courseRegistrationService = require('../../services/courseRegistration.service');

// Resolve a settings-level image field: if a new image file was uploaded,
// send it to Cloudinary and return ONLY the secure_url; otherwise keep the
// existing URL passed back from the form (hidden field) so editing text-only
// fields never removes the current logo/favicon.
async function resolveSettingImage(req, field, folder, existingValue) {
  const uploadedFile = req.files && Array.isArray(req.files[field]) ? req.files[field][0] : null;
  if (uploadedFile) {
    const secureUrl = await uploadImageBuffer(uploadedFile, folder);
    return secureUrl || existingValue || '';
  }
  return existingValue || '';
}

async function renderSettings(req, res, next) {
  try {
    const settings = await SystemSetting.find().sort({ key: 1 });
    
    // Transform array to key-value object for easy rendering
    const config = {};
    settings.forEach(s => {
      config[s.key] = s.value;
    });

    // Provide defaults if they don't exist yet
    const defaults = {
      siteName: 'E-Learning LMS',
      siteDescription: 'A modern learning management platform.',
      supportEmail: '',
      supportPhone: '',
      supportHours: 'Mon-Fri 9:00-18:00',
      maintenanceMode: false,
      maintenanceMessage: 'The platform is currently under maintenance. Please check back later.',
      allowRegistration: true,
      defaultUserRole: 'student',
      maxClassroomsPerTeacher: 10,
      maxStudentsPerClassroom: 50,
      sessionTimeout: 480,
      passwordMinLength: 6,
      passwordRequireUppercase: true,
      passwordRequireSpecialChar: true,
      passwordExpiryDays: 0,
      maxLoginAttempts: 5,
      lockoutDurationMinutes: 30,
      enableEmailNotifications: true,
      enableSMSNotifications: false,
      defaultTimezone: 'Asia/Ho_Chi_Minh',
      defaultLocale: 'en',
      theme: 'light',
      logoUrl: '',
      faviconUrl: '',
      footerText: '',
      termsUrl: '',
      privacyUrl: '',
      enableGoogleAuth: true,
      enableFacebookAuth: false,
      autoApproveTeachers: false,
      enableAnalytics: true,
      smtpHost: '',
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: '',
      smtpPass: '',
      smtpFromName: 'E-Learning LMS',
      smtpFromEmail: '',
      enableStudentDiscussion: true,
      enableStudentMessaging: true,
      enableFileUploads: true,
      maxFileSizeMB: 25,
      allowedFileTypes: 'pdf,doc,docx,ppt,pptx,xls,xlsx,jpg,jpeg,png,zip',
      enableExamProctoring: true,
      autoGradeMCQ: true,
      certificateEnabled: true,
      certificateTemplate: 'default',
      enrollmentApprovalRequired: true,
      enableCourseCatalog: true,
      enableProgressTracking: true,
      dataRetentionDays: 365,
      backupFrequency: 'daily',
      apiRateLimit: 300,
      apiRateLimitWindow: 15,
      courseRegistrationStart: null,
      courseRegistrationEnd: null,
    };
    for (const [key, val] of Object.entries(defaults)) {
      if (config[key] === undefined || config[key] === null) {
        config[key] = val;
      }
    }

    config.courseRegistrationStart = courseRegistrationService.toLocalISOString(config.courseRegistrationStart);
    config.courseRegistrationEnd = courseRegistrationService.toLocalISOString(config.courseRegistrationEnd);

    return res.render('admin/settings', {
      title: 'System Settings',
      config,
      feedback: req.query.feedback || null,
      errorMessage: null,
    });
  } catch (error) {
    return next(error);
  }
}

async function updateSettingsHandler(req, res, next) {
  try {
    const payload = req.body;

    const bool = (v) => v === 'true';
    const num = (v, d) => Number(v) || d;

    // Logo & favicon: uploaded image files -> Cloudinary secure_url only.
    // No new file -> keep the existing URL (carried back by a hidden field).
    const logoUrlValue = await resolveSettingImage(req, 'logo', 'branding/logo', payload.logoUrl);
    const faviconUrlValue = await resolveSettingImage(req, 'favicon', 'branding/favicon', payload.faviconUrl);

    let startVal = null;
    let endVal = null;

    if (payload.courseRegistrationStart || payload.courseRegistrationEnd) {
      if (!payload.courseRegistrationStart || !payload.courseRegistrationEnd) {
        return res.status(422).render('admin/settings', {
          title: 'System Settings',
          config: {
            ...payload,
            logoUrl: logoUrlValue,
            faviconUrl: faviconUrlValue,
          },
          feedback: null,
          errorMessage: 'Vui lòng nhập đầy đủ cả thời gian bắt đầu và kết thúc đăng ký học phần.',
        });
      }

      startVal = courseRegistrationService.parseLocalTime(payload.courseRegistrationStart);
      endVal = courseRegistrationService.parseLocalTime(payload.courseRegistrationEnd);

      if (startVal.getTime() >= endVal.getTime()) {
        return res.status(422).render('admin/settings', {
          title: 'System Settings',
          config: {
            ...payload,
            logoUrl: logoUrlValue,
            faviconUrl: faviconUrlValue,
          },
          feedback: null,
          errorMessage: 'Thời gian bắt đầu đăng ký phải nhỏ hơn thời gian kết thúc.',
        });
      }
    }

    const settingsMap = {
      courseRegistrationStart: { value: startVal, description: 'Thời gian bắt đầu đăng ký học phần' },
      courseRegistrationEnd: { value: endVal, description: 'Thời gian kết thúc đăng ký học phần' },
      siteName: { value: payload.siteName || 'E-Learning LMS', description: 'Global Site Name' },
      siteDescription: { value: payload.siteDescription || '', description: 'Site tagline / meta description' },
      supportEmail: { value: payload.supportEmail || '', description: 'Support email address' },
      supportPhone: { value: payload.supportPhone || '', description: 'Support phone number' },
      supportHours: { value: payload.supportHours || '', description: 'Support operating hours' },
      maintenanceMode: { value: bool(payload.maintenanceMode), description: 'Maintenance Mode (Blocks non-admin access)' },
      maintenanceMessage: { value: payload.maintenanceMessage || '', description: 'Maintenance mode message' },
      allowRegistration: { value: bool(payload.allowRegistration), description: 'Allow new users to register' },
      defaultUserRole: { value: payload.defaultUserRole || 'student', description: 'Default role for new registrations' },
      maxClassroomsPerTeacher: { value: num(payload.maxClassroomsPerTeacher, 10), description: 'Maximum classrooms a teacher can create' },
      maxStudentsPerClassroom: { value: num(payload.maxStudentsPerClassroom, 50), description: 'Maximum students per classroom' },
      sessionTimeout: { value: num(payload.sessionTimeout, 480), description: 'Session timeout in minutes' },
      passwordMinLength: { value: num(payload.passwordMinLength, 6), description: 'Minimum password length' },
      passwordRequireUppercase: { value: bool(payload.passwordRequireUppercase), description: 'Require uppercase in password' },
      passwordRequireSpecialChar: { value: bool(payload.passwordRequireSpecialChar), description: 'Require special character in password' },
      passwordExpiryDays: { value: num(payload.passwordExpiryDays, 0), description: 'Password expiry in days (0 = never)' },
      maxLoginAttempts: { value: num(payload.maxLoginAttempts, 5), description: 'Max failed login attempts before lockout' },
      lockoutDurationMinutes: { value: num(payload.lockoutDurationMinutes, 30), description: 'Lockout duration in minutes' },
      enableEmailNotifications: { value: bool(payload.enableEmailNotifications), description: 'Enable email notifications' },
      enableSMSNotifications: { value: bool(payload.enableSMSNotifications), description: 'Enable SMS notifications' },
      defaultTimezone: { value: payload.defaultTimezone || 'Asia/Ho_Chi_Minh', description: 'Default timezone' },
      defaultLocale: { value: payload.defaultLocale || 'en', description: 'Default locale/language' },
      theme: { value: payload.theme || 'light', description: 'Default UI theme' },
      logoUrl: { value: logoUrlValue, description: 'Custom logo URL' },
      faviconUrl: { value: faviconUrlValue, description: 'Custom favicon URL' },
      footerText: { value: payload.footerText || '', description: 'Custom footer text' },
      termsUrl: { value: payload.termsUrl || '', description: 'Terms of Service URL' },
      privacyUrl: { value: payload.privacyUrl || '', description: 'Privacy Policy URL' },
      enableGoogleAuth: { value: bool(payload.enableGoogleAuth), description: 'Enable Google OAuth login' },
      enableFacebookAuth: { value: bool(payload.enableFacebookAuth), description: 'Enable Facebook OAuth login' },
      autoApproveTeachers: { value: bool(payload.autoApproveTeachers), description: 'Auto-approve teacher registrations' },
      enableAnalytics: { value: bool(payload.enableAnalytics), description: 'Enable platform analytics' },
      smtpHost: { value: payload.smtpHost || '', description: 'SMTP server host' },
      smtpPort: { value: num(payload.smtpPort, 587), description: 'SMTP server port' },
      smtpSecure: { value: bool(payload.smtpSecure), description: 'SMTP secure connection (TLS)' },
      smtpUser: { value: payload.smtpUser || '', description: 'SMTP username' },
      smtpPass: { value: payload.smtpPass || '', description: 'SMTP password' },
      smtpFromName: { value: payload.smtpFromName || 'E-Learning LMS', description: 'SMTP from name' },
      smtpFromEmail: { value: payload.smtpFromEmail || '', description: 'SMTP from email' },
      enableStudentDiscussion: { value: bool(payload.enableStudentDiscussion), description: 'Allow student discussions' },
      enableStudentMessaging: { value: bool(payload.enableStudentMessaging), description: 'Allow student messaging' },
      enableFileUploads: { value: bool(payload.enableFileUploads), description: 'Enable file uploads' },
      maxFileSizeMB: { value: num(payload.maxFileSizeMB, 25), description: 'Maximum file upload size in MB' },
      allowedFileTypes: { value: payload.allowedFileTypes || '', description: 'Allowed file extensions for upload' },
      enableExamProctoring: { value: bool(payload.enableExamProctoring), description: 'Enable exam proctoring' },
      autoGradeMCQ: { value: bool(payload.autoGradeMCQ), description: 'Auto-grade multiple choice questions' },
      certificateEnabled: { value: bool(payload.certificateEnabled), description: 'Enable completion certificates' },
      enrollmentApprovalRequired: { value: bool(payload.enrollmentApprovalRequired), description: 'Require approval for enrollment' },
      enableCourseCatalog: { value: bool(payload.enableCourseCatalog), description: 'Show public course catalog' },
      enableProgressTracking: { value: bool(payload.enableProgressTracking), description: 'Track student progress' },
      dataRetentionDays: { value: num(payload.dataRetentionDays, 365), description: 'Data retention period in days' },
      backupFrequency: { value: payload.backupFrequency || 'daily', description: 'Backup frequency' },
      apiRateLimit: { value: num(payload.apiRateLimit, 300), description: 'API rate limit per window' },
      apiRateLimitWindow: { value: num(payload.apiRateLimitWindow, 15), description: 'API rate limit window in minutes' },
    };

    for (const [key, { value, description }] of Object.entries(settingsMap)) {
      await SystemSetting.findOneAndUpdate(
        { key },
        { value, description },
        { upsert: true }
      );
    }

    return res.redirect('/admin/settings?feedback=Settings+updated+successfully');
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  renderSettings,
  updateSettingsHandler
};
