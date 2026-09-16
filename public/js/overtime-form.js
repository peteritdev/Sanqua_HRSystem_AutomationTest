document.addEventListener('DOMContentLoaded', () => {
  const companySelect = document.getElementById('company_id');
  const employeeSelect = document.getElementById('employee_id');
  const shiftSelect = document.getElementById('shift_id');

  async function reloadEmployeesAndShifts(companyId) {
    if (!companyId) {
      employeeSelect.innerHTML = '<option value="">-- pilih company dulu --</option>';
      shiftSelect.innerHTML = '<option value="">-- tidak ada shift --</option>';
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
  }

  // Reload dropdown hanya saat user GANTI company - render awal (edit mode)
  // sudah diisi server-side supaya selected value tidak ke-reset.
  companySelect.addEventListener('change', () => {
    reloadEmployeesAndShifts(companySelect.value);
  });
});
