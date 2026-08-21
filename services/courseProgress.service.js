const Lecture = require('../models/Lecture');
const Assignment = require('../models/Assignment');
const Exam = require('../models/Exam');
const StudentProgress = require('../models/StudentProgress');

// Content item lifecycle statuses. Determined by business rules, never stored,
// never typed as ad-hoc strings by the frontend.
const ITEM_STATUS = Object.freeze({
  COMPLETED: 'COMPLETED',
  IN_PROGRESS: 'IN_PROGRESS',
  NOT_STARTED: 'NOT_STARTED',
  LOCKED: 'LOCKED',
});

const CONTENT_TYPES = Object.freeze({
  LESSON: 'LESSON',
  QUIZ: 'QUIZ', // currently no Quiz model is published separately
  ASSIGNMENT: 'ASSIGNMENT',
  EXAM: 'EXAM',
});

// DEFAULT module keys for content kinds that have no chapter/section field.
const ASSIGNMENTS_MODULE_KEY = 'Bài tập';
const EXAMS_MODULE_KEY = 'Bài thi';

function itemKey(itemType, itemId) {
  return `${itemType}:${String(itemId)}`;
}

function percent(completed, total) {
  if (!total || total <= 0) {
    return 0;
  }
  return Math.round((completed / total) * 100);
}

/*
 * Maps a content kind to its module grouping key.
 * This is the single place where grouping is decided — adding a chapter field
 * to assessments later would only change this function, not the view or the
 * unlock algorithm.
 */
function moduleKeyFor(rawItem, itemType) {
  if (rawItem.chapterTitle) {
    return rawItem.chapterTitle;
  }
  return itemType === CONTENT_TYPES.EXAM ? EXAMS_MODULE_KEY : ASSIGNMENTS_MODULE_KEY;
}

function hrefFor(itemType, classroomId, itemId) {
  switch (itemType) {
    case CONTENT_TYPES.LESSON:
      return `/student/classrooms/${classroomId}/lectures/${itemId}`;
    case CONTENT_TYPES.ASSIGNMENT:
      return `/student/classrooms/${classroomId}/assignments/${itemId}`;
    case CONTENT_TYPES.EXAM:
      return `/student/classrooms/${classroomId}/exams/${itemId}`;
    default:
      return '#';
  }
}

/*
 * Normalizes a raw DB document into the generic ContentItem DTO.
 * `order` provides intra-module sequencing; createdAt is the tiebreaker.
 */
function toContentItem(rawItem, itemType, classroomId) {
  return {
    id: itemKey(itemType, rawItem._id),
    itemId: String(rawItem._id),
    itemType,
    moduleKey: moduleKeyFor(rawItem, itemType),
    title: rawItem.title,
    order: typeof rawItem.orderIndex === 'number' ? rawItem.orderIndex : 0,
    createdAt: rawItem.createdAt ? new Date(rawItem.createdAt).getTime() : 0,
    isRequired: true,
    href: hrefFor(itemType, classroomId, rawItem._id),
  };
}

/*
 * Queries every published content kind for a classroom and normalizes them into
 * a single flat list of ContentItem DTOs. One query per content kind (batched,
 * no N+1). Adding/removing a content kind means adding/removing a query here;
 * the rest of the pipeline is content-kind agnostic.
 */
async function buildContentItems(classroomId) {
  const [lectures, assignments, exams] = await Promise.all([
    Lecture.find({ classroom: classroomId, isPublished: true })
      .sort({ chapterTitle: 1, orderIndex: 1, createdAt: 1 })
      .lean(),
    Assignment.find({ classroom: classroomId, isPublished: true }).sort({ dueDate: 1, createdAt: 1 }).lean(),
    Exam.find({ classroom: classroomId, isPublished: true }).sort({ createdAt: 1 }).lean(),
  ]);

  const items = [];
  lectures.forEach((l) => items.push(toContentItem(l, CONTENT_TYPES.LESSON, classroomId)));
  assignments.forEach((a) => items.push(toContentItem(a, CONTENT_TYPES.ASSIGNMENT, classroomId)));
  exams.forEach((e) => items.push(toContentItem(e, CONTENT_TYPES.EXAM, classroomId)));

  // Global sort: module key, then order, then createdAt. Keeps "Assessments"
  // (no chapterTitle) after lesson chapters under typical string ordering.
  items.sort((a, b) => {
    if (a.moduleKey !== b.moduleKey) return a.moduleKey.localeCompare(b.moduleKey);
    if (a.order !== b.order) return a.order - b.order;
    return a.createdAt - b.createdAt;
  });

  return items;
}

/*
 * One batched fetch of the student's completed items for the classroom.
 * Returns a Set of "itemType:itemId" keys for O(1) lookup.
 */
async function getCompletedItemKeys(classroomId, studentId) {
  const rows = await StudentProgress.find({ classroom: classroomId, student: studentId })
    .select('itemType itemId -_id')
    .lean();
  return new Set(rows.map((r) => itemKey(r.itemType, r.itemId)));
}

/*
 * Groups a sorted list of ContentItems into modules (preserving order).
 * Returns [{ key, items: [ContentItem, ...] }, ...]
 */
function groupByModule(items) {
  const modules = [];
  const indexByKey = new Map();
  for (const item of items) {
    let moduleRow = indexByKey.get(item.moduleKey);
    if (!moduleRow) {
      moduleRow = { key: item.moduleKey, items: [] };
      indexByKey.set(item.moduleKey, moduleRow);
      modules.push(moduleRow);
    }
    moduleRow.items.push(item);
  }
  return modules;
}

/*
 * Prerequisite resolver (v1: simple sequential).
 *
 * For a content item, returns its prerequisite item:
 *   the immediately preceding *isRequired* item within the SAME module.
 * - The first item in a module has no prerequisite (unlocked by default).
 * - The algorithm is content-kind agnostic: a quiz/assignment/exam sitting after
 *   a lesson in the Assessments module is gated by the previous assessment only;
 *   cross-kind gating within a module happens naturally because items are a
 *   single sorted stream.
 *
 * EXTENSION POINT (future, not implemented): to add rule types (score >= 80%,
 * complete-Module-A, date-based, instructor approval, multi-prereq chains),
 * replace this resolver with one keyed by an item's `prereqRules` field and
 * evaluate them here. resolveStatus() below consumes whatever this returns.
 */
function resolvePrerequisite(item, moduleItems) {
  const position = moduleItems.indexOf(item);
  if (position <= 0) {
    return null;
  }
  for (let i = position - 1; i >= 0; i -= 1) {
    if (moduleItems[i].isRequired) {
      return moduleItems[i];
    }
  }
  return null;
}

/*
 * Determines an item's status. GENERIC — no per-type branches.
 *
 *   COMPLETED   → in the completed set
 *   LOCKED       → its prerequisite exists and is not completed
 *   IN_PROGRESS  → unlocked, not completed, AND it is the first such item in
 *                  its module (the "current" item)
 *   NOT_STARTED  → unlocked, not completed, but a later item is current
 */
function resolveStatus(item, moduleItems, completedKeys, isCurrent) {
  if (completedKeys.has(item.id)) {
    return ITEM_STATUS.COMPLETED;
  }

  const prereq = resolvePrerequisite(item, moduleItems);
  if (prereq && !completedKeys.has(prereq.id)) {
    return ITEM_STATUS.LOCKED;
  }

  return isCurrent ? ITEM_STATUS.IN_PROGRESS : ITEM_STATUS.NOT_STARTED;
}

/*
 * The single public entrypoint the controller calls. Returns the full
 * presentation tree. The Pug view renders ONLY from this object — it computes
 * nothing itself.
 */
async function computeCourseProgress(classroom, studentId) {
  if (!classroom) {
    return null;
  }
  const classroomId = classroom.id || classroom._id;

  const [items, completedKeys] = await Promise.all([
    buildContentItems(classroomId),
    getCompletedItemKeys(classroomId, studentId),
  ]);

  const modules = groupByModule(items).map((moduleRow) => {
    // The "current" item is the first item in the module that is unlocked but
    // not yet completed. Everything later in that module is NOT_STARTED.
    let currentFound = false;
    let moduleCompleted = 0;
    const children = moduleRow.items.map((item) => {
      const isCurrent = !currentFound && !completedKeys.has(item.id);
      if (isCurrent) {
        currentFound = true;
      }
      if (completedKeys.has(item.id)) {
        moduleCompleted += 1;
      }
      const status = resolveStatus(item, moduleRow.items, completedKeys, isCurrent);
      return {
        id: item.id,
        itemType: item.itemType,
        title: item.title,
        order: item.order,
        isRequired: item.isRequired,
        href: item.href,
        status,
        // Pre-format a small meta label for the view (duration/points/etc.).
        // Kept neutral; the view still renders, it just doesn't invent values.
        meta: item.meta || '',
      };
    });

    const totalItems = children.length;
    const completedItems = moduleCompleted;
    const remainingItems = Math.max(0, totalItems - completedItems);
    const moduleProgressPercent = percent(completedItems, totalItems);

    // Module status: COMPLETED if everything done, LOCKED if its first item
    // is locked, IN_PROGRESS if at least one is done/current, NOT_STARTED otherwise.
    let moduleStatus = ITEM_STATUS.NOT_STARTED;
    if (completedItems > 0 || children.some((c) => c.status === ITEM_STATUS.IN_PROGRESS)) {
      moduleStatus = ITEM_STATUS.IN_PROGRESS;
    }
    if (totalItems > 0 && completedItems === totalItems) {
      moduleStatus = ITEM_STATUS.COMPLETED;
    }
    if (totalItems > 0 && children[0].status === ITEM_STATUS.LOCKED) {
      moduleStatus = ITEM_STATUS.LOCKED;
    }

    return {
      key: moduleRow.key,
      status: moduleStatus,
      totalItems,
      completedItems,
      remainingItems,
      progressPercent: moduleProgressPercent,
      children,
    };
  });

  const totalItems = items.length;
  const completedItems = modules.reduce((sum, m) => sum + m.completedItems, 0);
  const remainingItems = Math.max(0, totalItems - completedItems);
  const progressPercent = percent(completedItems, totalItems);

  // Course-wide current lesson = the child of the first module that has one.
  let currentLesson = null;
  let nextLesson = null;
  let lastCompletedLesson = null;
  const flatChildren = modules.flatMap((m) => m.children);
  currentLesson = flatChildren.find((c) => c.status === ITEM_STATUS.IN_PROGRESS) || null;
  nextLesson = flatChildren.find((c) => c.status === ITEM_STATUS.NOT_STARTED) || null;
  for (let i = flatChildren.length - 1; i >= 0; i -= 1) {
    if (flatChildren[i].status === ITEM_STATUS.COMPLETED) {
      lastCompletedLesson = flatChildren[i];
      break;
    }
  }

  return {
    course: { id: String(classroomId), name: classroom.name },
    status: ITEM_STATUS,
    progressPercent,
    totalItems,
    completedItems,
    remainingItems,
    currentLesson,
    nextLesson,
    lastCompletedLesson,
    modules,
  };
}

module.exports = {
  computeCourseProgress,
  ITEM_STATUS,
  CONTENT_TYPES,
};
