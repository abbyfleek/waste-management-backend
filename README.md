# Waste Management System

A modern web application for managing waste collection and monitoring bin levels.

## Features

- User authentication (login/signup)
- QR code scanning for bin identification
- Real-time waste level monitoring
- Pickup scheduling
- Admin dashboard
- Mobile-responsive design

## Tech Stack

- Frontend: HTML, CSS, JavaScript, Bootstrap 5
- Backend: Node.js, Express.js
- Database: Supabase
- Authentication: Supabase Auth

## Setup Instructions

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Supabase account

### Backend Setup

1. Clone the repository
```bash
git clone https://github.com/yourusername/waste-management-system.git
cd waste-management-system/backend
```

2. Install dependencies
```bash
npm install
```

3. Create a `.env` file with your Supabase credentials:
```
PORT=3000
supabaseUrl=your_supabase_url
supabaseKey=your_supabase_key
```

4. Start the server
```bash
npm start
```

### Frontend Setup

1. Navigate to the frontend directory
```bash
cd ../frontend
```

2. Open `index.html` in your browser or serve it using a local server

## API Endpoints

- POST `/register` - User registration
- POST `/login` - User login
- GET `/bins/:binId` - Get bin information
- POST `/update-waste-level` - Update bin waste level
- POST `/reset-password` - Password reset

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details. 