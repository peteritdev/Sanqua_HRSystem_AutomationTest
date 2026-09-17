const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const TsMsOvertimeCondition = sequelize.define(
  'TsMsOvertimeCondition',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    // Auto-generate di DB (DEFAULT pakai sequence, lihat sql/002_add_test_case_code.sql) -
    // sengaja TIDAK allowNull:false di sini supaya Sequelize tidak validasi field ini
    // sebelum insert (nilainya baru ada setelah DB isi lewat DEFAULT).
    test_case_code: { type: DataTypes.STRING(30) },
    company_id: { type: DataTypes.INTEGER, allowNull: false },
    employee_id: { type: DataTypes.INTEGER, allowNull: false },
    test_case_name: { type: DataTypes.STRING(255), allowNull: false },
    shift_id: { type: DataTypes.INTEGER, allowNull: true },
    clock_in: { type: DataTypes.DATE, allowNull: false },
    clock_out: { type: DataTypes.DATE, allowNull: false },
    is_break: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    period_date: { type: DataTypes.DATEONLY, allowNull: false },
    overtime_start: { type: DataTypes.DATE, allowNull: false },
    overtime_end: { type: DataTypes.DATE, allowNull: false },
    test_objective: { type: DataTypes.TEXT, allowNull: true },
    expected_result_before_rounding: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    expected_result_after_rounding: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    actual_result_before_rounding: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    actual_result_after_rounding: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    last_run_status: { type: DataTypes.STRING(20), allowNull: true },
    last_run_at: { type: DataTypes.DATE, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    // Override sementara ms_employeeshiftschedules saat RUN (2 baris tetap) - opsional,
    // kosongkan tanggalnya kalau tidak perlu override roster. Lihat runners/overtimeRunner.js.
    schedule_1_date: { type: DataTypes.DATEONLY, allowNull: true },
    schedule_1_is_off: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    schedule_1_shift_id: { type: DataTypes.INTEGER, allowNull: true },
    schedule_2_date: { type: DataTypes.DATEONLY, allowNull: true },
    schedule_2_is_off: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    schedule_2_shift_id: { type: DataTypes.INTEGER, allowNull: true },
    created_by: { type: DataTypes.STRING(100), allowNull: true },
    updated_by: { type: DataTypes.STRING(100), allowNull: true },
  },
  {
    tableName: 'ts_ms_overtimeconditions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

module.exports = TsMsOvertimeCondition;
