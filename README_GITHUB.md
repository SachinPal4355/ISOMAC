# ISOMAC - IT Asset Management System

A full-stack inventory and asset management application built with React, Node.js, Express, and MongoDB.

## 🎯 Overview

ISOMAC is a comprehensive asset management system designed to help organizations track IT assets, manage employee assignments, handle maintenance schedules, and generate reports. This is a personal project showcasing modern web development practices.

## ✨ Features

- 🔐 **Multi-Authentication**: Google OAuth, SAML SSO, LDAP, and local authentication
- 👥 **Multi-Tenant Support**: Organization and tenant-based access control
- 📦 **Asset Management**: Track IT assets with custom fields per category
- 👤 **Employee Management**: Manage employees with regional organization
- 🔧 **Maintenance Tracking**: Schedule and log maintenance activities
- 📊 **Reports & Analytics**: Generate comprehensive reports and visualizations
- 🔔 **Alert System**: Automated alerts for warranty/license expiry
- 📝 **Audit Logging**: Complete audit trail for all operations
- 🔒 **MFA Support**: Two-factor authentication with TOTP
- 📤 **Import/Export**: Bulk data import via CSV/Excel

## 🚀 Technology Stack

### Frontend
- **React 19** with Vite
- **TailwindCSS** for styling
- **Chart.js** for visualizations
- **Axios** for API calls
- **React Router** for navigation

### Backend
- **Node.js** with Express 5
- **MongoDB** with Mongoose ODM
- **Passport.js** for authentication
- **JWT** for token management
- **Helmet** for security headers
- **Rate limiting** for API protection

## 📦 Installation

### Prerequisites
- Node.js 16+ and npm
- MongoDB 5+

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/SachinPal4355/ISOMAC.git
   cd ISOMAC
   ```

2. **Setup Backend**
   ```bash
   cd backend
   npm install
   cp .env.example .env
   # Edit .env with your configuration
   npm start
   ```

3. **Setup Frontend**
   ```bash
   cd frontend-react
   npm install
   npm run dev
   ```

4. **Access the application**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:5000

## 🔧 Configuration

Create a `backend/.env` file based on `.env.example`:

```env
# MongoDB
MONGO_URI=mongodb://127.0.0.1:27017/isomac_db

# JWT & Session Secrets (generate with crypto.randomBytes(64))
SESSION_SECRET=your-session-secret
JWT_SECRET=your-jwt-secret

# Server
HOST=0.0.0.0
PORT=5000

# CORS
CORS_ORIGIN=http://localhost:5173

# Super Admin Credentials
SUPER_ADMIN_PASSWORD=YourStrongPassword

# Optional: Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-secret
GOOGLE_CALLBACK_URL=http://localhost:5000/auth/google/callback
```

## 🐳 Docker Deployment

```bash
docker build -t isomac .
docker run -p 7860:7860 isomac
```

## 🔐 Default Credentials

- **Username**: `sachinforoffice23`
- **Password**: Set via `SUPER_ADMIN_PASSWORD` in .env

⚠️ **Change default credentials immediately in production!**

## 📚 API Documentation

See [backend/API_DOCS.md](backend/API_DOCS.md) for complete API reference.

## 🧪 Testing

```bash
cd backend
npm test
```

## 📋 Project Structure

```
ISOMAC/
├── backend/              # Node.js/Express backend
│   ├── auth/            # Authentication providers
│   ├── controllers/     # Route controllers
│   ├── middleware/      # Custom middleware
│   ├── models/          # Mongoose models
│   ├── routes/          # API routes
│   ├── services/        # Business logic
│   └── server.js        # Entry point
├── frontend-react/      # React frontend
│   ├── src/
│   │   ├── components/  # Reusable components
│   │   ├── pages/       # Page components
│   │   ├── context/     # React context
│   │   └── services/    # API services
│   └── vite.config.js
└── Dockerfile           # Docker configuration
```

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/amazing-feature`)
3. Commit your changes (`git commit -m "feat: add amazing feature"`)
4. Push to the branch (`git push origin feat/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👤 Author

**Sachin Pal**
- GitHub: [@SachinPal4355](https://github.com/SachinPal4355)
- Email: pals85533@gmail.com

## 🙏 Acknowledgments

Built with modern web technologies and best practices in mind. Special thanks to the open-source community for the amazing tools and libraries.

## 🔗 Links

- **GitHub Repository**: https://github.com/SachinPal4355/ISOMAC
- **Hugging Face Space**: https://huggingface.co/spaces/SachinPal4355/ISOMAC
- **Live Demo**: Coming soon

---

⭐ If you find this project useful, please consider giving it a star on GitHub!
