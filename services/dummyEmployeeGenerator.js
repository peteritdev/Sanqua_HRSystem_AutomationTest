const moment = require('moment');
const { pgPool } = require('../config/db');

const FIRST_NAMES = [
	'Budi',
	'Agus',
	'Dedi',
	'Eko',
	'Rudi',
	'Hendra',
	'Andi',
	'Bambang',
	'Joko',
	'Wawan',
	'Sri',
	'Siti',
	'Dewi',
	'Rina',
	'Yuni',
	'Wati',
	'Ani',
	'Lestari',
	'Fitri',
	'Indah',
	'Ahmad',
	'Muhammad',
	'Fajar',
	'Doni',
	'Irwan',
	'Yusuf',
	'Taufik',
	'Rizki',
	'Gilang',
	'Putra',
	'Nur',
	'Nina',
	'Wulan',
	'Ratna',
	'Yulia',
	'Diah',
	'Ika',
	'Novi',
	'Maya',
	'Puji'
];

const SECOND_NAMES = [
	'Santoso',
	'Wijaya',
	'Kurniawan',
	'Setiawan',
	'Saputra',
	'Pratama',
	'Susanto',
	'Hidayat',
	'Firmansyah',
	'Gunawan',
	'Lestari',
	'Wulandari',
	'Anggraini',
	'Puspita',
	'Handayani',
	'Safitri',
	'Ramadhani',
	'Kusuma',
	'Permata',
	'Utami',
	'Nugroho',
	'Hakim',
	'Siregar',
	'Simanjuntak',
	'Wahyudi',
	'Purnomo',
	'Suryanto',
	'Maulana',
	'Ardiansyah',
	'Prasetyo'
];

const CITIES = [
	'Jakarta',
	'Bandung',
	'Surabaya',
	'Semarang',
	'Yogyakarta',
	'Bekasi',
	'Bogor',
	'Tangerang',
	'Cirebon',
	'Solo'
];

const STREETS = [
	'Jl. Merdeka',
	'Jl. Sudirman',
	'Jl. Diponegoro',
	'Jl. Gatot Subroto',
	'Jl. Ahmad Yani',
	'Jl. Melati',
	'Jl. Kenanga',
	'Jl. Mawar',
	'Jl. Anggrek',
	'Jl. Cendrawasih'
];

const EDUCATION_LEVELS = [ 'SMA', 'SMK', 'D3', 'S1', 'S2' ];
const EDUCATION_MAJORS = [ 'Teknik', 'Manajemen', 'Akuntansi', 'Ekonomi', 'Administrasi', 'Informatika' ];
const BLOOD_TYPES = [ 'A', 'B', 'AB', 'O' ];
// Berat ke 1 (Islam) mengikuti proporsi data asli (dominan) - lihat investigasi sebelumnya.
const RELIGIONS = [ 1, 1, 1, 1, 1, 2, 2, 3, 4, 6, 7 ];

function randomItem(arr) {
	return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDigits(length) {
	let s = '';
	for (let i = 0; i < length; i++) s += randomInt(0, 9);
	return s;
}

function randomDateBetweenYearsAgo(minYearsAgo, maxYearsAgo) {
	const now = moment();
	const daysAgo = randomInt(minYearsAgo * 365, maxYearsAgo * 365);
	return now.clone().subtract(daysAgo, 'days').format('YYYY-MM-DD');
}

async function generateNik() {
	const dateStr = moment().format('DDMMYYYY');
	// Retry kalau kebetulan bentrok - NIK bukan primary key (id yang PK), tapi tetap
	// dijaga unik biar gampang dibedakan per baris dummy.
	for (let attempt = 0; attempt < 10; attempt++) {
		const nik = `DUMMY-${dateStr}-${randomDigits(5)}`;
		const { rows } = await pgPool.query('SELECT 1 FROM ms_employees WHERE nik = $1', [ nik ]);
		if (!rows.length) return nik;
	}
	// Fallback ekstrem (harusnya nggak pernah kejadian dgn 100rb kombinasi/hari)
	return `DUMMY-${dateStr}-${randomDigits(5)}${randomDigits(3)}`;
}

function buildDummyEmployeeRow(firstName, secondName, nik) {
	const fullName = `${firstName} ${secondName}`;
	const gender = randomItem([ 1, 2 ]); // 1 = Laki-laki, 2 = Perempuan (konvensi data asli)
	const joinDate = randomDateBetweenYearsAgo(1, 5);
	const birthDate = moment()
		.subtract(randomInt(20, 55), 'years')
		.subtract(randomInt(0, 364), 'days')
		.format('YYYY-MM-DD');

	return {
		nik,
		name: fullName,
		company_id: 2,
		status: 1,
		is_delete: 0,
		email: `${firstName.toLowerCase()}.${secondName.toLowerCase()}${randomInt(1, 999)}@dummy.test`,
		gender,
		religion: randomItem(RELIGIONS),
		birth_place: randomItem(CITIES),
		birth_date: birthDate,
		no_identitas: randomDigits(16),
		address: `${randomItem(STREETS)} No. ${randomInt(1, 200)}, ${randomItem(CITIES)}`,
		mobile_phone_no: `08${randomDigits(9)}`,
		education_level: randomItem(EDUCATION_LEVELS),
		education_major: randomItem(EDUCATION_MAJORS),
		mariage_status: randomItem([ 0, 1 ]),
		blood_type: randomItem(BLOOD_TYPES),
		employee_status_id: 1,
		join_date: joinDate,
		contract_date: joinDate,
		company_name: 'PT INDOMULTIMAS PERKASA',
		total_leave_n: 12,
		total_leave_n_1: 0,
		fingerprint_id: randomDigits(7),
		last_attendance_status: 2,
		is_shift: true,
		auto_generate_payroll: true,
		bpjs_calculation_method: 1,
		created_at: new Date(),
		created_by_name: 'automation-dummy-generator'
	};
}

const COLUMNS = [
	'nik',
	'name',
	'company_id',
	'status',
	'is_delete',
	'email',
	'gender',
	'religion',
	'birth_place',
	'birth_date',
	'no_identitas',
	'address',
	'mobile_phone_no',
	'education_level',
	'education_major',
	'mariage_status',
	'blood_type',
	'employee_status_id',
	'join_date',
	'contract_date',
	'company_name',
	'total_leave_n',
	'total_leave_n_1',
	'fingerprint_id',
	'last_attendance_status',
	'is_shift',
	'auto_generate_payroll',
	'bpjs_calculation_method',
	'created_at',
	'created_by_name'
];

async function generateDummyEmployees(count) {
	const created = [];
	for (let i = 0; i < count; i++) {
		const firstName = randomItem(FIRST_NAMES);
		const secondName = randomItem(SECOND_NAMES);
		const nik = await generateNik();
		const row = buildDummyEmployeeRow(firstName, secondName, nik);

		const placeholders = COLUMNS.map((_, idx) => `$${idx + 1}`).join(',');
		const values = COLUMNS.map((col) => row[col]);

		const { rows } = await pgPool.query(
			`INSERT INTO ms_employees (${COLUMNS.join(',')}) VALUES (${placeholders}) RETURNING id, nik, name`,
			values
		);
		created.push(rows[0]);
	}
	return created;
}

async function getRecentDummyEmployees(limit = 50) {
	const { rows } = await pgPool.query(
		`SELECT id, nik, name, company_id, gender, join_date, created_at
     FROM ms_employees
     WHERE created_by_name = 'automation-dummy-generator'
     ORDER BY id DESC
     LIMIT $1`,
		[ limit ]
	);
	return rows;
}

module.exports = { generateDummyEmployees, getRecentDummyEmployees };
