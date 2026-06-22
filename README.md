# ISOMAC - IT Asset Management System

[![GitHub](https://img.shields.io/badge/GitHub-Repository-blue)](https://github.com/SachinPal4355/ISOMAC)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-Enabled-blue)](Dockerfile)

**A comprehensive full-stack MERN application for managing IT assets, employees, and inventory**

[🚀 Try Demo](https://sachinpal4355-isomac.hf.space/) | [💻 GitHub](https://github.com/SachinPal4355/ISOMAC)


---

## 🎯 Features

### 🔐 Authentication & Security
- **Multi-Authentication**: Local, Google OAuth, SAML SSO, LDAP
- **Role-Based Access Control (RBAC)**: Admin, Editor, Viewer, Employee roles
- **Multi-Tenant Support**: Organization-based data isolation
- **Two-Factor Authentication (2FA)**: TOTP-based MFA
- **Audit Logging**: Complete activity tracking

### 📦 Asset Management
- Track IT assets with custom fields per category
- Dynamic field configuration for different asset types
- Asset assignment to employees
- Warranty and license expiry tracking
- Maintenance scheduling and logging

### 👥 Employee Management
- Comprehensive employee records
- Regional organization structure
- Asset assignment history
- Employee-specific custom fields

### 📊 Reports & Analytics
- Real-time dashboard with charts
- Custom report generation
- CSV/Excel import/export
- Asset utilization analytics

### 🔔 Alert System
- Automated alerts for warranty expiry
- License renewal notifications
- Maintenance due reminders
- Email notifications (configurable)

---

## 🔐 Demo Credentials

⚠️ **Important Notes:**
- This is a **Demo Mode** deployment
- All data is **reset when the container restarts**
- MongoDB runs in-memory without persistence
- Perfect for testing and showcasing features
- For production use, deploy with persistent database (MongoDB Atlas)

---

## 🛠️ Technology Stack

<table>
<tr>
<td>

**Frontend**
- ⚛️ React 19
- ⚡ Vite
- 🎨 TailwindCSS 4
- 📊 Chart.js
- 🔗 Axios
- 🧭 React Router

</td>
<td>

**Backend**
- 🟢 Node.js
- 🚂 Express 5
- 🍃 MongoDB
- 🔐 Passport.js
- 🎫 JWT
- 🛡️ Helmet
- ⏱️ Rate Limiting

</td>
</tr>
</table>

---

## 📱 Screenshots

### Dashboard
Track assets, employees, and maintenance at a glance with real-time analytics.

### Asset Management
Comprehensive asset tracking with custom fields per category.

### Employee Portal
Employees can view their assigned assets and submit IT requests.

---

## 🚀 Quick Start

### Run Locally


### Docker Deployment



## 📚 API Overview

### Authentication Endpoints
- `POST /login` - Local authentication
- `GET /auth/google` - Google OAuth
- `POST /auth/mfa/verify` - 2FA verification
- `POST /logout` - End session

### Asset Endpoints
- `GET /assets` - List all assets
- `POST /assets` - Create new asset
- `PUT /assets/:id` - Update asset
- `DELETE /assets/:id` - Delete asset

### Employee Endpoints
- `GET /employees` - List employees
- `POST /employees` - Create employee
- `PUT /employees/:id` - Update employee

For complete API documentation, see [API_DOCS.md](https://github.com/SachinPal4355/ISOMAC/blob/main/backend/API_DOCS.md)

---

## ⚙️ Configuration

### Environment Variables


## 🤝 Contributing

Contributions are welcome! Please check out the [GitHub repository](https://github.com/SachinPal4355/ISOMAC) for contribution guidelines.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 👤 Author

**Sachin Pal**

- 💼 GitHub: [@SachinPal4355](https://github.com/SachinPal4355)
- 📧 Email: pals85533@gmail.com
- 🌐 Portfolio: [GitHub Profile](https://github.com/SachinPal4355)

---

## 🙏 Acknowledgments

Built with modern web technologies and best practices. Special thanks to the open-source community for amazing tools and libraries.

---

## 🔗 Links

- **GitHub Repository**: https://github.com/SachinPal4355/ISOMAC
- **Report Issues**: https://github.com/SachinPal4355/ISOMAC/issues
- **Documentation**: https://github.com/SachinPal4355/ISOMAC#readme

---

<div align="center">

⭐ **If you find this project useful, please consider giving it a star on GitHub!** ⭐

Made with ❤️ by Sachin Pal

</div>
