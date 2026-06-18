/**
 * employee.service.js — Asset ↔ Employee linking helpers
 *
 * Both functions accept an optional session for transaction support
 * and tenantId for isolation verification.
 *
 * The tenantId check ensures an asset from Tenant A can never be
 * linked to an employee from Tenant B, even if both IDs are valid.
 */
const Asset               = require('../models/Asset');
const Employee            = require('../models/Employee');
const EmployeeAssetHistory = require('../models/EmployeeAssetHistory');

/**
 * Link an asset to an employee.
 * Verifies both documents belong to the same tenant before writing.
 *
 * @param {ObjectId} assetId
 * @param {ObjectId} employeeId
 * @param {ObjectId} performedBy  — userId of the actor
 * @param {ClientSession|null} session  — mongoose session for transactions
 * @param {ObjectId|null} tenantId  — if provided, validates ownership
 */
async function linkAssetToEmployee(assetId, employeeId, performedBy, session = null, tenantId = null) {
  // Verify tenant ownership when tenantId is provided
  if (tenantId) {
    const [asset, employee] = await Promise.all([
      Asset.findOne({ _id: assetId, tenantId }, '_id').lean(),
      Employee.findOne({ _id: employeeId, tenantId }, '_id').lean(),
    ]);
    if (!asset)    throw new Error(`Asset ${assetId} not found in tenant ${tenantId}`);
    if (!employee) throw new Error(`Employee ${employeeId} not found in tenant ${tenantId}`);
  }

  const opts = session ? { session } : {};
  await Asset.findByIdAndUpdate(assetId, { employeeRef: employeeId, status: 'Assigned' }, opts);
  await Employee.findByIdAndUpdate(employeeId, { $addToSet: { assets: assetId } }, opts);
  await EmployeeAssetHistory.create(
    [{ employeeId, assetId, action: 'assigned', performedBy, tenantId: tenantId || null }],
    opts
  );
}

/**
 * Unlink an asset from an employee.
 * Verifies both documents belong to the same tenant before writing.
 *
 * @param {ObjectId} assetId
 * @param {ObjectId} employeeId
 * @param {ObjectId} performedBy
 * @param {ClientSession|null} session
 * @param {ObjectId|null} tenantId
 */
async function unlinkAssetFromEmployee(assetId, employeeId, performedBy, session = null, tenantId = null) {
  if (tenantId) {
    const [asset, employee] = await Promise.all([
      Asset.findOne({ _id: assetId, tenantId }, '_id').lean(),
      Employee.findOne({ _id: employeeId, tenantId }, '_id').lean(),
    ]);
    if (!asset)    throw new Error(`Asset ${assetId} not found in tenant ${tenantId}`);
    if (!employee) throw new Error(`Employee ${employeeId} not found in tenant ${tenantId}`);
  }

  const opts = session ? { session } : {};
  await Asset.findByIdAndUpdate(assetId, { employeeRef: null, status: 'Available' }, opts);
  await Employee.findByIdAndUpdate(employeeId, { $pull: { assets: assetId } }, opts);
  await EmployeeAssetHistory.create(
    [{ employeeId, assetId, action: 'returned', performedBy, tenantId: tenantId || null }],
    opts
  );
}

module.exports = { linkAssetToEmployee, unlinkAssetFromEmployee };
