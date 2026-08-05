const studentTableBody = document.getElementById("studentTableBody");
const alertBox = document.getElementById("alertBox");

function updateStats(students) {
    const total = students.length;
    document.getElementById("statTotal").textContent = total;

    if (total === 0) {
        document.getElementById("statAverage").textContent = "—";
        document.getElementById("statHighest").textContent = "—";
        document.getElementById("statPass").textContent = "—";
        return;
    }

    const marks = students.map(s => s.marks);
    const avg = Math.round(marks.reduce((a, b) => a + b, 0) / total);
    const highest = Math.max(...marks);
    const passed = marks.filter(m => m >= 60).length;
    const passRate = Math.round((passed / total) * 100);

    document.getElementById("statAverage").textContent = `${avg}%`;
    document.getElementById("statHighest").textContent = `${highest}%`;
    document.getElementById("statPass").textContent = `${passRate}%`;
}

function showAlert(message, type = "success") {
    alertBox.className = `alert alert-${type}`;
    alertBox.textContent = message;
    clearTimeout(showAlert._timer);
    showAlert._timer = setTimeout(() => {
        alertBox.className = "alert hidden";
    }, 3000);
}

function renderTable(students) {
    studentTableBody.innerHTML = "";

    if (!students || students.length === 0) {
        studentTableBody.innerHTML = `<tr><td colspan="5" class="empty-row">No student records available</td></tr>`;
        return;
    }

    students.forEach(student => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong>#${student.roll_number}</strong></td>
            <td>${student.name}</td>
            <td>${student.marks} / 100</td>
            <td><span class="grade-badge grade-${student.grade}">${student.grade}</span></td>
            <td style="text-align: right;">
                <button class="btn btn-danger" onclick="deleteStudent('${student.roll_number}')">
                    <i data-lucide="trash-2"></i>
                </button>
            </td>
        `;
        studentTableBody.appendChild(tr);
    });
    if (typeof lucide !== "undefined") lucide.createIcons();
}

async function loadStudents() {
    const res = await fetch("/api/students");
    const data = await res.json();
    renderTable(data);
    updateStats(data);
}

async function deleteStudent(rollNumber) {
    const res = await fetch(`/api/students/${rollNumber}`, { method: "DELETE" });
    const data = await res.json();
    showAlert(data.message || data.error, res.ok ? "success" : "error");
    loadStudents();
}

async function searchStudent(rollNumber) {
    const res = await fetch(`/api/students/${rollNumber}`);
    const data = await res.json();
    if (res.ok) {
        renderTable([data]);
        updateStats([data]);
    } else {
        showAlert(data.error, "error");
    }
}

document.getElementById("addStudentForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
        name: document.getElementById("addName").value,
        roll_number: document.getElementById("addRoll").value,
        marks: document.getElementById("addMarks").value
    };
    const res = await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    showAlert(data.error || `${data.name} added successfully`, res.ok ? "success" : "error");
    if (res.ok) {
        document.getElementById("addStudentForm").reset();
        loadStudents();
    }
});

document.getElementById("updateMarksForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
        marks: document.getElementById("updateMarks").value
    };
    const res = await fetch(`/api/students/${document.getElementById("updateRoll").value}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    showAlert(data.error || `${data.name} marks updated to ${data.marks}`, res.ok ? "success" : "error");
    if (res.ok) {
        document.getElementById("updateMarksForm").reset();
        loadStudents();
    }
});

document.getElementById("searchBtn").addEventListener("click", () => {
    const roll = document.getElementById("searchRoll").value.trim();
    if (roll) {
        searchStudent(roll);
    }
});

document.getElementById("resetBtn").addEventListener("click", () => {
    document.getElementById("searchRoll").value = "";
    loadStudents();
});

loadStudents();

if (typeof lucide !== "undefined") lucide.createIcons();
