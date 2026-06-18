const express  = require('express');
const XLSX     = require('xlsx');
const Employee = require('../models/Employee');
const EmployeeAssetHistory = require('../models/EmployeeAssetHistory');
const { requireAuth, requireRole, enforceTenantScope } = require('../middleware/auth');

const router = express.Router();

// GET /employees — tenant-scoped
router.get('/', requireAuth, requireRole('editor'), enforceTenantScope, async (req, res) => {
  try {
    const filter = { ...req.tenantFilter };
    if (req.query.regionId) filter.regionId = req.query.regionId;

    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 200));
    const skip  = (page - 1) * limit;

    const [employees, total] = await Promise.all([
      Employee.find(filter)
        .populate('regionId', 'name departments')
        .populate('assets', 'assetTag name category status')
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Employee.countDocuments(filter),
    ]);
    res.json({ message: 'OK', data: employees, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (e) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /employees/export — tenant-scoped
router.get('/export', requireAuth, requireRole('admin', 'editor'), enforceTenantScope, async (req, res) => {
  try {
    const { format = 'csv', regionId, department, status } = req.query;
    const filter = { ...req.tenantFilter };
    if (regionId)   filter.regionId   = regionId;
    if (department) filter.department = department;
    if (status)     filter.status     = status;

    const employees = await Employee.find(filter).populate('regionId', 'name').sort({ name: 1 });

    const rows = employees.map(e => ({
      name:       e.name,
      email:      e.email,
      phone:      e.phone || '',
      department: e.department,
      region:     e.regionId?.name || '',
      role:       e.role,
      status:     e.status,
    }));

    const headers = ['name','email','phone','department','region','role','status'];

    if (format === 'xlsx') {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
      XLSX.utils.book_append_sheet(wb, ws, 'Employees');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="employees_export.xlsx"');
      return res.send(buf);
    }

    const csvRows = [headers, ...rows.map(r => headers.map(h => {
      const v = String(r[h] ?? '');
      return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g,'""')}"` : v;
    }))];
    const csv = '\uFEFF' + csvRows.map(r => r.join(',')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="employees_export.csv"');
    return res.send(csv);
  } catch (e) {
    console.error('[GET /employees/export]', e);
    res.status(500).json({ message: 'Export failed' });
  }
});

// POST /employees — stamp tenantId
router.post('/', requireAuth, requireRole('admin', 'editor'), enforceTenantScope, async (req, res) => {
  try {
    const { name, email, phone, department, regionId, role, status } = req.body;
    if (!name)       return res.status(400).json({ message: 'name required' });
    if (!email)      return res.status(400).json({ message: 'email required' });
    if (!department) return res.status(400).json({ message: 'department required' });
    if (!regionId)   return res.status(400).json({ message: 'regionId required' });
    if (!role)       return res.status(400).json({ message: 'role required' });

    const employee = new Employee({
      name, email, phone, department, regionId, role, status,
      tenantId:  req.tenantId || null,
      createdBy: req.authUser._id || null,
      domain:    req.authUser.domain || null,
    });
    await employee.save();
    await employee.populate('regionId');
    res.status(201).json({ message: 'Employee created', data: employee });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ message: 'email already exists' });
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /employees/:id/asset-history — tenant-scoped
router.get('/:id/asset-history', requireAuth, enforceTenantScope, async (req, res) => {
  try {
    // Verify the employee belongs to this tenant before returning history
    const employee = await Employee.findOne({ _id: req.params.id, ...req.tenantFilter }).lean();
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const history = await EmployeeAssetHistory
      .find({ employeeId: req.params.id, ...req.tenantFilter })
      .populate('assetId', 'assetTag name category')
      .sort({ date: -1 });
    res.json({ data: history });
  } catch (e) {
    console.error('[GET /employees/:id/asset-history]', e);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /employees/:id — tenant-scoped update
router.put('/:id', requireAuth, requireRole('admin', 'editor'), enforceTenantScope, async (req, res) => {
  try {
    const employee = await Employee.findOneAndUpdate(
      { _id: req.params.id, ...req.tenantFilter },
      req.body,
      { new: true, runValidators: true }
    ).populate('regionId');
    if (!employee) return res.status(404).json({ message: 'Not found' });
    res.json({ message: 'Employee updated', data: employee });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ message: 'email already exists' });
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /employees/:id — tenant-scoped delete
router.delete('/:id', requireAuth, requireRole('admin'), enforceTenantScope, async (req, res) => {
  try {
    const employee = await Employee.findOneAndDelete({ _id: req.params.id, ...req.tenantFilter });
    if (!employee) return res.status(404).json({ message: 'Not found' });
    res.json({ message: 'Employee deleted', data: employee });
  } catch (e) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
