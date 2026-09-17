document.addEventListener('DOMContentLoaded', () => {
  const companySelect = document.getElementById('company_id');
  const employeeSelect = document.getElementById('employee_id');
  const shiftSelect = document.getElementById('shift_id');
  const scheduleShiftSelects = Array.from(document.querySelectorAll('.schedule-shift-select'));

  async function reloadEmployeesAndShifts(companyId) {
    if (!companyId) {
      employeeSelect.innerHTML = '<option value="">-- pilih company dulu --</option>';
      shiftSelect.innerHTML = '<option value="">-- tidak ada shift --</option>';
      scheduleShiftSelects.forEach((sel) => {
        sel.innerHTML = '<option value="">-- pilih shift --</option>';
      });
      return;
    }

    const [employees, shifts] = await Promise.all([
      fetch(`/lookup/employees?company_id=${companyId}`).then((r) => r.json()),
      fetch(`/lookup/shifts?company_id=${companyId}`).then((r) => r.json()),
    ]);

    employeeSelect.innerHTML =
      '<option value="">-- pilih employee --</option>' +
      employees.map((e) => `<option value="${e.id}">${e.name} (${e.nik || '-'})</option>`).join('');

    shiftSelect.innerHTML =
      '<option value="">-- tidak ada shift --</option>' +
      shifts.map((s) => `<option value="${s.id}">${s.name}</option>`).join('');

    const scheduleOptionsHtml =
      '<option value="">-- pilih shift --</option>' + shifts.map((s) => `<option value="${s.id}">${s.name}</option>`).join('');
    scheduleShiftSelects.forEach((sel) => {
      sel.innerHTML = scheduleOptionsHtml;
    });
  }

  // Reload dropdown hanya saat user GANTI company - render awal (edit mode)
  // sudah diisi server-side supaya selected value tidak ke-reset.
  companySelect.addEventListener('change', () => {
    reloadEmployeesAndShifts(companySelect.value);
  });

  // Section "Employee Shift Schedule" - disable dropdown shift saat is_off dicentang
  // (nilainya nanti di-fallback otomatis di server, lihat runners/overtimeRunner.js).
  document.querySelectorAll('.schedule-is-off').forEach((checkbox) => {
    const target = document.getElementById(checkbox.dataset.target);
    if (!target) return;
    checkbox.addEventListener('change', () => {
      target.disabled = checkbox.checked;
      if (checkbox.checked) target.value = '';
    });
  });
});
