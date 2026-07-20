const { validationResult } = require('express-validator');
const { getProfileById, updateProfile, changePassword } = require('./profile.service');
const { uploadImageBuffer } = require('../../middleware/imageUpload');

function formatValidationErrors(req) {
  const result = validationResult(req);
  return result.isEmpty() ? null : result.array().map((item) => item.msg).join('. ');
}

async function renderProfile(req, res, next) {
  try {
    const user = await getProfileById(req.user.id);

    return res.render('profile/show', {
      title: 'My profile',
      user,
    });
  } catch (error) {
    return next(error);
  }
}

async function renderEditProfile(req, res, next) {
  try {
    const user = await getProfileById(req.user.id);

    return res.render('profile/edit', {
      title: 'Edit profile',
      user,
      formData: {
        name: user.name,
        phone: user.phone || '',
        avatarUrl: user.avatarUrl || '',
      },
      errorMessage: null,
    });
  } catch (error) {
    return next(error);
  }
}

async function updateProfileHandler(req, res, next) {
  try {
    const validationMessage = formatValidationErrors(req);
    const existingUser = await getProfileById(req.user.id);
    if (validationMessage) {
      // req.body is no longer the source of truth for the avatar (it is a file now),
      // so repopulate formData from the existing user to avoid wiping the avatar.
      return res.status(422).render('profile/edit', {
        title: 'Edit profile',
        user: existingUser,
        formData: {
          name: req.body.name || existingUser.name,
          phone: req.body.phone || '',
          avatarUrl: existingUser.avatarUrl || '',
        },
        errorMessage: validationMessage,
      });
    }

    // Avatar: uploaded image -> Cloudinary secure_url -> stored in MongoDB.
    // No new file uploaded -> keep the existing Cloudinary URL.
    const uploadedFile = req.files && req.files.avatar ? req.files.avatar[0] : null;
    const secureUrl = uploadedFile
      ? await uploadImageBuffer(uploadedFile, 'avatars')
      : existingUser.avatarUrl;

    await updateProfile(req.user.id, { ...req.body, avatarUrl: secureUrl });
    return res.redirect('/profile');
  } catch (error) {
    return next(error);
  }
}

async function renderPasswordForm(req, res, next) {
  try {
    await getProfileById(req.user.id);

    return res.render('profile/password', {
      title: 'Change password',
      errorMessage: null,
      formData: {},
    });
  } catch (error) {
    return next(error);
  }
}

async function changePasswordHandler(req, res, next) {
  try {
    const validationMessage = formatValidationErrors(req);
    if (validationMessage) {
      return res.status(422).render('profile/password', {
        title: 'Change password',
        errorMessage: validationMessage,
        formData: req.body,
      });
    }

    await changePassword(req.user.id, req.body.currentPassword, req.body.newPassword);
    return res.redirect('/profile');
  } catch (error) {
    if (error.statusCode === 422) {
      return res.status(422).render('profile/password', {
        title: 'Change password',
        errorMessage: error.message,
        formData: req.body,
      });
    }

    return next(error);
  }
}

module.exports = {
  renderProfile,
  renderEditProfile,
  updateProfileHandler,
  renderPasswordForm,
  changePasswordHandler,
};
