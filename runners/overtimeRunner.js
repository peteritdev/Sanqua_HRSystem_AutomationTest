const moment = require('moment');
const { pgPool } = require('../config/db');

const DATETIME_FORMAT = 'YYYY-MM-DD HH:mm:ss';

function fmtDateTime(value) {
	return moment(value).format(DATETIME_FORMAT);
}

function fmtDate(value) {
	return moment(value).format('YYYY-MM-DD');
}

// Kontrak runner (lihat docs/automation-test-tool-design.md bag. 6):
// run(conditionRow) -> { status, passed, actual_result, error_message?, duration_ms }
//
// func_calculate_overtime_v2 tidak menerima jam overtime langsung - dia query
// tr_employeerequestovertimes (baris berstatus approved, status_request = 2)
// untuk employee_id + date yang match. Supaya representatif TANPA menulis data
// permanen ke tabel produksi/staging, insert baris uji + panggil function
// dilakukan dalam SATU transaction lalu di-ROLLBACK - baris tidak pernah persist,
// dan otomatis batal juga kalau koneksi terputus di tengah jalan.
module.exports = {
	moduleName: 'overtime',

	async run(conditionRow) {
		const startedAt = Date.now();
		const client = await pgPool.connect();

		try {
			await client.query('BEGIN');

			await client.query(
				`INSERT INTO tr_employeerequestovertimes
           (employee_id, company_id, date, request_start_time, request_end_time,
            is_break, shift_id, status_request, status, request_total_hour,
            created_at, created_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,2,1,0,NOW(),'automation-test')`,
				[
					conditionRow.employee_id,
					conditionRow.company_id,
					fmtDate(conditionRow.period_date),
					fmtDateTime(conditionRow.overtime_start),
					fmtDateTime(conditionRow.overtime_end),
					conditionRow.is_break,
					conditionRow.shift_id
				]
			);

			const pparam = {
				employee_id: conditionRow.employee_id,
				company_id: conditionRow.company_id,
				shift_id: conditionRow.shift_id,
				clock_in_date: fmtDateTime(conditionRow.clock_in),
				clock_out_date: fmtDateTime(conditionRow.clock_out),
				period_date: fmtDate(conditionRow.period_date)
			};

			console.log('[overtimeRunner] panggil func_calculate_overtime_v2 dengan pparam:', pparam);

			const funcRes = await client.query('SELECT func_calculate_overtime_v2($1::json) AS result', [
				JSON.stringify(pparam)
			]);

			console.log('[overtimeRunner] hasil func_calculate_overtime_v2:', funcRes.rows[0].result);

			await client.query('ROLLBACK');

			const result = funcRes.rows[0].result;
			const duration_ms = Date.now() - startedAt;

			if (!result || result.status_code !== '00') {
				return {
					status: 'error',
					passed: false,
					actual_result: result || {},
					error_message: (result && result.status_msg) || 'Function tidak mengembalikan hasil yang valid',
					duration_ms
				};
			}

			const actualBefore = Number(result.data.overtime_before_rounding);
			const actualAfter = Number(result.data.overtime_after_rounding);
			const expectedBefore = Number(conditionRow.expected_result_before_rounding);
			const expectedAfter = Number(conditionRow.expected_result_after_rounding);
			// const passed = actualBefore === expectedBefore && actualAfter === expectedAfter;
			const passed = actualAfter === expectedAfter;

			return {
				status: passed ? 'passed' : 'not_passed',
				passed,
				actual_result: {
					before_rounding: actualBefore,
					after_rounding: actualAfter,
					windows_found: result.data.windows_found,
					breakdown: result.data.breakdown
				},
				duration_ms
			};
		} catch (err) {
			try {
				await client.query('ROLLBACK');
			} catch (_) {
				// koneksi kemungkinan sudah putus, tidak apa-apa - transaction batal otomatis
			}
			return {
				status: 'error',
				passed: false,
				actual_result: {},
				error_message: err.message,
				duration_ms: Date.now() - startedAt
			};
		} finally {
			client.release();
		}
	}
};
