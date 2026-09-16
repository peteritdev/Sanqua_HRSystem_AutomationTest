const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const TsLog = sequelize.define(
  'TsLog',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    run_id: { type: DataTypes.UUID, allowNull: false },
    module_name: { type: DataTypes.STRING(50), allowNull: false },
    condition_id: { type: DataTypes.INTEGER, allowNull: true },
    test_data_condition: { type: DataTypes.JSONB, allowNull: false },
    expected_result: { type: DataTypes.JSONB, allowNull: false },
    actual_result: { type: DataTypes.JSONB, allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false },
    error_message: { type: DataTypes.TEXT, allowNull: true },
    duration_ms: { type: DataTypes.INTEGER, allowNull: true },
    triggered_by: { type: DataTypes.STRING(100), allowNull: true },
    log_time: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    tableName: 'ts_logs',
    timestamps: false,
  }
);

module.exports = TsLog;
