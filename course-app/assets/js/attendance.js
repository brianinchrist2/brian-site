/**
 * Attendance Recording Module
 * Scriptorium Design System
 * learn.organicchurch.dpdns.org
 */

(function () {
  'use strict';

  /* ===== Constants ===== */
  var STATUS = {
    PRESENT: 'present',
    ABSENT: 'absent',
    LATE: 'late',
    EXCUSED: 'excused'
  };

  var STATUS_LABELS = {
    present: '出席',
    absent: '缺席',
    late: '迟到',
    excused: '请假'
  };

  var STATUS_COLORS = {
    present: '#2E7D32',
    absent: '#C62828',
    late: '#F9A825',
    excused: '#1565C0'
  };

  /* ===== State ===== */
  var state = {
    classes: [],
    sessions: [],
    roster: [],
    records: {},
    stats: {},
    selectedClassId: null,
    selectedSessionId: null
  };

  /* ===== Auth Helpers ===== */
  function getToken() {
    return localStorage.getItem('auth_token');
  }

  function getHeaders() {
    var token = getToken();
    var headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }
    return headers;
  }

  function requireAuth() {
    if (!getToken()) {
      window.location.href = '/login.html';
      return false;
    }
    return true;
  }

  /* ===== API: Classes ===== */
  function fetchClasses() {
    return fetch('/api/modules/classes/roster', {
      method: 'GET',
      headers: getHeaders()
    })
    .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
    .then(function (result) {
      if (!result.ok) throw new Error(result.data.error || '获取班级列表失败');
      state.classes = result.data.classes || result.data || [];
      return state.classes;
    });
  }

  /* ===== API: Sessions ===== */
  function fetchSessions(classId) {
    if (!classId) return Promise.resolve([]);
    return fetch('/api/modules/attendance/sessions?class_id=' + encodeURIComponent(classId), {
      method: 'GET',
      headers: getHeaders()
    })
    .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
    .then(function (result) {
      if (!result.ok) throw new Error(result.data.error || '获取课堂列表失败');
      state.sessions = result.data.sessions || result.data || [];
      return state.sessions;
    });
  }

  function createSession(payload) {
    return fetch('/api/modules/attendance/sessions', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    })
    .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
    .then(function (result) {
      if (!result.ok) throw new Error(result.data.error || '创建课堂失败');
      return result.data.session || result.data;
    });
  }

  /* ===== API: Records ===== */
  function fetchRecords(sessionId) {
    if (!sessionId) return Promise.resolve([]);
    return fetch('/api/modules/attendance/records?session_id=' + encodeURIComponent(sessionId), {
      method: 'GET',
      headers: getHeaders()
    })
    .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
    .then(function (result) {
      if (!result.ok) throw new Error(result.data.error || '获取考勤记录失败');
      var records = result.data.records || result.data || [];
      state.records[sessionId] = records;
      return records;
    });
  }

  function batchSaveRecords(sessionId, records) {
    return fetch('/api/modules/attendance/records', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ session_id: sessionId, records: records })
    })
    .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
    .then(function (result) {
      if (!result.ok) throw new Error(result.data.error || '保存考勤记录失败');
      return result.data;
    });
  }

  /* ===== API: Stats ===== */
  function fetchStats(classId) {
    if (!classId) return Promise.resolve({});
    return fetch('/api/modules/attendance/stats?class_id=' + encodeURIComponent(classId), {
      method: 'GET',
      headers: getHeaders()
    })
    .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
    .then(function (result) {
      if (!result.ok) throw new Error(result.data.error || '获取统计失败');
      state.stats = result.data.stats || result.data || {};
      return state.stats;
    });
  }

  /* ===== API: Roster ===== */
  function fetchRoster(classId) {
    if (!classId) return Promise.resolve([]);
    return fetch('/api/modules/classes/roster?class_id=' + encodeURIComponent(classId), {
      method: 'GET',
      headers: getHeaders()
    })
    .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
    .then(function (result) {
      if (!result.ok) throw new Error(result.data.error || '获取学生名单失败');
      state.roster = result.data.roster || result.data.students || result.data || [];
      return state.roster;
    });
  }

  /* ===== UI: Class Selector ===== */
  function renderClassSelector() {
    var select = document.getElementById('class-select');
    if (!select) return;
    select.innerHTML = '<option value="">-- 选择班级 --</option>';
    state.classes.forEach(function (cls) {
      var opt = document.createElement('option');
      opt.value = cls.id || cls.class_id;
      opt.textContent = cls.name || cls.class_name;
      select.appendChild(opt);
    });
    if (state.selectedClassId) {
      select.value = state.selectedClassId;
    }
  }

  /* ===== UI: Session Selector ===== */
  function renderSessionSelector() {
    var select = document.getElementById('session-select');
    if (!select) return;
    select.innerHTML = '<option value="">-- 选择课堂 --</option>';
    state.sessions.forEach(function (sess) {
      var opt = document.createElement('option');
      opt.value = sess.id || sess.session_id;
      var label = sess.title || '课堂';
      if (sess.session_date) {
        label = sess.session_date + ' ' + label;
      }
      opt.textContent = label;
      select.appendChild(opt);
    });
    if (state.selectedSessionId) {
      select.value = state.selectedSessionId;
    }
  }

  /* ===== UI: Roster Table ===== */
  function renderRosterTable() {
    var tbody = document.getElementById('roster-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!state.roster.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-state">暂无学生名单</td></tr>';
      return;
    }

    var sessionRecords = state.records[state.selectedSessionId] || [];
    var recordMap = {};
    sessionRecords.forEach(function (rec) {
      recordMap[rec.student_id || rec.studentId] = rec;
    });

    state.roster.forEach(function (student) {
      var sid = student.id || student.student_id;
      var record = recordMap[sid] || { status: null, notes: '' };
      var tr = document.createElement('tr');
      tr.setAttribute('data-student-id', sid);

      /* Name cell */
      var tdName = document.createElement('td');
      tdName.className = 'student-name';
      tdName.textContent = student.name || student.nickname || '未知';
      tr.appendChild(tdName);

      /* Status buttons cell */
      var tdStatus = document.createElement('td');
      tdStatus.className = 'status-buttons';
      [STATUS.PRESENT, STATUS.ABSENT, STATUS.LATE, STATUS.EXCUSED].forEach(function (st) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'status-btn';
        btn.setAttribute('data-status', st);
        btn.textContent = STATUS_LABELS[st];
        btn.style.setProperty('--status-color', STATUS_COLORS[st]);
        if (record.status === st) {
          btn.classList.add('active');
        }
        btn.addEventListener('click', function () {
          handleStatusClick(tr, sid, st);
        });
        tdStatus.appendChild(btn);
      });
      tr.appendChild(tdStatus);

      /* Notes cell */
      var tdNotes = document.createElement('td');
      var notesInput = document.createElement('input');
      notesInput.type = 'text';
      notesInput.className = 'notes-input';
      notesInput.placeholder = '备注';
      notesInput.value = record.notes || '';
      notesInput.setAttribute('data-student-id', sid);
      tdNotes.appendChild(notesInput);
      tr.appendChild(tdNotes);

      tbody.appendChild(tr);
    });
  }

  function handleStatusClick(rowEl, studentId, newStatus) {
    var buttons = rowEl.querySelectorAll('.status-btn');
    buttons.forEach(function (btn) {
      if (btn.getAttribute('data-status') === newStatus) {
        btn.classList.toggle('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  /* ===== UI: Stats ===== */
  function renderStats() {
    var container = document.getElementById('stats-container');
    if (!container) return;
    container.innerHTML = '';

    var stats = state.stats;
    if (!stats || (!stats.students && !Array.isArray(stats))) {
      container.innerHTML = '<p class="empty-state">暂无统计数据</p>';
      return;
    }

    var studentStats = stats.students || stats;
    if (!Array.isArray(studentStats) || !studentStats.length) {
      container.innerHTML = '<p class="empty-state">暂无统计数据</p>';
      return;
    }

    /* Summary header */
    var summary = document.createElement('div');
    summary.className = 'stats-summary';
    var totalSessions = stats.total_sessions || 0;
    var avgRate = stats.average_rate || 0;
    summary.innerHTML =
      '<div class="stat-card">' +
        '<span class="stat-value">' + totalSessions + '</span>' +
        '<span class="stat-label">总课堂数</span>' +
      '</div>' +
      '<div class="stat-card">' +
        '<span class="stat-value">' + avgRate.toFixed(1) + '%</span>' +
        '<span class="stat-label">平均出勤率</span>' +
      '</div>';
    container.appendChild(summary);

    /* Per-student table */
    var table = document.createElement('table');
    table.className = 'stats-table';
    table.innerHTML =
      '<thead><tr>' +
        '<th>学生</th>' +
        '<th>出席</th>' +
        '<th>缺席</th>' +
        '<th>迟到</th>' +
        '<th>请假</th>' +
        '<th>出勤率</th>' +
      '</tr></thead>';
    var statsBody = document.createElement('tbody');
    studentStats.forEach(function (s) {
      var tr = document.createElement('tr');
      var rate = s.attendance_rate || 0;
      var rateClass = rate >= 90 ? 'rate-high' : rate >= 70 ? 'rate-mid' : 'rate-low';
      var tdName = document.createElement('td');
      tdName.textContent = s.name || s.student_name || '未知';
      tr.appendChild(tdName);
      var tdPresent = document.createElement('td');
      tdPresent.className = 'present-count';
      tdPresent.textContent = s.present_count || 0;
      tr.appendChild(tdPresent);
      var tdAbsent = document.createElement('td');
      tdAbsent.className = 'absent-count';
      tdAbsent.textContent = s.absent_count || 0;
      tr.appendChild(tdAbsent);
      var tdLate = document.createElement('td');
      tdLate.className = 'late-count';
      tdLate.textContent = s.late_count || 0;
      tr.appendChild(tdLate);
      var tdExcused = document.createElement('td');
      tdExcused.className = 'excused-count';
      tdExcused.textContent = s.excused_count || 0;
      tr.appendChild(tdExcused);
      var tdRate = document.createElement('td');
      tdRate.className = rateClass;
      tdRate.textContent = rate.toFixed(1) + '%';
      tr.appendChild(tdRate);
      statsBody.appendChild(tr);
    });
    table.appendChild(statsBody);
    container.appendChild(table);
  }

  /* ===== UI: Session Create Modal ===== */
  function openCreateSessionModal() {
    var modal = document.getElementById('create-session-modal');
    if (modal) modal.classList.add('open');
  }

  function closeCreateSessionModal() {
    var modal = document.getElementById('create-session-modal');
    if (modal) modal.classList.remove('open');
  }

  /* ===== Event Handlers ===== */
  function handleClassChange(classId) {
    state.selectedClassId = classId;
    state.selectedSessionId = null;
    state.sessions = [];
    state.roster = [];
    state.records = {};

    renderSessionSelector();
    renderRosterTable();

    if (classId) {
      Promise.all([
        fetchSessions(classId),
        fetchRoster(classId),
        fetchStats(classId)
      ])
      .then(function () {
        renderSessionSelector();
        renderRosterTable();
        renderStats();
      })
      .catch(function (err) {
        showToast(err.message, 'error');
      });
    } else {
      renderStats();
    }
  }

  function handleSessionChange(sessionId) {
    state.selectedSessionId = sessionId;
    if (sessionId) {
      fetchRecords(sessionId)
      .then(function () {
        renderRosterTable();
      })
      .catch(function (err) {
        showToast(err.message, 'error');
      });
    } else {
      renderRosterTable();
    }
  }

  function handleCreateSession(e) {
    e.preventDefault();
    if (!state.selectedClassId) {
      showToast('请先选择班级', 'error');
      return;
    }

    var title = document.getElementById('session-title').value.trim();
    var sessionDate = document.getElementById('session-date').value;
    var startTime = document.getElementById('session-start').value;
    var endTime = document.getElementById('session-end').value;
    var courseId = document.getElementById('session-course').value.trim();

    if (!title || !sessionDate) {
      showToast('请填写课堂名称和日期', 'error');
      return;
    }

    var payload = {
      class_id: state.selectedClassId,
      title: title,
      session_date: sessionDate
    };
    if (courseId) payload.course_id = courseId;
    if (startTime) payload.start_time = startTime;
    if (endTime) payload.end_time = endTime;

    createSession(payload)
    .then(function () {
      closeCreateSessionModal();
      showToast('课堂创建成功', 'success');
      return fetchSessions(state.selectedClassId);
    })
    .then(function () {
      renderSessionSelector();
      /* Reset form */
      document.getElementById('create-session-form').reset();
    })
    .catch(function (err) {
      showToast(err.message, 'error');
    });
  }

  function handleMarkAllPresent() {
    var rows = document.querySelectorAll('#roster-tbody tr[data-student-id]');
    rows.forEach(function (row) {
      var buttons = row.querySelectorAll('.status-btn');
      buttons.forEach(function (btn) {
        if (btn.getAttribute('data-status') === STATUS.PRESENT) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    });
  }

  function handleSaveAttendance() {
    if (!state.selectedSessionId) {
      showToast('请先选择课堂', 'error');
      return;
    }

    var rows = document.querySelectorAll('#roster-tbody tr[data-student-id]');
    var records = [];
    rows.forEach(function (row) {
      var studentId = row.getAttribute('data-student-id');
      var activeBtn = row.querySelector('.status-btn.active');
      if (!activeBtn) return;
      var status = activeBtn.getAttribute('data-status');
      var notesInput = row.querySelector('.notes-input');
      var notes = notesInput ? notesInput.value.trim() : '';
      records.push({
        studentId: studentId,
        status: status,
        notes: notes
      });
    });

    if (!records.length) {
      showToast('请至少标记一名学生的出勤状态', 'error');
      return;
    }

    batchSaveRecords(state.selectedSessionId, records)
    .then(function () {
      showToast('考勤记录保存成功', 'success');
      return fetchRecords(state.selectedSessionId);
    })
    .then(function () {
      renderRosterTable();
    })
    .catch(function (err) {
      showToast(err.message, 'error');
    });
  }

  /* ===== Toast ===== */
  function showToast(msg, type) {
    var toast = document.createElement('div');
    toast.className = 'toast ' + (type || 'info');
    toast.textContent = msg;
    document.body.appendChild(toast);
    toast.offsetHeight;
    toast.classList.add('show');
    setTimeout(function () {
      toast.classList.remove('show');
      setTimeout(function () { toast.remove(); }, 300);
    }, 3000);
  }

  /* ===== Init ===== */
  function init() {
    if (!requireAuth()) return;

    /* Bind events */
    var classSelect = document.getElementById('class-select');
    if (classSelect) {
      classSelect.addEventListener('change', function () {
        handleClassChange(this.value);
      });
    }

    var sessionSelect = document.getElementById('session-select');
    if (sessionSelect) {
      sessionSelect.addEventListener('change', function () {
        handleSessionChange(this.value);
      });
    }

    var createSessionBtn = document.getElementById('create-session-btn');
    if (createSessionBtn) {
      createSessionBtn.addEventListener('click', openCreateSessionModal);
    }

    var closeModalBtn = document.getElementById('close-modal-btn');
    if (closeModalBtn) {
      closeModalBtn.addEventListener('click', closeCreateSessionModal);
    }

    var createForm = document.getElementById('create-session-form');
    if (createForm) {
      createForm.addEventListener('submit', handleCreateSession);
    }

    var markAllBtn = document.getElementById('mark-all-present-btn');
    if (markAllBtn) {
      markAllBtn.addEventListener('click', handleMarkAllPresent);
    }

    var saveBtn = document.getElementById('save-attendance-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', handleSaveAttendance);
    }

    var refreshStatsBtn = document.getElementById('refresh-stats-btn');
    if (refreshStatsBtn) {
      refreshStatsBtn.addEventListener('click', function () {
        if (state.selectedClassId) {
          fetchStats(state.selectedClassId)
          .then(function () { renderStats(); })
          .catch(function (err) { showToast(err.message, 'error'); });
        }
      });
    }

    /* Close modal on overlay click */
    var modalOverlay = document.getElementById('create-session-modal');
    if (modalOverlay) {
      modalOverlay.addEventListener('click', function (e) {
        if (e.target === modalOverlay) closeCreateSessionModal();
      });
    }

    /* Load classes */
    fetchClasses()
    .then(function () {
      renderClassSelector();
    })
    .catch(function (err) {
      showToast(err.message, 'error');
    });
  }

  /* ===== Boot ===== */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
