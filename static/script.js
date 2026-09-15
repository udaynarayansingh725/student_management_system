/* ============================================================
   Studently - College Management Frontend
   ============================================================ */

const alertBox = document.getElementById("alertBox");
const loginView = document.getElementById("loginView");
const appView = document.getElementById("appView");
const tabNav = document.getElementById("tabNav");
const content = document.getElementById("content");

let token = localStorage.getItem("token") || "";
let role = localStorage.getItem("role") || "";
let fullName = localStorage.getItem("fullName") || "";
let currentTab = "";

/* ---------- Utilities ---------- */

function showAlert(message, type = "success") {
    alertBox.className = `alert alert-${type}`;
    alertBox.textContent = message;
    clearTimeout(showAlert._t);
    showAlert._t = setTimeout(() => { alertBox.className = "alert hidden"; }, 3200);
}

async function api(path, method = "GET", body = null) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(path, {
        method,
        headers,
        body: body ? JSON.stringify(body) : null,
    });
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (res.status === 401) {
        logout();
        throw new Error("Session expired");
    }
    if (!res.ok) {
        const msg = (data && (data.detail || data.error)) || "Request failed";
        throw new Error(typeof msg === "object" ? JSON.stringify(msg) : msg);
    }
    return data;
}

function esc(s) {
    return String(s == null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
}

function card(title, inner, icon = "folder") {
    return el(`<div class="glass-card"><div class="card-header">
        <span class="card-icon"><i data-lucide="${icon}"></i></span><h3>${esc(title)}</h3></div>
        ${inner}</div>`);
}

function refreshIcons() { if (typeof lucide !== "undefined") lucide.createIcons(); }

function renderTable(headers, rows, emptyColspan) {
    if (!rows || rows.length === 0) {
        return `<div class="table-responsive"><table><thead></thead><tbody>
            <tr><td colspan="${emptyColspan || headers.length}" class="empty-row">No records found</td></tr>
            </tbody></table></div>`;
    }
    const head = headers.map(h => { const c = h.colspan ? ` colspan="${h.colspan}"` : ""; return `<th${c}>${esc(h.label)}</th>`; }).join("");
    const body = rows.map(r => `<tr>${r}</tr>`).join("");
    return `<div class="table-responsive"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function btnDanger(label, onclick, id) {
    return `<button class="btn btn-danger" id="${id || ''}" onclick="${onclick}"><i data-lucide="trash-2"></i> ${esc(label)}</button>`;
}

function badge(text, tone = "grey") {
    const tones = { grey: "g", green: "A", blue: "B", amber: "C", red: "F", orange: "D" };
    return `<span class="grade-badge grade-${tones[tone] || 'g'}">${esc(text)}</span>`;
}

/* ---------- Auth ---------- */

function logout() {
    token = ""; role = ""; fullName = ""; currentTab = "";
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("fullName");
    appView.classList.add("hidden");
    loginView.classList.remove("hidden");
}

function showApp() {
    loginView.classList.add("hidden");
    appView.classList.remove("hidden");
    document.getElementById("roleBadge").textContent = role.charAt(0).toUpperCase() + role.slice(1);
    document.getElementById("userName").textContent = fullName;
    buildTabs();
}

/* ---------- Tabs ---------- */

const TAB_CONFIG = {
    admin: [
        { id: "dashboard", label: "Dashboard", icon: "layout-dashboard" },
        { id: "students", label: "Students", icon: "users" },
        { id: "teachers", label: "Teachers", icon: "presentation" },
        { id: "courses", label: "Courses", icon: "book-open" },
        { id: "subjects", label: "Subjects", icon: "library" },
        { id: "attendance", label: "Attendance", icon: "calendar-check" },
        { id: "exams", label: "Exams", icon: "file-text" },
        { id: "marks", label: "Marks", icon: "clipboard-list" },
        { id: "fees", label: "Fees", icon: "wallet" },
        { id: "notices", label: "Notices", icon: "megaphone" },
        { id: "reports", label: "Reports", icon: "bar-chart-3" },
        { id: "diagrams", label: "DFD & ER", icon: "workflow" },
        { id: "account", label: "Account", icon: "settings" },
    ],
    teacher: [
        { id: "dashboard", label: "Dashboard", icon: "layout-dashboard" },
        { id: "myattendance", label: "Attendance", icon: "calendar-check" },
        { id: "marks", label: "Marks Entry", icon: "clipboard-list" },
        { id: "results", label: "Results", icon: "bar-chart-3" },
        { id: "notices", label: "Notices", icon: "megaphone" },
        { id: "account", label: "Account", icon: "settings" },
    ],
    student: [
        { id: "dashboard", label: "Dashboard", icon: "layout-dashboard" },
        { id: "result", label: "My Result", icon: "bar-chart-3" },
        { id: "myattendance", label: "My Attendance", icon: "calendar-check" },
        { id: "fees", label: "My Fees", icon: "wallet" },
        { id: "notices", label: "Notices", icon: "megaphone" },
        { id: "account", label: "Account", icon: "settings" },
    ],
};

function buildTabs() {
    const config = TAB_CONFIG[role] || TAB_CONFIG.admin;
    tabNav.innerHTML = "";
    config.forEach(t => {
        const btn = el(`<button class="tab-btn" data-tab="${t.id}"><i data-lucide="${t.icon}"></i> ${t.label}</button>`);
        btn.addEventListener("click", () => openTab(t.id));
        tabNav.appendChild(btn);
    });
    refreshIcons();
    openTab(config[0].id);
}

function openTab(tab) {
    currentTab = tab;
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
    const renderer = RENDERERS[tab];
    if (renderer) renderer();
}

/* ============================================================
   RENDER HELPERS
   ============================================================ */

async function loadOptions() {
    const [courses, subjects, teachers, students] = await Promise.all([
        api("/api/courses"), api("/api/subjects"), api("/api/teachers"), api("/api/students"),
    ]);
    return { courses, subjects, teachers, students };
}

function select(name, options, valField, labelField, includeEmpty = true, extraClass = "") {
    const opts = (includeEmpty ? `<option value="">Select…</option>` : "") +
        options.map(o => `<option value="${esc(o[valField])}">${esc(o[labelField])}</option>`).join("");
    return `<select class="input" name="${name}" ${extraClass}>${opts}</select>`;
}

function statCards(stats) {
    return `<div class="stats-row">${stats.map(s => `
        <div class="stat-card"><div class="stat-icon ${s.tone}"><i data-lucide="${s.icon}"></i></div>
        <div><p class="stat-label">${esc(s.label)}</p><p class="stat-value">${esc(s.value)}</p></div></div>`).join("")}</div>`;
}

/* ============================================================
   DASHBOARD
   ============================================================ */

const RENDERERS = {};

RENDERERS.dashboard = async function () {
    try {
        if (role === "admin") {
            const d = await api("/api/dashboard/admin");
            content.innerHTML =
                statCards([
                    { label: "Total Students", value: d.total_students, icon: "users", tone: "blue" },
                    { label: "Total Teachers", value: d.total_teachers, icon: "presentation", tone: "violet" },
                    { label: "Courses", value: d.total_courses, icon: "book-open", tone: "amber" },
                    { label: "Subjects", value: d.total_subjects, icon: "library", tone: "green" },
                    statCardsPatch([
                        { label: "Attendance Rate", value: d.attendance_rate + "%", icon: "calendar-check", tone: "blue" },
                        { label: "Fees Collected", value: "₹" + d.fees_collected, icon: "wallet", tone: "green" },
                        { label: "Fees Pending", value: "₹" + d.fees_pending, icon: "alert-circle", tone: "red" },
                    ]),
                ]) + card("Recent Registrations", renderTable(
                    [{ label: "Name" }, { label: "Roll No" }, { label: "Registered" }],
                    d.recent_students.map(s => `<td>${esc(s.name)}</td><td>${esc(s.roll_number)}</td><td>${esc((s.created_at||'').slice(0,10))}</td>`),
                    3), "users");
        } else if (role === "student") {
            const d = await api("/api/dashboard/student");
            content.innerHTML =
                statCards([
                    { label: "Attendance", value: d.attendance_rate + "%", icon: "calendar-check", tone: "blue" },
                    { label: "Overall", value: d.percentage + "%", icon: "chart-line", tone: "violet" },
                    { label: "Grade", value: d.grade, icon: "trophy", tone: "amber" },
                    { label: "Pending Fees", value: "₹" + d.pending_fees, icon: "wallet", tone: d.pending_fees > 0 ? "red" : "green" },
                ]) +
                card("Upcoming Exams",
                    renderTable([{ label: "Exam" }, { label: "Subject" }, { label: "Date" }],
                        d.upcoming_exams.map(e => `<td>${esc(e.name)}</td><td>${esc(e.subject_name)}</td><td>${esc(e.exam_date)}</td>`), 3), "calendar")
                + card("Notices", renderNotices(d.notices), "megaphone");
        } else {
            const d = await api("/api/dashboard/teacher");
            content.innerHTML =
                card("My Profile",
                    `<p><strong>Name:</strong> ${esc(d.teacher.name)}</p>
                     <p><strong>Email:</strong> ${esc(d.teacher.email || "—")}</p>
                     <p><strong>Phone:</strong> ${esc(d.teacher.phone || "—")}</p>`, "user-check")
                + card("My Subjects",
                    renderTable([{ label: "Subject" }, { label: "Semester" }],
                        d.subjects.map(s => `<td>${esc(s.name)}</td><td>Sem ${s.semester}</td>`), 2), "library");
        }
        refreshIcons();
    } catch (e) { content.innerHTML = `<div class="glass-card">${esc(e.message)}</div>`; }
};

function statCardsPatch(extra) {
    return extra;
}

function renderNotices(notices) {
    if (!notices || !notices.length) return `<div class="empty-row">No notices</div>`;
    return `<div class="notice-list">${notices.map(n => `
        <div class="notice-item">
            <div><strong>${esc(n.title)}</strong> ${badge(n.notice_type, n.notice_type === 'important' ? 'red' : n.notice_type === 'exam' ? 'blue' : 'grey')}
            <p>${esc(n.body || "")}</p><small>${esc((n.created_at || "").slice(0, 10))}</small></div>
        </div>`).join("")}</div>`;
}

/* ============================================================
   STUDENTS (admin)
   ============================================================ */

RENDERERS.students = async function () {
    try {
        const { courses } = await loadOptions();
        const form = card("Register Student", `
            <form id="studentForm">
                <div class="form-grid">
                    <input class="input" name="name" placeholder="Full Name" required>
                    <input class="input" name="roll_number" placeholder="Roll Number" required>
                    <input class="input" name="email" placeholder="Email">
                    <input class="input" name="phone" placeholder="Phone">
                    <input class="input" name="branch" placeholder="Branch">
                    ${select("course_id", courses, "id", "name", true)}
                    <input class="input" name="semester" placeholder="Semester (1-8)" type="number" min="1">
                    <input class="input" name="username" placeholder="Login Username (default: roll)">
                    <input class="input" name="password" placeholder="Login Password (default: student123)">
                </div>
                <button type="submit" class="btn btn-primary"><i data-lucide="plus"></i> Add Student</button>
            </form>`, "user-plus");

        const filter = el(`<div class="glass-card"><div class="card-header"><span class="card-icon"><i data-lucide="search"></i></span><h3>Search & Filter Students</h3></div>
            <div class="form-grid">
                <input class="input" id="fQ" placeholder="Search by name / roll">
                ${select("", courses, "id", "name", true, 'id="fCourse"')}
                <input class="input" id="fBranch" placeholder="Branch">
                <input class="input" id="fSem" placeholder="Semester" type="number">
                <button class="btn btn-info" id="filterBtn">Apply Filter</button>
            </div></div>`);
        filter.querySelector("#filterBtn").addEventListener("click", () => renderStudentsTable());

        content.innerHTML = "";
        content.appendChild(form);
        content.appendChild(filter);
        const tableWrap = el(`<div id="studentsTable"></div>`);
        content.appendChild(tableWrap);

        content.querySelector("#studentForm").addEventListener("submit", async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const body = Object.fromEntries(fd.entries());
            try {
                const r = await api("/api/students", "POST", body);
                showAlert(`Student added — Login: ${r.username} / ${r.password}`);
                e.target.reset();
                renderStudentsTable();
            } catch (err) { showAlert(err.message, "error"); }
        });
        await renderStudentsTable();
    } catch (e) { content.innerHTML = `<div class="glass-card">${esc(e.message)}</div>`; }
};

async function renderStudentsTable() {
    const params = new URLSearchParams();
    const q = document.getElementById("fQ"); if (q && q.value.trim()) params.set("q", q.value.trim());
    const c = document.getElementById("fCourse"); if (c && c.value) params.set("course_id", c.value);
    const b = document.getElementById("fBranch"); if (b && b.value.trim()) params.set("branch", b.value.trim());
    const s = document.getElementById("fSem"); if (s && s.value) params.set("semester", s.value);
    const list = await api("/api/students/search?" + params.toString());
    const res = renderTable(
        [{ label: "Roll" }, { label: "Name" }, { label: "Course" }, { label: "Branch" }, { label: "Sem" }, { label: "" , colspan: 2 }],
        list.map(st => `<td><strong>#${esc(st.roll_number)}</strong></td><td>${esc(st.name)}</td>
            <td>${esc(st.course_name || "—")}</td><td>${esc(st.branch || "—")}</td><td>${esc(st.semester)}</td>
            <td><button class="btn btn-info" onclick="editStudent(${st.id})"><i data-lucide="pencil"></i></button></td>
            <td><button class="btn btn-danger" onclick="delStudent(${st.id}, '${esc(st.name)}')"><i data-lucide="trash-2"></i></button></td>`), 7);
    const el = document.getElementById("studentsTable");
    if (el) { el.innerHTML = res; refreshIcons(); }
}

window.delStudent = async (id, name) => {
    if (!confirm(`Delete student ${name} (and their login)?`)) return;
    try { await api(`/api/students/${id}`, "DELETE"); showAlert("Student deleted"); renderStudentsTable(); }
    catch (e) { showAlert(e.message, "error"); }
};

window.editStudent = async (id) => {
    const list = await api("/api/students");
    const st = list.find(x => x.id === id);
    const { courses } = await loadOptions();
    const wrap = el(`<div class="glass-card"><div class="card-header"><span class="card-icon"><i data-lucide="pencil"></i></span><h3>Edit Student</h3></div>
        <form id="editStudentForm"><div class="form-grid">
            <input class="input" name="name" value="${esc(st.name)}" required>
            <input class="input" name="email" value="${esc(st.email || "")}">
            <input class="input" name="phone" value="${esc(st.phone || "")}">
            <input class="input" name="branch" value="${esc(st.branch || "")}">
            ${select("course_id", courses, "id", "name", true).replace("<select", `<select data-init="${st.course_id || ''}"`)}
            <input class="input" name="semester" type="number" value="${st.semester}">
            <input class="input" name="profile_photo" placeholder="Profile photo URL" value="${esc(st.profile_photo || "")}">
        </div>
        <button type="submit" class="btn btn-primary"><i data-lucide="save"></i> Save</button>
        <button type="button" class="btn btn-secondary" id="cancelEdit">Cancel</button></form></div>`);
    const sel = wrap.querySelector("select");
    if (st.course_id) sel.value = st.course_id;
    wrap.querySelector("#cancelEdit").onclick = () => { content.querySelector(".glass-card").replaceWith(el("")); };
    content.prepend(wrap);
    wrap.querySelector("#editStudentForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const body = Object.fromEntries(new FormData(e.target).entries());
        try { await api(`/api/students/${id}`, "PUT", body); showAlert("Student updated"); wrap.remove(); renderStudentsTable(); }
        catch (err) { showAlert(err.message, "error"); }
    });
    refreshIcons();
};

   TEACHERS (admin)
  

RENDERERS.teachers = async function () {
    try {
        const form = card("Register Teacher", `
            <form id="teacherForm"><div class="form-grid">
                <input class="input" name="name" placeholder="Full Name" required>
                <input class="input" name="email" placeholder="Email">
                <input class="input" name="phone" placeholder="Phone">
                <input class="input" name="username" placeholder="Login Username">
                <input class="input" name="password" placeholder="Login Password (default: teacher123)">
            </div>
            <button type="submit" class="btn btn-primary"><i data-lucide="plus"></i> Add Teacher</button></form>`, "presentation");
        content.innerHTML = "";
        content.appendChild(form);
        const tableWrap = el(`<div id="teachersTable"></div>`);
        content.appendChild(tableWrap);
        content.querySelector("#teacherForm").addEventListener("submit", async (e) => {
            e.preventDefault();
            const body = Object.fromEntries(new FormData(e.target).entries());
            try {
                const r = await api("/api/teachers", "POST", body);
                showAlert(`Teacher added — Login: ${r.username} / ${r.password}`);
                e.target.reset();
                renderTeachersTable();
            } catch (err) { showAlert(err.message, "error"); }
        });
        await renderTeachersTable();
    } catch (e) { content.innerHTML = `<div class="glass-card">${esc(e.message)}</div>`; }
};

async function renderTeachersTable() {
    const list = await api("/api/teachers");
    const res = renderTable(
        [{ label: "Name" }, { label: "Email" }, { label: "Phone" }, { label: "Subjects" }, { label: "" }],
        list.map(t => `<td><strong>${esc(t.name)}</strong></td><td>${esc(t.email || "—")}</td><td>${esc(t.phone || "—")}</td>
            <td>${t.subjects.length ? t.subjects.map(s => badge(s.name, "blue")).join(" ") : "—"}</td>
            <td><button class="btn btn-danger" onclick="delTeacher(${t.id}, '${esc(t.name)}')"><i data-lucide="trash-2"></i></button></td>`), 5);
    const el = document.getElementById("teachersTable");
    if (el) { el.innerHTML = res; refreshIcons(); }
}

window.delTeacher = async (id, name) => {
    if (!confirm(`Delete teacher ${name} (and their login)?`)) return;
    try { await api(`/api/teachers/${id}`, "DELETE"); showAlert("Teacher deleted"); renderTeachersTable(); }
    catch (e) { showAlert(e.message, "error"); }
};

/* ============================================================
   COURSES (admin)
   ============================================================ */

RENDERERS.courses = async function () {
    const form = card("Add Course", `
        <form id="courseForm"><div class="form-grid">
            <input class="input" name="name" placeholder="Course Name" required>
            <input class="input" name="code" placeholder="Code (e.g. B.TECH)">
            <input class="input" name="duration" type="number" placeholder="Duration (semesters)" value="6">
        </div>
        <button type="submit" class="btn btn-primary"><i data-lucide="plus"></i> Add Course</button></form>`, "book-open");
    content.innerHTML = "";
    content.appendChild(form);
    const wrap = el(`<div id="coursesTable"></div>`);
    content.appendChild(wrap);
    content.querySelector("#courseForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        try { await api("/api/courses", "POST", Object.fromEntries(new FormData(e.target).entries())); showAlert("Course added"); e.target.reset(); renderCoursesTable(); }
        catch (err) { showAlert(err.message, "error"); }
    });
    await renderCoursesTable();
};

async function renderCoursesTable() {
    const list = await api("/api/courses");
    const res = renderTable([{ label: "Name" }, { label: "Code" }, { label: "Duration" }, { label: "" }],
        list.map(c => `<td><strong>${esc(c.name)}</strong></td><td>${esc(c.code || "—")}</td><td>${c.duration_semesters} sem</td>
            <td><button class="btn btn-danger" onclick="delCourse(${c.id})"><i data-lucide="trash-2"></i></button></td>`), 4);
    const el = document.getElementById("coursesTable");
    if (el) { el.innerHTML = res; refreshIcons(); }
}

window.delCourse = async (id) => {
    if (!confirm("Delete this course?")) return;
    try { await api(`/api/courses/${id}`, "DELETE"); showAlert("Course deleted"); renderCoursesTable(); }
    catch (e) { showAlert(e.message, "error"); }
};

/* ============================================================
   SUBJECTS (admin)
   ============================================================ */

RENDERERS.subjects = async function () {
    try {
        const { courses, teachers } = await loadOptions();
        const form = card("Add Subject", `
            <form id="subjectForm"><div class="form-grid">
                <input class="input" name="name" placeholder="Subject Name" required>
                ${select("course_id", courses, "id", "name")}
                <input class="input" name="semester" type="number" placeholder="Semester" min="1">
                ${select("teacher_id", teachers, "id", "name")}
            </div>
            <button type="submit" class="btn btn-primary"><i data-lucide="plus"></i> Add Subject</button></form>`, "library");
        content.innerHTML = "";
        content.appendChild(form);
        content.appendChild(el(`<div id="subjectsTable"></div>`));
        content.querySelector("#subjectForm").addEventListener("submit", async (e) => {
            e.preventDefault();
            try { await api("/api/subjects", "POST", Object.fromEntries(new FormData(e.target).entries())); showAlert("Subject added"); e.target.reset(); renderSubjectsTable(); }
            catch (err) { showAlert(err.message, "error"); }
        });
        await renderSubjectsTable();
    } catch (e) { content.innerHTML = `<div class="glass-card">${esc(e.message)}</div>`; }
};

async function renderSubjectsTable() {
    const list = await api("/api/subjects");
    const res = renderTable([{ label: "Name" }, { label: "Course" }, { label: "Sem" }, { label: "" }],
        list.map(s => `<td><strong>${esc(s.name)}</strong></td><td>${esc(s.course_name || "—")}</td><td>${s.semester}</td>
            <td><button class="btn btn-danger" onclick="delSubject(${s.id})"><i data-lucide="trash-2"></i></button></td>`), 4);
    const el = document.getElementById("subjectsTable");
    if (el) { el.innerHTML = res; refreshIcons(); }
}

window.delSubject = async (id) => {
    if (!confirm("Delete this subject? This may remove related attendance/exams.")) return;
    try { await api(`/api/subjects/${id}`, "DELETE"); showAlert("Subject deleted"); renderSubjectsTable(); }
    catch (e) { showAlert(e.message, "error"); }
};

/* ============================================================
   ATTENDANCE (admin & teacher specific)
   ============================================================ */

RENDERERS.attendance = async function () {
    try {
        const { subjects, students } = await loadOptions();
        const form = card("Mark Attendance", `
            <form id="attForm"><div class="form-grid">
                ${select("student_id", students, "id", "name")}
                ${select("subject_id", subjects, "id", "name")}
                <input class="input" name="att_date" type="date" required>
                <select class="input" name="status"><option value="present">Present</option><option value="absent">Absent</option></select>
            </div>
            <button type="submit" class="btn btn-primary"><i data-lucide="plus"></i> Save Attendance</button></form>`, "calendar-check");
        content.innerHTML = "";
        content.appendChild(form);
        content.querySelector("#attForm").addEventListener("submit", async (e) => {
            e.preventDefault();
            const b = Object.fromEntries(new FormData(e.target).entries());
            b.student_id = Number(b.student_id);
            b.subject_id = Number(b.subject_id);
            try { await api("/api/attendance", "POST", b); showAlert("Attendance saved"); e.target.reset(); renderAttendanceReport(); }
            catch (err) { showAlert(err.message, "error"); }
        });
        content.appendChild(el(`<div id="attReport"></div>`));
        await renderAttendanceReport();
    } catch (e) { content.innerHTML = `<div class="glass-card">${esc(e.message)}</div>`; }
};

RENDERERS.myattendance = async function () {
    try {
        if (role === "student") {
            const d = await api("/api/dashboard/student");
            const list = await api(`/api/attendance/students/${d.student.id}`);
            content.innerHTML = card("My Attendance", renderTable(
                [{ label: "Date" }, { label: "Subject" }, { label: "Status" }],
                list.map(a => `<td>${esc(a.att_date)}</td><td>${esc(a.subject_name)}</td><td>${badge(a.status === "present" ? "Present" : "Absent", a.status === "present" ? "green" : "red")}</td>`), 3), "calendar-check");
            refreshIcons();
            return;
        }
        // teacher: use same interface
        RENDERERS.attendance();
    } catch (e) { content.innerHTML = `<div class="glass-card">${esc(e.message)}</div>`; }
};

async function renderAttendanceReport() {
    const rows = await api("/api/attendance/report");
    const res = renderTable(
        [{ label: "Roll" }, { label: "Student" }, { label: "Subject" }, { label: "Present" }, { label: "Total" }, { label: "Percent" }],
        rows.map(r => `<td>${esc(r.roll_number)}</td><td>${esc(r.student_name)}</td><td>${esc(r.subject_name)}</td>
            <td>${r.present}</td><td>${r.total}</td><td>${badge(r.percentage + "%", r.percentage >= 75 ? "green" : r.percentage >= 60 ? "amber" : "red")}</td>`), 6);
    const el = document.getElementById("attReport");
    if (el) { el.innerHTML = res; refreshIcons(); }
}

/* ============================================================
   EXAMS (admin)
   ============================================================ */

RENDERERS.exams = async function () {
    try {
        const { subjects } = await loadOptions();
        const form = card("Create Exam", `
            <form id="examForm"><div class="form-grid">
                <input class="input" name="name" placeholder="Exam Name (e.g. Mid Term)" required>
                ${select("subject_id", subjects, "id", "name")}
                <input class="input" name="exam_date" type="date">
                <input class="input" name="total_marks" type="number" placeholder="Total Marks" value="100">
            </div>
            <button type="submit" class="btn btn-primary"><i data-lucide="plus"></i> Create Exam</button></form>`, "file-text");
        content.innerHTML = "";
        content.appendChild(form);
        content.querySelector("#examForm").addEventListener("submit", async (e) => {
            e.preventDefault();
            const b = Object.fromEntries(new FormData(e.target).entries());
            b.subject_id = Number(b.subject_id);
            try { await api("/api/exams", "POST", b); showAlert("Exam created"); e.target.reset(); renderExamsTable(); }
            catch (err) { showAlert(err.message, "error"); }
        });
        content.appendChild(el(`<div id="examsTable"></div>`));
        await renderExamsTable();
    } catch (e) { content.innerHTML = `<div class="glass-card">${esc(e.message)}</div>`; }
};

async function renderExamsTable() {
    const list = await api("/api/exams");
    const res = renderTable([{ label: "Name" }, { label: "Subject" }, { label: "Date" }, { label: "Total" }, { label: "Enter Marks" }, { label: "" }],
        list.map(e => `<td><strong>${esc(e.name)}</strong></td><td>${esc(e.subject_name || "—")}</td><td>${esc(e.exam_date || "—")}</td>
            <td>${e.total_marks}</td>
            <td><button class="btn btn-info" onclick="goEnterMarks(${e.id})"><i data-lucide="clipboard-list"></i> Marks</button></td>
            <td><button class="btn btn-danger" onclick="delExam(${e.id})"><i data-lucide="trash-2"></i></button></td>`), 6);
    const el = document.getElementById("examsTable");
    if (el) { el.innerHTML = res; refreshIcons(); }
}

window.delExam = async (id) => {
    if (!confirm("Delete this exam and its marks?")) return;
    try { await api(`/api/exams/${id}`, "DELETE"); showAlert("Exam deleted"); renderExamsTable(); }
    catch (e) { showAlert(e.message, "error"); }
};

window.goEnterMarks = (examId) => { localStorage.setItem("pendingMarkExam", examId); openTab("marks"); };

/* ============================================================
   MARKS (admin & teacher)
   ============================================================ */

RENDERERS.marks = async function () {
    try {
        const exams = await api("/api/exams");
        const pending = Number(localStorage.getItem("pendingMarkExam") || "");
        localStorage.removeItem("pendingMarkExam");
        let target = pending || (exams.length ? exams[0].id : null);

        const picker = el(`<div class="glass-card"><div class="card-header"><span class="card-icon"><i data-lucide="clipboard-list"></i></span><h3>Enter Marks</h3></div>
            <div class="form-grid">${select("", exams, "id", "name", false, 'id="examPicker"')}</div></div>`);
        content.innerHTML = "";
        content.appendChild(picker);
        content.appendChild(el(`<div id="marksEditor"></div>`));
        const pick = picker.querySelector("#examPicker");
        if (target) pick.value = target;
        pick.addEventListener("change", () => renderMarksEditor(Number(pick.value)));
        await renderMarksEditor(Number(pick.value || exams[0]?.id));
    } catch (e) { content.innerHTML = `<div class="glass-card">${esc(e.message)}</div>`; }
};

async function renderMarksEditor(examId) {
    const wrap = document.getElementById("marksEditor");
    if (!wrap || !examId) { if (wrap) wrap.innerHTML = `<div class="empty-row">No exams available</div>`; return; }
    try {
        const d = await api(`/api/marks/exam/${examId}`);
        const rows = d.rows.map(r => `<tr>
            <td>${esc(r.roll_number)}</td><td>${esc(r.name)}</td>
            <td><input class="input num-input" type="number" min="0" max="100" value="${r.internal}" data-sid="${r.student_id}" data-f="internal"></td>
            <td><input class="input num-input" type="number" min="0" max="100" value="${r.external}" data-sid="${r.student_id}" data-f="external"></td>
            <td id="tot-${r.student_id}">${r.total}</td></tr>`).join("");
        wrap.innerHTML = card(`Marks Entry — ${esc(d.exam.name)} (${esc(d.exam.subject_name || "")})`,
            `<div class="table-responsive"><table><thead><tr>
                <th>Roll</th><th>Student</th><th>Internal</th><th>External</th><th>Total</th></tr></thead>
                <tbody>${rows}</tbody></table></div>
                <button class="btn btn-success" id="saveMarksBtn">Save All Marks</button>`, "clipboard-list");

        wrap.querySelectorAll(".num-input").forEach(inp => {
            inp.addEventListener("input", () => {
                const tr = inp.closest("tr");
                const get = f => Number(tr.querySelector(`[data-f="${f}"]`).value) || 0;
                tr.querySelector(`#tot-${inp.dataset.sid}`).textContent = get("internal") + get("external");
            });
        });
        wrap.querySelector("#saveMarksBtn").addEventListener("click", async () => {
            const rows = [...wrap.querySelectorAll(".num-input")].map(inp => ({
                student_id: Number(inp.dataset.sid),
                field: inp.dataset.f,
                value: Number(inp.value) || 0,
            }));
            const grouped = {};
            rows.forEach(r => { (grouped[r.student_id] = grouped[r.student_id] || { student_id: r.student_id })[r.field] = r.value; });
            try {
                await api("/api/marks", "POST", { exam_id: examId, rows: Object.values(grouped) });
                showAlert("Marks saved");
                renderMarksEditor(examId);
            } catch (err) { showAlert(err.message, "error"); }
        });
    } catch (e) { wrap.innerHTML = `<div class="glass-card">${esc(e.message)}</div>`; }
}

/* ============================================================
   RESULT / REPORTS
   ============================================================ */

RENDERERS.result = async function () {
    try {
        const d = await api("/api/dashboard/student");
        const rows = await api("/api/marks/result");
        const mine = rows.filter(r => r.student_id === d.student.id);
        content.innerHTML =
            card("My Result",
                renderTable([{ label: "Subject" }, { label: "Obtained" }, { label: "Max" }],
                    mine.map(r => `<td>${esc(r.subject_name)}</td><td><strong>${r.subject_total}</strong></td><td>${r.exam_total}</td>`), 3)
                + `<p class="result-summary">Overall: <strong>${d.percentage}%</strong> — Grade ${badge(d.grade, d.grade)}</p>`, "bar-chart-3");
        refreshIcons();
    } catch (e) { content.innerHTML = `<div class="glass-card">${esc(e.message)}</div>`; }
};

RENDERERS.results = async function () {
    const rows = await api("/api/marks/result");
    const map = {};
    rows.forEach(r => { (map[r.student_id] = map[r.student_id] || { name: r.student_name, roll: r.roll_number, subs: [] }).subs.push(r); });
    const list = Object.values(map).map(st => {
        let totalGot = 0, totalMax = 0;
        const subTd = st.subs.map(s => { totalGot += s.subject_total; totalMax += s.exam_total; return `<td>${s.subject_total}/${s.exam_total}</td>`; }).join("");
        const pct = Math.round(100 * totalGot / (totalMax || 1));
        return `<tr><td>${esc(st.roll)}</td><td>${esc(st.name)}</td>${subTd}<td><strong>${totalGot}</strong></td><td>${badge(pct + "%", pct >= 75 ? "green" : pct >= 60 ? "amber" : "red")}</td></tr>`;
    }).join("");
    const subs = await api("/api/subjects");
    const head = subs.map(s => `<th>${esc(s.name)}</th>`).join("");
    content.innerHTML = card("Results",
        `<div class="table-responsive"><table><thead><tr><th>Roll</th><th>Name</th>${head}<th>Total</th><th>%</th></tr></thead><tbody>${list}</tbody></table></div>`, "bar-chart-3");
};

/* ============================================================
   FEES
   ============================================================ */

RENDERERS.fees = async function () {
    try {
        if (role === "student") {
            const d = await api("/api/dashboard/student");
            const fees = await api("/api/fees");
            const mine = fees.filter(f => f.student_id === d.student.id);
            content.innerHTML = card("My Fees", renderTable(
                [{ label: "Semester" }, { label: "Amount" }, { label: "Due Date" }, { label: "Status" }],
                mine.map(f => `<td>Sem ${f.semester}</td><td>₹${f.amount}</td><td>${esc(f.due_date || "—")}</td><td>${badge(f.paid ? "Paid" : "Unpaid", f.paid ? "green" : "red")}</td>`), 4), "wallet");
            refreshIcons();
            return;
        }
        const { students } = await loadOptions();
        const form = card("Add Fee", `
            <form id="feeForm"><div class="form-grid">
                ${select("student_id", students, "id", "name")}
                <input class="input" name="semester" type="number" placeholder="Semester" min="1">
                <input class="input" name="amount" type="number" placeholder="Amount (₹)" required>
                <input class="input" name="due_date" type="date">
            </div>
            <button type="submit" class="btn btn-primary"><i data-lucide="plus"></i> Add Fee</button></form>`, "wallet");
        content.innerHTML = "";
        content.appendChild(form);
        content.querySelector("#feeForm").addEventListener("submit", async (e) => {
            e.preventDefault();
            const b = Object.fromEntries(new FormData(e.target).entries());
            b.student_id = Number(b.student_id);
            b.amount = Number(b.amount);
            try { await api("/api/fees", "POST", b); showAlert("Fee added"); e.target.reset(); renderFeesTable(); }
            catch (err) { showAlert(err.message, "error"); }
        });
        content.appendChild(el(`<div id="feesTable"></div>`));
        await renderFeesTable();
    } catch (e) { content.innerHTML = `<div class="glass-card">${esc(e.message)}</div>`; }
};

async function renderFeesTable() {
    const list = await api("/api/fees");
    const res = renderTable([{ label: "Student" }, { label: "Sem" }, { label: "Amount" }, { label: "Due" }, { label: "Status" }, { label: "" }, { label: "" }],
        list.map(f => `<td><strong>${esc(f.student_name)}</strong><br><small>#${esc(f.roll_number)}</small></td><td>${f.semester}</td>
            <td>₹${f.amount}</td><td>${f.paid ? "—" : '₹' + f.due_amount}</td><td>${badge(f.paid ? "Paid" : "Unpaid", f.paid ? "green" : "red")}</td>
            <td>${f.paid ? "" : `<button class="btn btn-info" onclick="payFee(${f.id})"><i data-lucide="check"></i> Pay</button>`}</td>
            <td><button class="btn btn-danger" onclick="delFee(${f.id})"><i data-lucide="trash-2"></i></button></td>`), 7);
    const el = document.getElementById("feesTable");
    if (el) { el.innerHTML = res; refreshIcons(); }
}

window.payFee = async (id) => {
    try { await api("/api/fees/pay", "POST", { fee_id: id }); showAlert("Fee marked paid"); renderFeesTable(); }
    catch (e) { showAlert(e.message, "error"); }
};
window.delFee = async (id) => {
    if (!confirm("Delete this fee record?")) return;
    try { await api(`/api/fees/${id}`, "DELETE"); showAlert("Fee deleted"); renderFeesTable(); }
    catch (e) { showAlert(e.message, "error"); }
};

/* ============================================================
   NOTICES
   ============================================================ */

RENDERERS.notices = async function () {
    const list = await api("/api/notices");
    let html = "";
    if (role === "admin") {
        html += card("Post Notice", `
            <form id="noticeForm"><div class="form-grid">
                <input class="input" name="title" placeholder="Title" required>
                <textarea class="input" name="body" placeholder="Body" rows="3"></textarea>
                <select class="input" name="notice_type"><option value="general">General</option><option value="exam">Exam</option><option value="holiday">Holiday</option><option value="important">Important</option></select>
                <select class="input" name="audience"><option value="all">Everyone</option><option value="student">Students</option><option value="teacher">Teachers</option></select>
            </div>
            <button type="submit" class="btn btn-primary"><i data-lucide="megaphone"></i> Post Notice</button></form>`, "megaphone");
    }
    content.innerHTML = html + card("Notices", renderNotices(list), "bell");

    if (role === "admin") {
        document.getElementById("noticeForm").addEventListener("submit", async (e) => {
            e.preventDefault();
            try { await api("/api/notices", "POST", Object.fromEntries(new FormData(e.target).entries())); showAlert("Notice posted"); RENDERERS.notices(); }
            catch (err) { showAlert(err.message, "error"); }
        });
        content.querySelectorAll(".notice-item").forEach(n => {});
    }
    refreshIcons();
};

/* ============================================================
   REPORTS (admin)
   ============================================================ */

RENDERERS.reports = async function () {
    try {
        const { students, subjects } = await loadOptions();
        const btn = `<div class="ratio-bar"><button class="btn btn-info" id="repAttendance">Attendance Report</button>
            <button class="btn btn-info" id="repResult">Result Report</button>
            <button class="btn btn-info" id="repFees">Fee Report</button>
            <button class="btn btn-info" id="repStudents">Student List</button></div>`;
        const filter = `<div class="form-grid" id="repFilters">
            ${select("student", students, "id", "name", true, 'id="repStudent"')}
            ${select("subject", subjects, "id", "name", true, 'id="repSubject"')}
        </div>`;
        content.innerHTML = card("Reports", btn + filter + `<div id="repOutput"></div>`, "bar-chart-3");
        document.getElementById("repAttendance").onclick = () => reportAttendance();
        document.getElementById("repResult").onclick = () => reportResult();
        document.getElementById("repFees").onclick = () => reportFees();
        document.getElementById("repStudents").onclick = () => reportStudents();
    } catch (e) { content.innerHTML = `<div class="glass-card">${esc(e.message)}</div>`; }
};

async function reportAttendance() {
    const sid = document.getElementById("repStudent").value;
    const sub = document.getElementById("repSubject").value;
    const q = new URLSearchParams();
    if (sid) q.set("student_id", sid);
    if (sub) q.set("subject_id", sub);
    const rows = await api("/api/attendance/report?" + q.toString());
    document.getElementById("repOutput").innerHTML =
        renderTable([{ label: "Student" }, { label: "Subject" }, { label: "Present" }, { label: "Total" }, { label: "%" }],
            rows.map(r => `<td>${esc(r.student_name)} (${esc(r.roll_number)})</td><td>${esc(r.subject_name)}</td><td>${r.present}</td><td>${r.total}</td><td>${badge(r.percentage + "%", r.percentage >= 75 ? "green" : "amber")}</td>`), 5);
    refreshIcons();
}

async function reportResult() {
    const rows = await api("/api/marks/result");
    const map = {};
    rows.forEach(r => { (map[r.student_id] = map[r.student_id] || { name: r.student_name, roll: r.roll_number, subs: [], got: 0, max: 0 }).subs.push(r); (map[r.student_id].got += r.subject_total); (map[r.student_id].max += r.exam_total); });
    const list = Object.values(map).map(st => {
        const pct = Math.round(100 * st.got / (st.max || 1));
        return `<tr><td>${esc(st.roll)}</td><td>${esc(st.name)}</td><td>${st.got}</td><td>${st.max}</td><td>${badge(pct + "%", pct >= 75 ? "green" : pct >= 60 ? "amber" : "red")}</td></tr>`;
    }).join("");
    document.getElementById("repOutput").innerHTML =
        `<div class="table-responsive"><table><thead><tr><th>Roll</th><th>Name</th><th>Obtained</th><th>Max</th><th>%</th></tr></thead><tbody>${list}</tbody></table></div>`;
    refreshIcons();
}

async function reportFees() {
    const rows = await api("/api/fees");
    const total = rows.reduce((a, f) => a + f.amount, 0);
    const collected = rows.filter(f => f.paid).reduce((a, f) => a + f.amount, 0);
    document.getElementById("repOutput").innerHTML =
        `<p class="result-summary">Total Fees: <strong>₹${total}</strong> | Collected: <strong>₹${collected}</strong> | Pending: <strong>₹${total - collected}</strong></p>` +
        renderTable([{ label: "Student" }, { label: "Sem" }, { label: "Amount" }, { label: "Status" }],
            rows.map(f => `<td>${esc(f.student_name)} (${esc(f.roll_number)})</td><td>${f.semester}</td><td>₹${f.amount}</td><td>${badge(f.paid ? "Paid" : "Unpaid", f.paid ? "green" : "red")}</td>`), 4);
    refreshIcons();
}

async function reportStudents() {
    const rows = await api("/api/students");
    document.getElementById("repOutput").innerHTML =
        renderTable([{ label: "Roll" }, { label: "Name" }, { label: "Course" }, { label: "Branch" }, { label: "Sem" }],
            rows.map(s => `<td>${esc(s.roll_number)}</td><td>${esc(s.name)}</td><td>${esc(s.course_name || "—")}</td><td>${esc(s.branch || "—")}</td><td>${s.semester}</td>`), 5);
    refreshIcons();
}

/* ============================================================
   DFD & ER DIAGRAMS (visual, via Mermaid)
   ============================================================ */

function mermaidCard(title, graph, icon = "workflow") {
    return `<div class="glass-card">
        <div class="card-header"><span class="card-icon"><i data-lucide="${icon}"></i></span><h3>${esc(title)}</h3></div>
        <div class="mermaid-wrap"><pre class="mermaid">${graph}</pre></div>
        <p class="diagram-note">${graph.split("\n").length} lines</p>
    </div>`;
}

async function renderDiagrams() {
    await new Promise(res => {
        if (window.mermaid) { window.mermaid.initialize({ startOnLoad: false, theme: "base", themeVariables: { primaryColor: "#eef2ff", primaryBorderColor: "#6366f1", lineColor: "#94a3b8", fontSize: "13px" } }); }
        res();
    });

    const er = `
erDiagram
    users ||--o| students : "has account"
    users ||--o| teachers : "has account"
    courses ||--o{ subjects : "contains"
    teachers ||--o{ subjects : "teaches"
    students ||--o{ attendance : "records"
    subjects ||--o{ attendance : "for"
    subjects ||--o{ exams : "has"
    exams ||--o{ exam_marks : "scored in"
    students ||--o{ exam_marks : "scored in"
    students ||--o{ fees : "pays"
    users {
        int id PK
        varchar username UQ
        text password_hash
        varchar role
        varchar full_name
    }
    students {
        int id PK
        varchar roll_number UQ
        varchar name
        int course_id FK
        varchar branch
        int semester
    }
    courses {
        int id PK
        varchar name
        varchar code UQ
        int duration_semesters
    }
    teachers {
        int id PK
        varchar name
        varchar email UQ
    }
    subjects {
        int id PK
        varchar name
        int course_id FK
        int semester
        int teacher_id FK
    }
    attendance {
        int id PK
        int student_id FK
        int subject_id FK
        date att_date
        varchar status
    }
    exams {
        int id PK
        varchar name
        int subject_id FK
        int total_marks
    }
    exam_marks {
        int id PK
        int exam_id FK
        int student_id FK
        int internal_marks
        int external_marks
    }
    fees {
        int id PK
        int student_id FK
        int amount
        boolean paid
    }
    notices {
        int id PK
        varchar title
        varchar notice_type
        varchar audience
    }`;

    const dfd0 = `
flowchart LR
    A[ADMIN] -->|login creds, manage data| P((0. Student<br/>Management<br/>System))
    T[TEACHER] -->|login, attendance, marks| P
    S[STUDENT] -->|login, register, view| P
    P -->|credentials, confirmations| A
    P -->|confirmations| T
    P -->|result, fees, notices| S`;

    const dfd1 = `
flowchart TD
    A[ADMIN] -->|creds| P1[1. AUTH / Login]
    T[TEACHER] -->|creds| P1
    S[STUDENT] -->|creds / register| P1
    P1 --> D1[(D1 users)]
    P1 -->|token| A
    P1 -->|token| T
    P1 -->|token| S
    A -->|student CRUD| P2[2. STUDENT MODULE]
    P2 <--> D5[(D5 students)]
    A -->|teacher CRUD| P3[3. TEACHER MODULE]
    P3 <--> D3[(D3 teachers)]
    A -->|course/subject CRUD| P4[4. COURSE / SUBJECT]
    P4 <--> D2[(D2 courses)]
    P4 <--> D4[(D4 subjects)]
    A -->|mark attendance| P5[5. ATTENDANCE]
    T -->|mark attendance| P5
    P5 <--> D6[(D6 attendance)]
    A -->|create exam| P6[6. EXAM / MARKS]
    T -->|enter marks| P6
    P6 <--> D7[(D7 exams)]
    P6 <--> D8[(D8 exam_marks)]
    A -->|add fee / collect| P7[7. FEES]
    P7 <--> D9[(D9 fees)]
    A -->|post notice| P9[9. NOTICES]
    P9 <--> D10[(D10 notices)]
    S -->|view| P9
    T -->|view| P9
    P6 --> P8[8. DASHBOARD / REPORTS]
    P5 --> P8
    P7 --> P8
    P8 --> S`;

    content.innerHTML =
        `<div class="content-area">` +
        mermaidCard("ER Diagram — Data Model", er, "database") +
        mermaidCard("DFD Level 0 — Context Diagram", dfd0, "workflow") +
        mermaidCard("DFD Level 1 — Main Processes", dfd1, "workflow") +
        `</div>`;

    refreshIcons();
    try {
        await window.mermaid.run({ querySelector: ".mermaid" });
    } catch (e) {
        document.querySelectorAll(".mermaid").forEach(m => m.outerHTML = `<div class="glass-card">Mermaid render error: ${esc(e.message)}</div>`);
    }
}

RENDERERS.diagrams = renderDiagrams;

/* ============================================================
   ACCOUNT
   ============================================================ */

RENDERERS.account = async function () {
    content.innerHTML = card("Change Password", `
        <form id="passForm"><div class="form-grid">
            <input class="input" type="password" name="old_password" placeholder="Current Password" required>
            <input class="input" type="password" name="new_password" placeholder="New Password" required>
        </div>
        <button type="submit" class="btn btn-warning"><i data-lucide="key-round"></i> Update Password</button></form>`, "settings");
    document.getElementById("passForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        try { await api("/api/auth/password", "PUT", Object.fromEntries(new FormData(e.target).entries())); showAlert("Password updated"); e.target.reset(); }
        catch (err) { showAlert(err.message, "error"); }
    });
};

/* ============================================================
   INIT / EVENT BINDINGS
   ============================================================ */

document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
        const data = await api("/api/auth/login", "POST", {
            username: document.getElementById("loginUsername").value.trim(),
            password: document.getElementById("loginPassword").value,
        });
        token = data.token; role = data.role; fullName = data.full_name;
        localStorage.setItem("token", token);
        localStorage.setItem("role", role);
        localStorage.setItem("fullName", fullName);
        showAlert(`Welcome, ${fullName}`);
        showApp();
    } catch (err) { showAlert(err.message, "error"); }
});

document.getElementById("showForgotBtn").addEventListener("click", () => {
    document.getElementById("loginForm").classList.add("hidden");
    document.getElementById("forgotForm").classList.remove("hidden");
});
document.getElementById("backToLogin").addEventListener("click", () => {
    document.getElementById("forgotForm").classList.add("hidden");
    document.getElementById("loginForm").classList.remove("hidden");
});
document.getElementById("forgotForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
        await api("/api/auth/forgot", "POST", {
            username: document.getElementById("forgotUsername").value.trim(),
            new_password: document.getElementById("forgotNewPass").value,
        });
        showAlert("Password reset. Login now.");
        document.getElementById("forgotForm").reset();
        document.getElementById("backToLogin").click();
    } catch (err) { showAlert(err.message, "error"); }
});

/* ---- Student self-registration ---- */
async function loadRegisterCourses() {
    try {
        const courses = await (await fetch("/api/courses/public")).json();
        const sel = document.getElementById("regCourse");
        sel.innerHTML = '<option value="">Select Course</option>' +
            courses.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
    } catch (e) { /* courses optional */ }
}
document.getElementById("showRegisterBtn").addEventListener("click", async () => {
    document.getElementById("loginForm").classList.add("hidden");
    document.getElementById("registerForm").classList.remove("hidden");
    await loadRegisterCourses();
});
document.getElementById("backToLogin2").addEventListener("click", () => {
    document.getElementById("registerForm").classList.add("hidden");
    document.getElementById("loginForm").classList.remove("hidden");
});
document.getElementById("registerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
        const payload = {
            name: document.getElementById("regName").value.trim(),
            roll_number: document.getElementById("regRoll").value.trim(),
            username: document.getElementById("regUsername").value.trim(),
            password: document.getElementById("regPassword").value,
            email: document.getElementById("regEmail").value.trim(),
            phone: document.getElementById("regPhone").value.trim(),
            branch: document.getElementById("regBranch").value.trim(),
            semester: Number(document.getElementById("regSemester").value || 1),
            course_id: Number(document.getElementById("regCourse").value) || null,
        };
        const res = await fetch("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Registration failed");
        showAlert(data.message || "Account created");
        document.getElementById("registerForm").reset();
        document.getElementById("backToLogin2").click();
    } catch (err) { showAlert(err.message, "error"); }
});

document.getElementById("logoutBtn").addEventListener("click", logout);

if (typeof lucide !== "undefined") lucide.createIcons();

if (token) showApp();
