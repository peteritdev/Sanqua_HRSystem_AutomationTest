document.addEventListener('DOMContentLoaded', () => {
  const companySelect = document.getElementById('company_id');
  const shiftSelect = document.getElementById('shift_id');
  const checklist = document.getElementById('employee-checklist');

  async function reload(companyId) {
    if (!companyId) {
      shiftSelect.innerHTML = '<option value="">-- pilih company dulu --</option>';
      checklist.innerHTML = '-- pilih company dulu --';
      return;
    }

    const [shifts, employees] = await Promise.all([
      fetch(`/lookup/shifts?company_id=${companyId}`).then((r) => r.json()),
      fetch(`/lookup/employees?company_id=${companyId}`).then((r) => r.json()),
    ]);

    shiftSelect.innerHTML =
      '<option value="">-- tidak pilih shift --</option>' + shifts.map((s) => `<option value="${s.id}">${s.name}</option>`).join('');

    if (!employees.length) {
      checklist.innerHTML = '<span class="muted">Tidak ada employee aktif utk company ini.</span>';
      return;
    }

    checklist.innerHTML = employees
      .map(
        (e) => `
        <label>
          <input type="checkbox" name="employee_ids" value="${e.id}">
          ${e.name} (${e.nik || '-'})
          ${e.is_shift ? '<span class="badge-shift">shift</span>' : ''}
        </label>
      `
      )
      .join('');
  }

  companySelect.addEventListener('change', () => reload(companySelect.value));
});
