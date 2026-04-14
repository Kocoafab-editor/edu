# AI Accompany LMS Prototype Design

- Date: 2026-04-14
- Status: Approved in terminal discussion
- Scope: `ai_accompany/` static LMS prototype for GitHub Pages
- Primary Goal: replace the dashboard-first concept with a role-based LMS flow prototype driven by dummy JSON data
- Excluded: backend API, real database, Google Drive API integration, production authentication

## 1. Summary

`ai_accompany/` is no longer a simple progress dashboard. The immediate target is a static LMS-style prototype that demonstrates the end-to-end flow for three roles: student, instructor, and admin.

The first delivery is a GitHub Pages-compatible frontend built with plain HTML, CSS, and vanilla JavaScript. It uses folder-based routing with separate HTML entry points, a shared dummy JSON dataset, and common rendering/auth helpers so the prototype behaves like a lightweight product walkthrough rather than a one-page mockup.

## 2. Goals

- Show the LMS information architecture before backend and DB work begins
- Support three role-based flows with different permissions and entry screens
- Keep the prototype deployable as static files on GitHub Pages
- Define one canonical dummy dataset that covers users, organization hierarchy, modules, lessons, and student progress
- Reuse useful parts of the existing `ai_accompany` dashboard styling and interaction patterns where that saves time
- Keep the frontend structure close enough to future service architecture that the data model can later map to API and DB tables

## 3. Non-Goals

- Real user management, hashing, or secure authentication
- Real Google Drive upload integration or file inspection
- Full LMS authoring tools for editing programs during runtime
- Admin-side progress editing
- Final production IA for every subpage and edge case
- Full responsive design system beyond what is needed for credible desktop/mobile prototype review

## 4. Product Context

The LMS prototype must represent this hierarchy:

- 17 regions
- schools separated by school level (`middle`, `high`)
- each school can contain up to 2 clubs
- each club can contain multiple teams
- each team contains multiple students

Learning content is shared at the school-level program structure:

- 4 modules
- 12 lessons total
- lesson counts per module must remain structurally flexible, even if the dummy dataset uses `3 + 3 + 3 + 3` for now

Each lesson includes:

- lesson title
- learning topic
- Google Drive link for assignment submission
- instructor feedback field
- progress/evaluation status stored in LMS-side data rather than Google Drive

## 5. Roles and Permissions

## 5.1 Student

After login, the student sees their own course entry and can navigate to their student detail page.

Student permissions:

- read only their own profile and learning progress
- read module and lesson information
- open the lesson's Google Drive link in a new tab
- read instructor feedback
- no access to evaluation editing

## 5.2 Instructor

After login, the instructor sees only their assigned school/club/team context.

Instructor permissions:

- read team overview and student lists for assigned teams
- enter individual student pages and lesson pages
- access the evaluation page
- update lesson progress/evaluation in prototype mode if the implementation cost stays low enough

## 5.3 Admin

After login, the admin sees global overview and organization detail pages across all regions.

Admin permissions:

- read all organization structures and progress states
- open team, student, and lesson pages in read-only mode
- no editing of evaluation state

## 6. Information Architecture

The route count can expand later, but for the prototype the structure should be kept compact and legible.

Recommended folder-based routes:

- `ai_accompany/login/index.html`
- `ai_accompany/admin/overview/index.html`
- `ai_accompany/admin/schools/index.html`
- `ai_accompany/instructor/index.html`
- `ai_accompany/team/index.html`
- `ai_accompany/student-home/index.html`
- `ai_accompany/student/index.html`
- `ai_accompany/lesson/index.html`
- `ai_accompany/evaluation/index.html`

Route behavior:

- `login` is always the first entry point
- role-based redirect happens after successful dummy login
- entity detail pages use query parameters such as `?teamId=...`, `?studentId=...`, `?lessonId=...`

## 7. Page Definitions

## 7.1 Login Page

Purpose:

- accept dummy `id / password`
- simulate session creation
- route to the correct landing page by `role`

Dummy users:

- 1 admin
- 1 instructor
- 1 student

## 7.2 Admin Overview Page

Purpose:

- replace the old dashboard-first landing with an LMS admin summary

Content:

- top KPI area for participating school count and team count
- overall module progress for the full program
- separated middle/high school dashboard blocks
- school-level counts and module averages by school level

Explicitly removed from the old dashboard:

- region-average-first presentation as the primary content block

## 7.3 Admin Schools Page

Purpose:

- explore the organization tree in a read-only manner

Content:

- region filter
- school-level filter (`middle`, `high`)
- school list
- per-school accordion expanding to clubs
- club rows expanding or linking to teams
- access path toward student detail pages

Rules:

- admin can inspect but not edit evaluations

## 7.4 Instructor Main Page

Purpose:

- show the instructor's assigned school and club context

Content:

- instructor identity summary
- assigned school and club metadata
- list of teams shown in an overlay panel or adjacent card panel

## 7.5 Team Page

Purpose:

- show one team's overall status

Content:

- team name
- team activity theme
- total progress
- module-level progress summary
- student list rendered as a table
- each student row shows module progress values and links to the student page

## 7.6 Student Home Page

Purpose:

- provide a role-appropriate landing page for the logged-in student before entering the full student profile

Content:

- current course summary
- quick action leading to the student's main page

## 7.7 Student Page

Purpose:

- show a student's full LMS journey

Content:

- profile summary
- total progress
- 4 module sections
- lesson list grouped by module
- lesson-by-lesson progress state

This page is accessible:

- as self-view for student
- as guided view for instructor
- as read-only inspection for admin

## 7.8 Lesson Page

Purpose:

- show lesson-specific context and actions

Content:

- lesson title
- lesson topic summary
- Google Drive submission link
- instructor feedback
- progress state
- evaluation button visible to instructors only

## 7.9 Evaluation Page

Purpose:

- allow instructors to review and update lesson evaluation state

Content:

- student identity and lesson context
- current status
- feedback text area or compact summary input
- progress selection UI

Implementation rule:

- base requirement is read-centered demo flow
- if the cost is small, use `localStorage` to preserve evaluation changes locally in the browser
- if time pressure is meaningful, keep the screen interactive-looking but non-persistent

## 8. Data Model

The prototype should use one canonical JSON file: `ai_accompany/data/lms-data.json`.

High-level top-level structure:

- `users`
- `catalog`
- `organizations`
- `progress`

## 8.1 users

Each user record includes:

- `id`
- `password`
- `role`
- optional linkage keys such as `schoolId`, `clubId`, `teamId`, `studentId`

The dummy student account must map to a real student entity inside the organizations/progress dataset.

## 8.2 catalog

Contains static definitions shared across the prototype:

- `regions`: all 17 regions
- `schoolLevels`: `middle`, `high`
- `modules`: 4 module definitions
- `lessons`: 12 lesson definitions

Module records should own `lessonIds` arrays so the system can later support unequal lesson counts per module without redesigning the data model.

## 8.3 organizations

Contains the hierarchy:

- `schools`
- `clubs`
- `teams`
- `students`

Prototype volume:

- 2 schools total
- one middle school
- one high school
- 3 clubs total
- at least 1 team per club
- about 5 students per school-side sample, enough to make the team and student pages feel real

Linking strategy:

- school has `region`, `schoolLevel`, `clubIds`
- club has `schoolId`, `teamIds`
- team has `clubId`, `studentIds`, `theme`
- student has `teamId` and profile metadata

## 8.4 progress

Progress must be stored at the student level as the source of truth.

Each student progress record includes:

- `studentId`
- `overallProgress`
- `moduleProgress`
- `lessonProgress`

Each lesson progress entry includes:

- `lessonId`
- `status`
- `feedback`
- `driveUrl`
- optional evaluation metadata such as `updatedAt` or `scoreLabel`

Aggregate values for teams, schools, school levels, and the global dashboard should be derived in JavaScript at render time rather than duplicated in JSON.

## 9. Frontend Architecture

The frontend should use separate HTML pages with shared JavaScript modules.

Recommended structure:

- `ai_accompany/shared/styles/`
- `ai_accompany/shared/scripts/data-store.js`
- `ai_accompany/shared/scripts/auth.js`
- `ai_accompany/shared/scripts/router-helpers.js`
- `ai_accompany/shared/scripts/ui.js`
- `ai_accompany/shared/scripts/pages/*.js`

Responsibility split:

- page HTML files define layout containers and load page-specific scripts
- shared scripts handle data loading, auth/session, derived progress calculation, guard logic, and common rendering
- shared CSS handles shell layout, cards, filters, badges, tables, and progress visuals

## 10. Session and Access Rules

Use lightweight browser session storage for the dummy prototype.

Requirements:

- successful login writes the minimal current-user session object
- protected pages redirect back to `login` if no session exists
- page scripts enforce role checks before rendering
- admin pages reject student and instructor sessions
- evaluation page rejects student and admin sessions
- student self-view should guard against browsing other student records by URL when the logged-in role is `student`

## 11. Visual Direction

The prototype should not look like a raw wireframe dump. It needs enough polish to explain the product direction quickly, but speed remains more important than perfect design depth.

Visual guidance:

- reuse the stronger parts of the existing dashboard shell where practical
- keep cards, filters, accordions, overlays, tables, and progress bars visually consistent
- optimize for quick comprehension of hierarchy and status
- preserve readability on both desktop and mobile

The UI should feel like a structured LMS prototype, not a spreadsheet pasted into HTML.

## 12. Delivery Strategy

Implementation should proceed in this order:

1. define the dummy JSON model
2. build shared data/auth helpers
3. stand up login and role redirects
4. build admin overview and admin schools flows
5. build instructor, team, and student flows
6. build lesson and evaluation screens
7. connect links across the full navigation path
8. verify GitHub Pages static behavior

This order keeps the prototype reviewable from the earliest possible stage while ensuring the JSON schema drives the UI instead of the other way around.

## 13. Risks and Tradeoffs

- If per-page scripts duplicate logic, maintenance cost will rise quickly; shared helpers are required even for a prototype.
- If aggregate progress is hardcoded in the dataset, future changes will become inconsistent across pages; derived metrics should remain computed.
- If local persistence is overbuilt too early, it will distract from the main goal; evaluation persistence should remain optional and lightweight.
- If the route structure is made too granular now, implementation speed will drop without adding meaningful review value; compact routing with strong internal component separation is the right balance for this phase.

## 14. Open Decisions Locked for This Prototype

The following decisions are considered fixed for the first implementation pass:

- entry page is always the login page
- deployment target is static GitHub Pages
- routing style is folder-based multi-page HTML
- dummy data lives in a single canonical JSON file
- current sample module structure uses 4 modules and 12 lessons
- lesson submission destination is shown as a Google Drive link, not implemented as upload storage in-app
- admin remains read-only for evaluation
- instructor evaluation persistence is optional and should be cut if it meaningfully slows implementation
