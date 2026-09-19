document.addEventListener('DOMContentLoaded', () => {
  const companySelect = document.getElementById('company_id');
  const shiftChecklist = document.getElementById('shift-checklist');
  const checklist = document.getElementById('employee-checklist');

  async function reload(companyId) {
    if (!companyId) {
      shiftChecklist.innerHTML = '-- pilih company dulu --';
      checklist.innerHTML = '-- pilih company dulu --';
      return;
    }

    const [shifts, employees] = await Promise.all([
      fetch(`/lookup/shifts?company_id=${companyId}`).then((r) => r.json()),
      fetch(`/lookup/employees?company_id=${companyId}`).then((r) => r.json()),
    ]);

    shiftChecklist.innerHTML = shifts.length
      ? shifts
          .map(
            (s) => `
        <label><input type="checkbox" name="shift_ids" value="${s.id}"> ${s.name}</label>
      `
          )
          .join('')
      : '<span class="muted">Tidak ada shift aktif utk company ini.</span>';

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
