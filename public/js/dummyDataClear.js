document.addEventListener('DOMContentLoaded', () => {
  const companySelect = document.getElementById('company_id');
  const checklist = document.getElementById('employee-checklist');
  if (!companySelect || !checklist) return; // halaman preview - form utama tidak dirender

  const preselect = window.__clearFormPreselect || { companyId: '', employeeIds: [] };

  async function reload(companyId, preselectedEmployeeIds) {
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
      .map((e) => {
        const checked = preselectedEmployeeIds.includes(String(e.id)) ? 'checked' : '';
        return `
        <label>
          <input type="checkbox" name="employee_ids" value="${e.id}" ${checked}>
          ${e.name} (${e.nik || '-'})
          ${e.is_shift ? '<span class="badge-shift">shift</span>' : ''}
        </label>
      `;
      })
      .join('');
  }

  companySelect.addEventListener('change', () => reload(companySelect.value, []));

  // Kalau baru selesai preview gagal validasi (formData ada company_id-nya), reload otomatis
  // supaya checklist ke-render lagi dgn employee yang sebelumnya dicentang tetap kecentang.
  if (preselect.companyId) {
    reload(preselect.companyId, preselect.employeeIds);
  }
});
