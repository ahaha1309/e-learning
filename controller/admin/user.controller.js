const { validationResult } = require('express-validator');
const User = require('../../models/User');
const bcrypt = require('bcrypt');

const PAGE_SIZE = 20;

async function listUsers(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const query = {};
    const filter = {};

    if (req.query.q) {
      const search = req.query.q.trim();
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    if (req.query.role) {
      query.role = req.query.role;
      filter.roleFilter = req.query.role;
    }

    if (req.query.status) {
      query.status = req.query.status;
      filter.statusFilter = req.query.status;
    }

    const total = await User.countDocuments(query);
    const totalPages = Math.ceil(total / PAGE_SIZE);

    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE);

    return res.render('admin/users/index', {
      title: 'Users',
      users,
      query: req.query.q || '',
      currentPage: page,
      totalPages,
      ...filter
    });
  } catch (error) {
    return next(error);
  }
}

function renderNewUser(req, res) {
  return res.render('admin/users/new', {
    title: 'New User',
    formData: {},
    errorMessage: null
  });
}

async function createUser(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).render('admin/users/new', {
        title: 'New User',
        formData: req.body,
        errorMessage: errors.array().map(e => e.msg).join('. ')
      });
    }

    const { name, email, password, role, status, phone } = req.body;

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(422).render('admin/users/new', {
        title: 'New User',
        formData: req.body,
        errorMessage: 'A user with this email already exists.'
      });
    }

    const user = new User({ name, email, role: role || 'student', status: status || 'active', phone });
    await user.setPassword(password);
    await user.save();

    return res.redirect('/admin/users');
  } catch (error) {
    return next(error);
  }
}

async function renderEditUser(req, res, next) {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).redirect('/admin/users');
    }

    return res.render('admin/users/edit', {
      title: 'Edit User',
      editUser: user,
      errorMessage: null
    });
  } catch (error) {
    return next(error);
  }
}

async function updateUser(req, res, next) {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).redirect('/admin/users');
    }

    const { name, email, role, status, phone } = req.body;
    user.name = name;
    user.email = email;
    user.role = role;
    user.status = status;
    user.phone = phone || null;
    await user.save();

    return res.redirect('/admin/users');
  } catch (error) {
    return next(error);
  }
}

async function deleteUser(req, res, next) {
  try {
    await User.findByIdAndDelete(req.params.userId);
    return res.redirect('/admin/users');
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listUsers, renderNewUser, createUser,
  renderEditUser, updateUser, deleteUser
};
