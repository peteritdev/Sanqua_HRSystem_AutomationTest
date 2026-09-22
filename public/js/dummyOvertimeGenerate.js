document.addEventListener('DOMContentLoaded', () => {
  const companySelect = document.getElementById('company_id');
  const checklist = document.getElementById('employee-checklist');

  async function reload(companyId) {
    if (!companyId) {
      checklist.innerHTML = '-- pilih company dulu --';
      return;
    }

    const employees = await fetch(`/lookup/employees?company_id=${companyId}`).then((r) => r.json());

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
