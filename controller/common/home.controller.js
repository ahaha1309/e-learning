async function renderHome(req, res, next) {
  try {
    const authenticated = req.isAuthenticated ? req.isAuthenticated() : Boolean(req.user);
    if (authenticated && req.user) {
      const role = req.user.role;
      if (role === 'admin') return res.redirect('/admin/dashboard');
      if (role === 'teacher') return res.redirect('/teacher');
      if (role === 'student') return res.redirect('/student');
      return res.redirect('/auth/login');
    }

    const Classroom = require('../../models/Classroom');
    const User = require('../../models/User');
    const Lecture = require('../../models/Lecture');

    let classroomCount = 0;
    let teacherCount = 0;
    let studentCount = 0;
    let lectureCount = 0;
    try {
      [classroomCount, teacherCount, studentCount, lectureCount] = await Promise.all([
        Classroom.countDocuments({ isArchived: false }),
        User.countDocuments({ role: 'teacher', status: 'active' }),
        User.countDocuments({ role: 'student', status: 'active' }),
        Lecture.countDocuments({ isPublished: true }),
      ]);
    } catch (countErr) {
      // keep the zero defaults
    }

    res.render('index', {
      title: 'Enterprise Learning Platform',
      classroomCount,
      teacherCount,
      studentCount,
      lectureCount,
    });
  } catch (error) {
    return next(error);
  }
}

async function renderCatalog(req, res, next) {
  try {
    const Classroom = require('../../models/Classroom');
    const Category = require('../../models/Category');

    const search = String(req.query.q || '').trim();
    const categorySlug = String(req.query.category || '').trim();
    const selectedLevel = String(req.query.level || '').trim();

    const filter = { isArchived: false };
    if (categorySlug) {
      const cat = await Category.findOne({ slug: categorySlug });
      if (cat) filter.category = cat._id;
    }
    if (selectedLevel) {
      filter.level = selectedLevel;
    }

    const [classrooms, categories] = await Promise.all([
      Classroom.find(filter).populate('category').sort({ createdAt: -1 }),
      Category.find().sort({ name: 1 }),
    ]);

    const courses = classrooms
      .filter((c) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          (c.description || '').toLowerCase().includes(q) ||
          (c.category && c.category.name && c.category.name.toLowerCase().includes(q))
        );
      })
      .map((c) => ({
        slug: c._id.toString(),
        title: c.name,
        summary: c.description,
        category: c.category ? c.category.name : null,
        categorySlug: c.category ? c.category.slug : null,
        level: c.level || 'Beginner',
        duration: null,
        _id: c._id,
      }));

    res.render('catalog/index', {
      title: 'Course Catalog',
      courses,
      query: search,
      selectedCategory: categorySlug,
      selectedLevel,
      categories,
    });
  } catch (error) {
    return next(error);
  }
}

async function renderCategory(req, res, next) {
  try {
    const Classroom = require('../../models/Classroom');
    const Category = require('../../models/Category');

    const categorySlug = req.params.category;
    const [cat, categories] = await Promise.all([
      Category.findOne({ slug: categorySlug }),
      Category.find().sort({ name: 1 }),
    ]);

    const filter = { isArchived: false };
    if (cat) filter.category = cat._id;

    const classrooms = await Classroom.find(filter).populate('category').sort({ createdAt: -1 });
    const courses = classrooms.map((c) => ({
      slug: c._id.toString(),
      title: c.name,
      summary: c.description,
      category: c.category ? c.category.name : null,
      categorySlug: c.category ? c.category.slug : null,
      level: c.level || 'Beginner',
      duration: null,
      _id: c._id,
    }));

    res.render('catalog/index', {
      title: `${cat ? cat.name : categorySlug} Courses`,
      courses,
      query: '',
      selectedCategory: categorySlug,
      categories,
    });
  } catch (error) {
    return next(error);
  }
}

async function renderCourseDetail(req, res, next) {
  try {
    const Classroom = require('../../models/Classroom');
    const ClassroomMember = require('../../models/ClassroomMember');

    const classroom = await Classroom.findById(req.params.slug).populate('category');
    if (!classroom) {
      return res.status(404).render('errors/404', { title: 'Course not found' });
    }

    const memberCount = await ClassroomMember.countDocuments({ classroom: classroom._id, status: 'approved' });

    const course = {
      slug: classroom._id.toString(),
      title: classroom.name,
      summary: classroom.description,
      category: classroom.category ? classroom.category.name : null,
      level: classroom.level || 'Beginner',
      duration: null,
      memberCount,
      _id: classroom._id,
    };

    return res.render('catalog/show', {
      title: course.title,
      course,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  renderHome,
  renderCatalog,
  renderCategory,
  renderCourseDetail,
};

