# UX Audit — LMS workflows (Google UXR methodology)

Framework: Nielsen's 10 heuristics + the 9 named dimensions (too many clicks, poor navigation, confusing layouts, weak hierarchy, bad onboarding, weak search, poor mobile usability, hidden features, + minimum-effort-as-goal).

Severity key: **B** = Blocker (task fails / dead), **M** = Major (real friction), **m** = Minor.

> Section "Content-workflow findings" is appended from the high-friction-flow audit pass.

---

## A. Structural findings (cross-role) — confirmed

These hit every workflow, so they are fixed first.

### A1 — Dead dashboard quick-action links  · B
`views/student/dashboard.pug:141` quick-action grid links to `/student/assignments`, `/student/exams`, `/student/discussions` (and `/student/certificates`, which *does* exist). `routes/student.routes.js:18-30` registers only `/`, `/analytics`, `/certificates`; all assignment/exam/discussion routes are `/:classroomId/...`. **Result: 3 of 4 student quick actions 404.** Same pattern risk for any teacher dashboard link to non-existent flat routes.

### A2 — Navigation depth: most workflows are classroom-scoped, no flat/aggregate entry  · B (clicks · navigation · hidden features)
- Student sidebar (`sidebar-student.pug`): Overview / Classrooms / Catalog / Analytics / Certificates / Notifications only.
- Teacher sidebar (`sidebar-teacher.pug`): Overview / Classrooms / Question Banks / Analytics / Notifications only.
- Assignments, exams, lectures, submissions, attendance, discussions, gradebook are mounted under `/{role}/classrooms/:classroomId/...` (`student.routes.js:24-29`, `teacher.routes.js:21-25`).
- **To reach "my assignments"**: Sidebar → Classrooms → pick classroom → Assignments tab (3–4 clicks), and you can only see assignments *one classroom at a time* — there is no cross-classroom "all my assignments / all to grade" surface in navigation.
- Nielsen: **flexibility & efficiency** violated (no keyboard/quick way to jump to a domain); **recognition over recall** violated (user must remember which classroom an assignment lives in).

### A3 — Admin detached shell; command palette orphaned; global search dead  · B (search · consistency · hidden features)
- Every admin view `extends ./layouts/admin` (`admin.pug`) except the broken one below. `admin.pug:22-90` is a *separate* inline sidebar (`admin-nav-link`) and topbar with a `Search... ⌘K` button at `admin.pug:106` that is **not wired** — no `data-cmd-palette`, no overlay. `⌘K` does nothing for admins.
- `base.pug:84-105` & `base.pug:242+` carry a full role-aware Cmd/Ctrl+K command palette that admin never loads.
- `views/layouts/partials/sidebar-admin.pug` (rich `shell-sidebar-link` system) is **orphaned** — admin views don't render `base.pug`, so it appears nowhere.
- Nielsen: **consistency & standards** violated — admin feels like a different product; **flexibility & efficiency** (no quick-nav/search in admin).

### A4 — Broken layout extend: `audit-log.pug` uses the base shell  · B
`views/admin/audit-log.pug:1` → `extends ../layouts/base` (the only admin file that does). `/admin/audit` would render under the base shell (student/teacher session/sidebar model + `sidebar-admin.pug` partial the admin shell never uses) while being gated by admin session auth — a broken hybrid. Should `extends ./layouts/admin`.

### A5 — Two mobile sidebar implementations drift apart  · M (mobile · consistency)
- Base shell: `aside.shell-sidebar#sidebar` with `.open` + overlay, toggled in `base.pug:181-207`.
- Admin shell: `#admin-sidebar` + `#mobile-overlay`, toggled in `admin.pug:129-141`.
Two implementations → behavior drift, double maintenance.

### A6 — Onboarding stops after first empty state  · M (onboarding)
- Student "join your first classroom" empty state exists (`student/dashboard.pug:128-135`) — good — but no hint on *where to get a code*, no first-run tour.
- Teacher "create your first classroom" exists, but after creation the teacher lands on an empty classroom with no guided next step (add a lecture? create an assignment? run attendance?). The post-creation flow is left to the user to discover.
- Admin has no empty-state guiance for a fresh install (0 users / 0 teachers / 0 classrooms show stat zeroes with no "invite your first teacher" CTA).

### A7 — Notifications inconsistently placed  · m (navigation)
- Student & teacher sidebars link `/notifications` (`sidebar-*.pug:68`). Admin sidebar has no notifications link in the admin shell's inline sidebar (`admin.pug`) — only a bell in the topbar (`admin.pug:117`). And `/admin/notifications` exists as a route but isn't in the admin nav list. Hidden feature for admin.

---

## B. Content-workflow findings (join, take-exam, create-exam, grade, live-attendance, gradebook, approve-teacher)

### B1 — Student: join a classroom by code  · (good flow, m polish)
- Path (`views/student/classrooms/index.pug`): Sidebar → Classrooms → enter code → submit. **2 clicks** to enqueue a join request. The join form is inline at the top of the Classrooms page (`:22-35`), single field, big touch target (`h-14`), auto-uppercase, `maxlength=12`. Empty-state CTA links to `#code` (`:60`).
- **m** The button reads "Tham gia Lớp học" (Join) but submission only *requests* access (status `pending`), and the page separately shows a "pending" count (`:14-17`). Label/expectation mismatch — should read "Request to join" while pending, "Joined" when approved.
- Redesign: keep inline box; relabel to Request-to-join semantics; after approval, surface a notification linking straight to the classroom.

### B2 — Teacher: grade a submission  · **B** (clicks · hidden features · hierarchy)
- The "Needs grading" entry only exists on the teacher *dashboard* ("Need Grading" card in `teacher/dashboard.pug`), and it links to `/teacher/classrooms/{cid}/assignments` — the *assignment list*, **not** the actual submission to grade. So even when the dashboard flags work due, the teacher must: dashboard → assignment list → pick assignment → submission list (`teacher/submissions/index.pug`) → "Mở bài nộp" → grade. **5 clicks** to reach the grading view from a *known* pending item.
- No cross-classroom "to-grade" queue. No batch grading (one submission per page). No keyboard shortcuts. The submission list is per-assignment, not per-teacher.
- **B (hidden features / clicks)**: a teacher cannot see "everything I need to grade" in one place.
- Redesign: add a flat `/teacher/submissions?status=pending` work-queue as a sidebar entry + dashboard deep-link; grade-in-place (inline score/comment) from the queue; keyboard `J/K` to move next/prev; mark-all-graded batch action.

### B3 — Teacher: create exam + add questions  · M (linearity · misleading copy)
- `teacher/exams/new.pug` → create → `questions.pug`. `questions.pug` surfaces manual-add **and** "Generate from Question Bank" **and** an "Import Questions" button (PDF/DOCX) inline together — discoverability is actually *good* (nothing hidden).
- **m–M** `teacher/exams/import.pug` step-3 button copy says "Tạo Bài thi" (Create Exam) but this flow imports into an **existing** exam — misleading. Mislabel wastes a step when the teacher expects a new exam.
- **M** `teacher/exams/show.pug` exposes only "Manage Questions" / "View Submissions" — no Edit-settings, no Publish/Unpublish toggle. To change deadline/status the teacher must find another page (or it isn't possible from UI at all).
- Redesign: linearize exam authoring into one stepper (Settings → Questions → Review → Publish) with a single Publish toggle on `show.pug`; fix `import.pug` button copy to "Import into this exam".

### B4 — Teacher: run a live attendance session  · (needs PIN-display verification — M until confirmed)
- Path: Sidebar → Classrooms → pick classroom → Attendance → "Open session". The PIN is generated and shown on `teacher/attendance/live.pug`; model auto-expires PIN in 15s (`AttendanceSession.generateNewCode`). The 15-second expiry forces constant teacher attention and is error-prone on projector displays; **mobile usability** of the live view + oversized back-of-room PIN is unverified.
- Redesign: show the PIN as a large, auto-refreshing display card; expose a "freeze/extend PIN" toggle; surface "Start attendance" as a one-click action from the classroom card (don't bury it under Attendance tab).

### B5 — Teacher: gradebook  · M (reachable only via classroom · mobile)
- Only reachable via Sidebar→Classrooms→pick classroom→Gradebook. Not in sidebar, not in ⌘K. Mobile: a wide score table will overflow horizontally.
- Redesign: add `/teacher/classrooms/{id}/gradebook` as a prominent classroom action; degrade to stacked rows on narrow screens; add CSV export one-click.

### B6 — Admin: approve a pending teacher  · m (good, with one gap)
- `views/admin/teachers/pending.pug` + route `/admin/teachers/pending`; the `pendingCount` badge shows in the admin sidebar's "Phê duyệt giáo viên" entry. Path from `/admin`: Sidebar → Approvals → Approve. **2 clicks**. Good.
- **m** No bulk approve; decision doesn't visibly trigger a notification/email to the teacher (unverified). Plural pending teacher UX is click-one-by-one.
- Redesign: add bulk select + "Approve selected"; confirm an in-app notification is fired on decision.

### B7 — Student: take an exam  · (verification still needed from controller)
- Route flow: Sidebar→Classrooms→pick classroom→Exams→take. Integrity guards live server-side (`examIntegrity.service`) per memory. Re-entry to a paused exam + how deadline/attempt errors are presented to the student = unverified here; carried as open item.


---

## C. Cross-role ranked priority (top friction)

1. **A2 + B2** — add flat cross-classroom routes + sidebar entries (assignments, exams, lectures, submissions/work-queue, attendance, discussions, gradebook) for student and teacher. This single change removes the 3–5-click penalty from *every* content task and creates the missing "all to grade" queue (B2). Highest leverage.
2. **A3 + A4 + A5** — unify admin onto the base shell (wire Cmd/Ctrl+K command palette to admin, fix `audit-log.pug` to `extends ./layouts/admin`, retire the duplicate admin inline sidebar/mobile implementation, activate `sidebar-admin.pug`). One-time structural fix; restores consistency + search for every admin workflow.
3. **A1** — fix dead student dashboard quick-action links (`/student/assignments`, `/student/exams`, `/student/discussions`) to point at the new flat routes from #1 — turning a 404 Blocker into a working quick path.
4. **B3 + B4 + B5** — workflow-specific redesigns: linearize exam authoring + add Publish toggle + fix import copy (B3); PIN-display + one-click start for live attendance (B4); sidebar/reachability + mobile + CSV export for gradebook (B5).
5. **A6 + B1** — onboarding rails: first-run + post-creation guidance for teachers, fresh-install CTA for admin; relabel join flow to "request" semantics (B1).
6. **B6 + B7 — polish & verify**: bulk teacher approvals + decision notifications (B6); verify exam-take error/re-entry UX (B7, carried open).

---

## D. Redesign goals (minimum-effort north star)

- Every task reachable from the sidebar or ⌘K in ≤2 clicks.
- No route referenced by any UI is dead; no route exists without a nav/CTA.
- One shell system across all three roles (topbar, sidebar, command palette, theme toggle, modal, toast).
- Mobile: one collapsing-sidebar pattern; tables degrade to stacked rows; the live-attendance PIN is oversized for back-of-room display.
- Zero-states guide the very next action, not just announce emptiness.
