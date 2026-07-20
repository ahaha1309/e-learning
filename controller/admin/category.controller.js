const Category = require('../../models/Category');

async function listCategories(req, res, next) {
  try {
    const categories = await Category.find().sort({ name: 1 });
    res.render('admin/categories/index', {
      title: 'Manage Categories',
      categories,
      feedback: req.query.feedback || null,
    });
  } catch (error) {
    next(error);
  }
}

function renderNewCategory(req, res) {
  res.render('admin/categories/form', {
    title: 'New Category',
    category: {},
    errorMessage: null,
  });
}

async function createCategory(req, res, next) {
  try {
    const { name, slug, description, icon } = req.body;
    
    const existing = await Category.findOne({ slug });
    if (existing) {
      return res.status(422).render('admin/categories/form', {
        title: 'New Category',
        category: req.body,
        errorMessage: 'Slug already exists. Please choose another one.',
      });
    }

    await Category.create({ name, slug, description, icon: icon || 'ph-folder' });
    res.redirect('/admin/categories?feedback=' + encodeURIComponent('Category created successfully.'));
  } catch (error) {
    if (error.code === 11000) {
      return res.status(422).render('admin/categories/form', {
        title: 'New Category',
        category: req.body,
        errorMessage: 'A category with this name or slug already exists.',
      });
    }
    next(error);
  }
}

async function renderEditCategory(req, res, next) {
  try {
    const category = await Category.findById(req.params.categoryId);
    if (!category) {
      return res.status(404).render('errors/404', { title: 'Category not found' });
    }
    res.render('admin/categories/form', {
      title: 'Edit Category',
      category,
      errorMessage: null,
    });
  } catch (error) {
    next(error);
  }
}

async function updateCategory(req, res, next) {
  try {
    const { name, slug, description, icon } = req.body;
    const category = await Category.findById(req.params.categoryId);
    if (!category) {
      return res.status(404).render('errors/404', { title: 'Category not found' });
    }

    const existing = await Category.findOne({ slug, _id: { $ne: category._id } });
    if (existing) {
      return res.status(422).render('admin/categories/form', {
        title: 'Edit Category',
        category: { ...category.toObject(), name, slug, description, icon },
        errorMessage: 'Slug already exists. Please choose another one.',
      });
    }

    category.name = name;
    category.slug = slug;
    category.description = description;
    category.icon = icon || 'ph-folder';

    await category.save();
    res.redirect('/admin/categories?feedback=' + encodeURIComponent('Category updated successfully.'));
  } catch (error) {
    if (error.code === 11000) {
      return res.status(422).render('admin/categories/form', {
        title: 'Edit Category',
        category: { ...req.body, _id: req.params.categoryId },
        errorMessage: 'A category with this name or slug already exists.',
      });
    }
    next(error);
  }
}

async function deleteCategory(req, res, next) {
  try {
    await Category.findByIdAndDelete(req.params.categoryId);
    res.redirect('/admin/categories?feedback=' + encodeURIComponent('Category deleted.'));
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listCategories,
  renderNewCategory,
  createCategory,
  renderEditCategory,
  updateCategory,
  deleteCategory,
};
