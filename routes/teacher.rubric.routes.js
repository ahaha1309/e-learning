const express = require('express');
const { classroomIdRules } = require('../validate/teacher/classroom.validate');
const {
  createRubricRules,
  rubricIdRules,
} = require('../validate/teacher/rubric.validate');
const {
  renderRubricIndex,
  renderCreateRubric,
  createRubricHandler,
  renderRubricDetail,
  renderEditRubric,
  updateRubricHandler,
  deleteRubricHandler,
  duplicateRubricHandler,
  apiGetRubrics,
} = require('../controller/teacher/rubric.controller');

const router = express.Router({ mergeParams: true });

router.get('/', classroomIdRules, renderRubricIndex);
router.get('/new', classroomIdRules, renderCreateRubric);
router.post('/', classroomIdRules, createRubricRules, createRubricHandler);
router.get('/api/list', classroomIdRules, apiGetRubrics);
router.get('/:rubricId', classroomIdRules.concat(rubricIdRules), renderRubricDetail);
router.get('/:rubricId/edit', classroomIdRules.concat(rubricIdRules), renderEditRubric);
router.post('/:rubricId/edit', classroomIdRules.concat(rubricIdRules), createRubricRules, updateRubricHandler);
router.post('/:rubricId/delete', classroomIdRules.concat(rubricIdRules), deleteRubricHandler);
router.post('/:rubricId/duplicate', classroomIdRules.concat(rubricIdRules), duplicateRubricHandler);

module.exports = router;

