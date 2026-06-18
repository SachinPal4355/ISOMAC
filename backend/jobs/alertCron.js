const cron = require('node-cron');
const { runAllChecks } = require('../services/alert.service');

/**
 * Runs daily at 8:00 AM — checks warranty, license, maintenance alerts
 */
function startAlertCron() {
  cron.schedule('0 8 * * *', async () => {
    console.log('[alert-cron] Running daily alert checks...');
    await runAllChecks({
      warrantyDays: parseInt(process.env.ALERT_WARRANTY_DAYS || '30'),
      licenseDays: parseInt(process.env.ALERT_LICENSE_DAYS || '30'),
      maintenanceDays: parseInt(process.env.ALERT_MAINTENANCE_DAYS || '3'),
    });
  }, { timezone: 'Asia/Kolkata' });

  console.log('[alert-cron] ✅ Scheduled daily at 08:00 AM');
}

module.exports = { startAlertCron };
