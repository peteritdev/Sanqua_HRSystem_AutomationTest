function badgeHtml(status) {
  return `<span class="badge badge-${status || 'neutral'}">${status || 'belum pernah run'}</span>`;
}

// Cermin dari utils/timeFormat.js (server) - dipakai buat update DOM tanpa reload.
function decimalHoursToLabel(decimalHours) {
  if (decimalHours === null || decimalHours === undefined) return '-';
  const totalMinutes = Math.round(Number(decimalHours) * 60);
  const neg = totalMinutes < 0;
  const abs = Math.abs(totalMinutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${neg ? '-' : ''}${h}j ${m}m`;
}

function setRowRunning(row, running) {
  const btn = row.querySelector('.btn-run');
  if (btn) {
    btn.disabled = running;
    btn.textContent = running ? 'Running...' : 'RUN';
  }
}

function applyRunResult(row, data) {
  const actualCell = row.querySelector('.cell-actual');
  const statusCell = row.querySelector('.cell-status');
  const lastRunAtCell = row.querySelector('.cell-last-run-at');

  const before = data.actual_result ? data.actual_result.before_rounding : null;
  const after = data.actual_result ? data.actual_result.after_rounding : null;

  actualCell.textContent = `${decimalHoursToLabel(before)} / ${decimalHoursToLabel(after)}`;
  statusCell.innerHTML = badgeHtml(data.status);
  lastRunAtCell.textContent = new Date().toLocaleString('id-ID');

  if (data.status === 'error' && data.error_message) {
    actualCell.title = data.error_message;
  }
}

document.addEventListener('click', async (e) => {
  if (e.target.classList.contains('btn-run')) {
    const btn = e.target;
    const id = btn.dataset.id;
    const row = btn.closest('tr');
    setRowRunning(row, true);
    try {
      const res = await fetch(`/overtime/${id}/run`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal run test case');
      applyRunResult(row, data);
    } catch (err) {
      alert(`Run gagal: ${err.message}`);
    } finally {
      setRowRunning(row, false);
    }
  }
});

const runAllBtn = document.getElementById('btn-run-all');
if (runAllBtn) {
  runAllBtn.addEventListener('click', async () => {
    runAllBtn.disabled = true;
    runAllBtn.textContent = 'Running all...';
    const summaryBox = document.getElementById('run-all-summary');
    try {
      const res = await fetch('/overtime/run-all', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal run all');

      summaryBox.hidden = false;
      summaryBox.innerHTML = `Run selesai (run_id: <a href="/overtime/logs/${data.run_id}">${data.run_id}</a>) -
        Total: ${data.total}, Passed: ${data.passed}, Not Passed: ${data.not_passed}, Error: ${data.error}`;

      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      alert(`Run all gagal: ${err.message}`);
    } finally {
      runAllBtn.disabled = false;
      runAllBtn.textContent = 'RUN ALL CONDITIONS';
    }
  });
}
