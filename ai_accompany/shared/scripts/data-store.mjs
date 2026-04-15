const STATUS_META = {
  'not-started': { label: '미진행', weight: 0 },
  'in-progress': { label: '진행 중', weight: 40 },
  'submitted': { label: '제출 완료', weight: 70 },
  'completed': { label: '평가 완료', weight: 100 },
};

function average(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length);
}

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

function keyBy(items) {
  return new Map((items || []).map((item) => [item.id, item]));
}

function getLessonWeight(status) {
  return (STATUS_META[status] || STATUS_META['not-started']).weight;
}

export function getStatusMeta(status) {
  return STATUS_META[status] || STATUS_META['not-started'];
}

export function getStatusOptions() {
  return Object.entries(STATUS_META).map(([value, meta]) => ({
    value,
    label: meta.label,
    weight: meta.weight,
  }));
}

function ensureLessonProgressRecord(data, studentId) {
  const existing = (data.progress || []).find((record) => record.studentId === studentId);
  if (existing) return existing;
  return {
    studentId,
    lessonProgress: (data.catalog?.lessons || []).map((lesson) => ({
      lessonId: lesson.id,
      status: 'not-started',
      feedback: '',
    })),
  };
}

function buildContext(data) {
  const schools = data.organizations?.schools || [];
  const clubs = data.organizations?.clubs || [];
  const teams = data.organizations?.teams || [];
  const students = data.organizations?.students || [];
  const modules = data.catalog?.modules || [];
  const lessons = data.catalog?.lessons || [];

  return {
    data,
    schools,
    clubs,
    teams,
    students,
    modules,
    lessons,
    schoolsById: keyBy(schools),
    clubsById: keyBy(clubs),
    teamsById: keyBy(teams),
    studentsById: keyBy(students),
    modulesById: keyBy(modules),
    lessonsById: keyBy(lessons),
    schoolLevelLabels: new Map((data.catalog?.schoolLevels || []).map((item) => [item.id, item.label])),
    progressByStudentId: new Map((data.progress || []).map((item) => [item.studentId, item])),
  };
}

function getSchoolLevelLabel(context, schoolLevel) {
  return context.schoolLevelLabels.get(schoolLevel) || schoolLevel;
}

function getProgressRecord(context, studentId) {
  return context.progressByStudentId.get(studentId) || ensureLessonProgressRecord(context.data, studentId);
}

function getLessonState(context, studentId, lessonId) {
  const lesson = context.lessonsById.get(lessonId);
  const progressRecord = getProgressRecord(context, studentId);
  const progressEntry = (progressRecord.lessonProgress || []).find((item) => item.lessonId === lessonId) || {
    lessonId,
    status: 'not-started',
    feedback: '',
  };
  const statusMeta = getStatusMeta(progressEntry.status);

  return {
    id: lesson.id,
    moduleId: lesson.moduleId,
    order: lesson.order,
    title: lesson.title,
    topic: lesson.topic,
    driveUrl: lesson.driveUrl,
    status: progressEntry.status,
    statusLabel: statusMeta.label,
    progress: getLessonWeight(progressEntry.status),
    feedback: progressEntry.feedback || '',
  };
}

function getStudentContext(context, studentId) {
  const student = context.studentsById.get(studentId);
  if (!student) {
    throw new Error(`Unknown student: ${studentId}`);
  }

  const team = context.teamsById.get(student.teamId);
  const club = team ? context.clubsById.get(team.clubId) : null;
  const school = team ? context.schoolsById.get(team.schoolId) : null;

  return {
    student,
    team,
    club,
    school,
  };
}

function buildStudentSummary(context, studentId) {
  const { student, team, club, school } = getStudentContext(context, studentId);
  const modules = context.modules.map((module) => {
    const lessons = module.lessonIds.map((lessonId) => getLessonState(context, studentId, lessonId));
    return {
      id: module.id,
      title: module.title,
      progress: average(lessons.map((lesson) => lesson.progress)),
      lessons,
    };
  });

  return {
    student: {
      ...student,
      teamName: team?.name || '',
      clubName: club?.name || '',
      schoolName: school?.name || '',
      region: school?.region || '',
      schoolLevel: school?.schoolLevel || '',
      schoolLevelLabel: getSchoolLevelLabel(context, school?.schoolLevel || ''),
    },
    team,
    club,
    school,
    modules,
    overallProgress: average(modules.map((module) => module.progress)),
  };
}

export async function loadLmsData(rootPath = '.', options = {}) {
  const normalizedRoot = String(rootPath || '.').replace(/\/+$/, '') || '.';
  const href = normalizedRoot === '.' ? './data/lms-data.json' : `${normalizedRoot}/data/lms-data.json`;
  const response = await fetch(href, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load LMS data: ${response.status}`);
  }
  const data = await response.json();
  return options.overrides ? mergeEvaluationOverrides(data, options.overrides) : data;
}

export function mergeEvaluationOverrides(data, overrides = []) {
  const next = cloneData(data);

  (overrides || []).forEach((override) => {
    const record = ensureLessonProgressRecord(next, override.studentId);
    if (!next.progress.find((item) => item.studentId === override.studentId)) {
      next.progress.push(record);
    }

    const lessonEntry =
      record.lessonProgress.find((item) => item.lessonId === override.lessonId) ||
      (() => {
        const created = { lessonId: override.lessonId, status: 'not-started', feedback: '' };
        record.lessonProgress.push(created);
        return created;
      })();

    if (override.status) lessonEntry.status = override.status;
    if (Object.prototype.hasOwnProperty.call(override, 'feedback')) {
      lessonEntry.feedback = override.feedback || '';
    }
  });

  return next;
}

export function applyEvaluationOverride(data, override) {
  return mergeEvaluationOverrides(data, [override]);
}

export function buildAdminOverviewModel(data) {
  const context = buildContext(data);
  const studentSummaries = context.students.map((student) => buildStudentSummary(context, student.id));

  return {
    kpis: {
      schoolCount: context.schools.length,
      clubCount: context.clubs.length,
      teamCount: context.teams.length,
      studentCount: context.students.length,
    },
    moduleSummaries: context.modules.map((module) => {
      const progress = average(
        studentSummaries.map((summary) => summary.modules.find((item) => item.id === module.id)?.progress || 0)
      );
      return {
        id: module.id,
        title: module.title,
        progress,
        note: `${module.lessonIds.length}개 차시`,
      };
    }),
    schoolLevels: (data.catalog?.schoolLevels || []).map((level) => {
      const schools = context.schools.filter((school) => school.schoolLevel === level.id);
      const schoolIds = new Set(schools.map((school) => school.id));
      const teams = context.teams.filter((team) => schoolIds.has(team.schoolId));
      const teamIds = new Set(teams.map((team) => team.id));
      const students = context.students.filter((student) => teamIds.has(student.teamId));
      const studentModels = students.map((student) => buildStudentSummary(context, student.id));

      return {
        schoolLevel: level.id,
        label: level.label,
        schoolCount: schools.length,
        teamCount: teams.length,
        studentCount: students.length,
        moduleProgress: context.modules.map((module) => ({
          id: module.id,
          title: module.title,
          progress: average(
            studentModels.map((summary) => summary.modules.find((item) => item.id === module.id)?.progress || 0)
          ),
        })),
      };
    }),
  };
}

export function buildAdminSchoolsModel(data, filters = {}) {
  const context = buildContext(data);
  const selectedRegion = filters.region || 'all';
  const selectedSchoolLevel = filters.schoolLevel || 'all';

  const schools = context.schools
    .filter((school) => (selectedRegion === 'all' ? true : school.region === selectedRegion))
    .filter((school) => (selectedSchoolLevel === 'all' ? true : school.schoolLevel === selectedSchoolLevel))
    .map((school) => {
      const clubs = (school.clubIds || [])
        .map((clubId) => context.clubsById.get(clubId))
        .filter(Boolean)
        .map((club) => {
          const teams = (club.teamIds || [])
            .map((teamId) => buildTeamPageModel(data, teamId))
            .map((teamModel) => ({
              id: teamModel.team.id,
              name: teamModel.team.name,
              theme: teamModel.team.theme,
              studentCount: teamModel.students.length,
              progress: teamModel.totalProgress,
              students: teamModel.students.map((student) => ({
                id: student.id,
                name: student.name,
                overallProgress: student.overallProgress,
              })),
            }));

          return {
            id: club.id,
            name: club.name,
            teamCount: teams.length,
            teams,
          };
        });

      const teams = clubs.flatMap((club) => club.teams);
      const progress = average(teams.map((team) => team.progress));

      return {
        id: school.id,
        name: school.name,
        region: school.region,
        schoolLevel: school.schoolLevel,
        schoolLevelLabel: getSchoolLevelLabel(context, school.schoolLevel),
        teamCount: teams.length,
        studentCount: teams.reduce((sum, team) => sum + team.studentCount, 0),
        progress,
        clubs,
      };
    });

  const groupedRegions = (data.catalog?.regions || [])
    .map((region) => ({
      name: region,
      schools: schools.filter((school) => school.region === region),
    }))
    .filter((region) => region.schools.length > 0);

  const clubEntries = groupedRegions.flatMap((region) =>
    region.schools.flatMap((school) =>
      school.clubs.map((club) => ({
        ...club,
        schoolId: school.id,
        schoolName: school.name,
        schoolLevelLabel: school.schoolLevelLabel,
        region: school.region,
      }))
    )
  );

  return {
    filters: {
      regions: data.catalog?.regions || [],
      schoolLevels: data.catalog?.schoolLevels || [],
      selectedRegion,
      selectedSchoolLevel,
    },
    regions: groupedRegions,
    clubEntries,
  };
}

export function buildInstructorHomeModel(data, sessionUser) {
  const context = buildContext(data);
  const requestedTeamIds =
    Array.isArray(sessionUser?.teamIds) && sessionUser.teamIds.length > 0
      ? sessionUser.teamIds
      : sessionUser?.teamId
        ? [sessionUser.teamId]
        : [];

  const teamIds = requestedTeamIds.length
    ? requestedTeamIds
    : context.teams
        .filter((team) => (sessionUser?.clubId ? team.clubId === sessionUser.clubId : true))
        .filter((team) => (sessionUser?.schoolId ? team.schoolId === sessionUser.schoolId : true))
        .map((team) => team.id);

  const teams = teamIds.map((teamId) => buildTeamPageModel(data, teamId));
  const firstTeam = teams[0]?.team || null;
  const school = firstTeam ? context.schoolsById.get(firstTeam.schoolId) : context.schoolsById.get(sessionUser?.schoolId);
  const club = firstTeam ? context.clubsById.get(firstTeam.clubId) : context.clubsById.get(sessionUser?.clubId);

  return {
    instructor: sessionUser,
    school: school
      ? {
          ...school,
          schoolLevelLabel: getSchoolLevelLabel(context, school.schoolLevel),
        }
      : null,
    club,
    teams: teams.map((teamModel) => ({
      id: teamModel.team.id,
      name: teamModel.team.name,
      theme: teamModel.team.theme,
      studentCount: teamModel.students.length,
      totalProgress: teamModel.totalProgress,
    })),
  };
}

export function buildTeamPageModel(data, teamId) {
  const context = buildContext(data);
  const team = context.teamsById.get(teamId);
  if (!team) {
    throw new Error(`Unknown team: ${teamId}`);
  }

  const club = context.clubsById.get(team.clubId);
  const school = context.schoolsById.get(team.schoolId);
  const studentModels = (team.studentIds || []).map((studentId) => buildStudentSummary(context, studentId));
  const moduleBreakdowns = context.modules.map((module) => {
    const rows = studentModels.map((summary) => {
      const moduleSummary = summary.modules.find((item) => item.id === module.id);

      return {
        studentId: summary.student.id,
        name: summary.student.name,
        gradeLabel: summary.student.gradeLabel,
        number: summary.student.number,
        moduleProgress: moduleSummary?.progress || 0,
        lessons: (moduleSummary?.lessons || []).map((lesson) => ({
          id: lesson.id,
          title: lesson.title,
          topic: lesson.topic,
          status: lesson.status,
          statusLabel: lesson.statusLabel,
          progress: lesson.progress,
          feedback: lesson.feedback,
        })),
      };
    });

    return {
      id: module.id,
      title: module.title,
      lessonCount: module.lessonIds.length,
      progress: average(rows.map((row) => row.moduleProgress)),
      lessons: module.lessonIds.map((lessonId) => {
        const lesson = context.lessonsById.get(lessonId);
        return {
          id: lesson.id,
          title: lesson.title,
          topic: lesson.topic,
          order: lesson.order,
        };
      }),
      rows,
    };
  });

  return {
    team: {
      ...team,
      clubName: club?.name || '',
      schoolName: school?.name || '',
      region: school?.region || '',
      schoolLevelLabel: getSchoolLevelLabel(context, school?.schoolLevel || ''),
    },
    totalProgress: average(studentModels.map((student) => student.overallProgress)),
    moduleProgress: context.modules.map((module) => ({
      id: module.id,
      title: module.title,
      progress: average(
        studentModels.map((summary) => summary.modules.find((item) => item.id === module.id)?.progress || 0)
      ),
    })),
    moduleBreakdowns,
    students: studentModels.map((summary) => ({
      id: summary.student.id,
      name: summary.student.name,
      gradeLabel: summary.student.gradeLabel,
      number: summary.student.number,
      overallProgress: summary.overallProgress,
      moduleProgress: summary.modules.map((module) => ({
        id: module.id,
        title: module.title,
        progress: module.progress,
      })),
    })),
  };
}

export function buildStudentHomeModel(data, sessionUser) {
  const model = buildStudentPageModel(data, sessionUser.studentId);
  return {
    student: model.student,
    modules: model.modules,
    overallProgress: model.overallProgress,
  };
}

export function buildStudentPageModel(data, studentId) {
  const context = buildContext(data);
  const summary = buildStudentSummary(context, studentId);

  return {
    student: summary.student,
    overallProgress: summary.overallProgress,
    modules: summary.modules,
  };
}

export function buildLessonPageModel(data, studentId, lessonId, role = 'student') {
  const context = buildContext(data);
  const summary = buildStudentSummary(context, studentId);
  const lesson = summary.modules
    .flatMap((module) =>
      module.lessons.map((item) => ({
        ...item,
        moduleTitle: module.title,
        moduleId: module.id,
      }))
    )
    .find((item) => item.id === lessonId);

  if (!lesson) {
    throw new Error(`Unknown lesson: ${lessonId}`);
  }

  return {
    student: summary.student,
    lesson,
    permissions: {
      canEvaluate: role === 'instructor',
    },
  };
}

export function canAccessTeam(data, sessionUser, teamId) {
  if (!sessionUser) return false;
  if (sessionUser.role === 'admin') return true;
  if (sessionUser.role !== 'instructor') return false;

  const context = buildContext(data);
  const team = context.teamsById.get(teamId);
  if (!team) return false;

  if (Array.isArray(sessionUser.teamIds) && sessionUser.teamIds.includes(teamId)) return true;
  if (sessionUser.teamId && sessionUser.teamId === teamId) return true;
  if (sessionUser.clubId && sessionUser.clubId === team.clubId) return true;
  if (sessionUser.schoolId && sessionUser.schoolId === team.schoolId) return true;
  return false;
}

export function canAccessStudent(data, sessionUser, studentId) {
  if (!sessionUser) return false;
  if (sessionUser.role === 'admin') return true;

  const context = buildContext(data);
  const student = context.studentsById.get(studentId);
  if (!student) return false;

  if (sessionUser.role === 'student') {
    return sessionUser.studentId === studentId;
  }

  if (sessionUser.role === 'instructor') {
    return canAccessTeam(data, sessionUser, student.teamId);
  }

  return false;
}
